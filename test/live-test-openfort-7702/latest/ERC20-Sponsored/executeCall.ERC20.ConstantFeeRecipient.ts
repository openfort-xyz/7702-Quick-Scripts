//   COMBINED_BYTE_CONSTANT_FEE_RECIPIENT Mode (0x03)
//   ════════════════════════════════════════════════════════════════════════════════════════
//
//   This mode combines TWO features:
//   ┌─────────────────┬─────────────────────────────────────────────────────────────────────┐
//   │    Feature      │                             Description                             │
//   ├─────────────────┼─────────────────────────────────────────────────────────────────────┤
//   │ constantFee     │ Fixed fee added to gas cost (e.g., protocol service fee)           │
//   │ (bit 0 = 0x01)  │ User always pays: actualGasCost + constantFee                       │
//   ├─────────────────┼─────────────────────────────────────────────────────────────────────┤
//   │ recipient       │ Address that receives excess tokens when preFund > actualCost      │
//   │ (bit 1 = 0x02)  │ Excess = preFundInToken - (actualCost + constantFee) → recipient   │
//   └─────────────────┴─────────────────────────────────────────────────────────────────────┘
//
//   Combined byte: 0x03 = 0b011 (constantFee ON, recipient ON, preFund OFF)
//
//   Example Scenario:
//   ─────────────────────────────────────────────────────────────────────────────────────────
//   Alice uses a dApp with this paymaster mode.
//
//   constantFee: 0.10 USDC (protocol fee)
//   Gas estimated: 500,000 gas → reserved: 1.50 USDC
//   Gas actually used: 300,000 gas → actual: 0.90 USDC
//
//   User pays: 0.90 (gas) + 0.10 (fee) = 1.00 USDC
//   Excess: 1.50 - 1.00 = 0.50 USDC → sent to recipient (dApp)
//   ─────────────────────────────────────────────────────────────────────────────────────────


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
//                   Execute Call with Constant Fee + Recipient Mode
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
    //              Create Paymaster Stub Data with Constant Fee + Recipient
    //
    // ------------------------------------------------------------------------------------

    // Structure for ERC20 mode with constantFee + recipient (combinedByte = 0x03):
    // - MODE_ERC20 (1 byte)
    // - COMBINED_BYTE_CONSTANT_FEE_RECIPIENT (1 byte) - 0x03
    // - validUntil (6 bytes)
    // - validAfter (6 bytes)
    // - token (20 bytes)
    // - postOpGas (16 bytes)
    // - exchangeRate (32 bytes)
    // - paymasterValidationGasLimit (16 bytes)
    // - treasury (20 bytes)
    // - constantFee (16 bytes) - for constantFeePresent
    // - recipient (20 bytes) - for recipientPresent
    // - signature (65 bytes) + async suffix
    //
    // Order of optional fields: preFund → constantFee → recipient

    const paymasterStubData = concat([
        PaymasterData.MODE_ERC20,
        PaymasterData.COMBINED_BYTE_CONSTANT_FEE_RECIPIENT,  // 0x03 - constantFee + recipient
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.ERC20_ADDRESS,
        pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
        pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
        pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT), { size: 16 }),
        PaymasterData.TREASURY,
        pad(toHex(PaymasterData.CONSTANT_FEE), { size: 16 }),  // constantFee field (16 bytes)
        PaymasterData.RECIPIENT,  // recipient field (20 bytes)
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
            PaymasterData.COMBINED_BYTE_CONSTANT_FEE_RECIPIENT,  // 0x03 - constantFee + recipient
            PaymasterData.VALID_UNTIL,
            PaymasterData.VALID_AFTER,
            PaymasterData.ERC20_ADDRESS,
            pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
            pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
            pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT), { size: 16 }),
            PaymasterData.TREASURY,
            pad(toHex(PaymasterData.CONSTANT_FEE), { size: 16 }),  // constantFee field (16 bytes)
            PaymasterData.RECIPIENT,  // recipient field (20 bytes)
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
    console.log('Constant fee applied:', PaymasterData.CONSTANT_FEE.toString(), 'token units')
    console.log('Recipient address:', PaymasterData.RECIPIENT)
}


// Call it immediately
main().catch(console.error);
