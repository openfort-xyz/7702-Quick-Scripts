//   COMBINED_BYTE_PREFUND Mode (0x04)
//   ════════════════════════════════════════════════════════════════════════════════════════
//
//   PreFund Mode - Upfront token deposit with reconciliation
//
//   ┌─────────────────────────────────────────────────────────────────────────────────────┐
//   │                              HOW PREFUND WORKS                                      │
//   ├─────────────────────────────────────────────────────────────────────────────────────┤
//   │                                                                                     │
//   │  STEP 1: Validation Phase (validatePaymasterUserOp)                                │
//   │  ───────────────────────────────────────────────────────────────────────────────── │
//   │  • User specifies preFundInToken amount in paymasterData                           │
//   │  • Paymaster validates: preFundInToken <= estimated costInToken                    │
//   │  • If valid: tokens transferred FROM user TO treasury immediately                  │
//   │                                                                                     │
//   │  STEP 2: Execution Phase                                                           │
//   │  ───────────────────────────────────────────────────────────────────────────────── │
//   │  • UserOperation executes normally                                                 │
//   │  • Actual gas cost is tracked                                                      │
//   │                                                                                     │
//   │  STEP 3: PostOp Phase (Reconciliation)                                             │
//   │  ───────────────────────────────────────────────────────────────────────────────── │
//   │  • Calculate actual cost in tokens                                                 │
//   │  • If actualCost > preFund: user pays difference to treasury                       │
//   │  • If actualCost < preFund: treasury refunds difference to user                    │
//   │                                                                                     │
//   └─────────────────────────────────────────────────────────────────────────────────────┘
//
//   Example Scenario:
//   ─────────────────────────────────────────────────────────────────────────────────────────
//   User sets preFundInToken = 1.00 USDC
//
//   Validation: 1.00 USDC transferred from user → treasury
//
//   Case A: Actual cost = 0.80 USDC
//           Treasury refunds 0.20 USDC back to user
//
//   Case B: Actual cost = 1.20 USDC
//           User pays additional 0.20 USDC to treasury
//   ─────────────────────────────────────────────────────────────────────────────────────────
//
//   Use Cases:
//   ┌─────────────────┬──────────────────────────────────────────────────────────────────────┐
//   │    Use Case     │                             Description                              │
//   ├─────────────────┼──────────────────────────────────────────────────────────────────────┤
//   │ Escrow Pattern  │ Lock tokens upfront, refund unused portion                          │
//   ├─────────────────┼──────────────────────────────────────────────────────────────────────┤
//   │ Budget Control  │ User caps maximum spend with preFund amount                         │
//   ├─────────────────┼──────────────────────────────────────────────────────────────────────┤
//   │ Trust Building  │ Show users exact upfront cost, refund automatically                 │
//   └─────────────────┴──────────────────────────────────────────────────────────────────────┘


import { optimismSepolia } from "viem/chains";
import { createOpenfortAccount } from "../../openfort7702"
import { ABI_PAYMASTER_V3 } from "../../openfort7702/abis";
import { PaymasterData } from "../../openfort7702/paymasterConstants";
import { http, createClient, publicActions, walletActions, pad } from "viem";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { concat, Hex, toHex } from "viem";
import { formatUserOperationRequest, formatUserOperationGas, toPackedUserOperation } from "viem/account-abstraction";

import "dotenv/config"
import dotenv from "dotenv";
dotenv.config();

// ------------------------------------------------------------------------------------
//
//                                  Constant and Clients
//
// ------------------------------------------------------------------------------------

// 7702 owner account
const ownerAccount = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);

// Paymaster signer owner account
const paymasterSignerAccount = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

// Create Client
const client = createClient({
    account: ownerAccount,
    chain: optimismSepolia,
    transport: http()
})
    .extend(publicActions)
    .extend(walletActions);

// Call for userOp actual call
const calls = [
    {
        to: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as Hex,
        value: 0n,
        data: "0x" as Hex,
    }
];


// ------------------------------------------------------------------------------------
//
//                        Execute Call with PreFund Mode
//
// ------------------------------------------------------------------------------------

const main = async () => {
    // Create Openfort Account
    const openfortAccount = await createOpenfortAccount({
        client,
        owner: ownerAccount,
    });

    // Create Bundler Client
    const BUNDLER_API_URL = "http://0.0.0.0:3000";
    const bundlerClient = createBundlerClient({
        account: openfortAccount,
        client,
        transport: http(BUNDLER_API_URL, {
            fetchOptions: {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
                },
            },
        }),
    });

    // ------------------------------------------------------------------------------------
    //
    //                               Create UserOperation
    //
    // ------------------------------------------------------------------------------------

    const gasPrice = await client.estimateFeesPerGas()

    let userOp: UserOperation<'0.9'> = {
        sender: await openfortAccount.getAddress(),
        nonce: await openfortAccount.getNonce(),
        callData: await openfortAccount.encodeCalls(calls),
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        signature: await openfortAccount.getStubSignature(),
    }

    // ------------------------------------------------------------------------------------
    //
    //                    Create Paymaster Stub Data with PreFund
    //
    // ------------------------------------------------------------------------------------

    // Structure for ERC20 mode with preFund (combinedByte = 0x04):
    // - MODE_ERC20 (1 byte)
    // - COMBINED_BYTE_PREFUND (1 byte) - 0x04
    // - validUntil (6 bytes)
    // - validAfter (6 bytes)
    // - token (20 bytes)
    // - postOpGas (16 bytes)
    // - exchangeRate (32 bytes)
    // - paymasterValidationGasLimit (16 bytes)
    // - treasury (20 bytes)
    // - preFundInToken (16 bytes) - ADDED for preFundPresent
    // - signature (65 bytes) + async suffix
    //
    // Order of optional fields: preFund → constantFee → recipient

    const paymasterStubData = concat([
        PaymasterData.MODE_ERC20,
        PaymasterData.COMBINED_BYTE_PREFUND,  // 0x04 - preFundPresent
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.ERC20_ADDRESS,
        pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
        pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
        pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT_PREFUND), { size: 16 }),
        PaymasterData.TREASURY,
        pad(toHex(PaymasterData.PREFUND_IN_TOKEN), { size: 16 }),  // preFundInToken field (16 bytes)
    ]);

    userOp = {
        ...userOp,
        paymaster: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
        paymasterData: paymasterStubData,
        paymasterSignature: PaymasterData.DUMMY_PAYMASTER_SIGNATURE,
    }

    // ------------------------------------------------------------------------------------
    //
    //                              Estimate User Operation
    //
    // ------------------------------------------------------------------------------------

    const estimateResult = await bundlerClient.request({
        method: 'eth_estimateUserOperationGas',
        params: [
            formatUserOperationRequest(userOp),
            openfortAccount.entryPoint.address
        ],
    });

    console.log("estimateResult", estimateResult);
    userOp = {
        ...userOp,
        ...formatUserOperationGas(estimateResult),
        // Override paymasterVerificationGasLimit for preFund mode
        // PreFund requires safeTransferFrom during validation which needs more gas
        paymasterVerificationGasLimit: 200_000n,
    }

    // ------------------------------------------------------------------------------------
    //
    //                    Sign UserOp and Paymaster in Parallel (Async)
    //
    // ------------------------------------------------------------------------------------

    const [accountSignature, paymasterSignature] = await Promise.all([
        (async () => {
            return await openfortAccount.signUserOperation(userOp);
        })(),

        (async () => {
            // Mode 1 = ERC20_MODE for getHash
            const paymasterHash = await client.readContract({
                address: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
                abi: ABI_PAYMASTER_V3,
                functionName: 'getHash',
                args: [1, toPackedUserOperation(userOp)]
            });

            return await paymasterSignerAccount.signMessage({
                message: { raw: paymasterHash }
            });
        })()
    ]);

    userOp = {
        ...userOp,
        signature: accountSignature,
        paymasterData: concat([
            PaymasterData.MODE_ERC20,
            PaymasterData.COMBINED_BYTE_PREFUND,  // 0x04 - preFundPresent
            PaymasterData.VALID_UNTIL,
            PaymasterData.VALID_AFTER,
            PaymasterData.ERC20_ADDRESS,
            pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
            pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
            pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT_PREFUND), { size: 16 }),
            PaymasterData.TREASURY,
            pad(toHex(PaymasterData.PREFUND_IN_TOKEN), { size: 16 }),  // preFundInToken field (16 bytes)
        ]),
        paymasterSignature: paymasterSignature
    }

    // ------------------------------------------------------------------------------------
    //
    //                                Send User Operation
    //
    // ------------------------------------------------------------------------------------

    const finalUserOpHash = await bundlerClient.request({
        method: 'eth_sendUserOperation',
        params: [
            formatUserOperationRequest(userOp),
            openfortAccount.entryPoint.address
        ],
    });

    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash });
    console.log('UserOperationReceipt:', receipt)
    console.log('Transaction hash:', receipt.receipt.transactionHash)
    console.log('PreFund amount:', PaymasterData.PREFUND_IN_TOKEN.toString(), 'token units')
}


// Call it immediately
main().catch(console.error);
