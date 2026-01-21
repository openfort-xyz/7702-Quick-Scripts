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
//                       Execute Call with Recipient Mode
//
// ------------------------------------------------------------------------------------

/**
 * recipientPresent Mode (combinedByte = 0x02)
 *
 * When recipientPresent is set, a recipient address is included in paymasterData.
 * In postOp, if preFundInToken > actualCost, the excess tokens are sent to the
 * recipient address instead of staying with the user.
 *
 * Use Cases:
 * - Referral/Affiliate systems: dApp earns from unused gas
 * - Fee sharing: Protocol takes excess as service fee
 * - Donations: Excess funds go to charity/community treasury
 *
 * Example:
 *   User pre-funds: 1.00 USDC
 *   Actual gas cost: 0.75 USDC
 *   Excess: 0.25 USDC → sent to recipient address
 */

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
    //                    Create Paymaster Stub Data with Recipient
    //
    // ------------------------------------------------------------------------------------

    // Structure for ERC20 mode with recipient (combinedByte = 0x02):
    // - MODE_ERC20 (1 byte)
    // - COMBINED_BYTE_RECIPIENT (1 byte) - 0x02
    // - validUntil (6 bytes)
    // - validAfter (6 bytes)
    // - token (20 bytes)
    // - postOpGas (16 bytes)
    // - exchangeRate (32 bytes)
    // - paymasterValidationGasLimit (16 bytes)
    // - treasury (20 bytes)
    // - recipient (20 bytes) - ADDED for recipientPresent
    // - signature (65 bytes) + async suffix

    const paymasterStubData = concat([
        PaymasterData.MODE_ERC20,
        PaymasterData.COMBINED_BYTE_RECIPIENT,  // 0x02 - recipientPresent
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.ERC20_ADDRESS,
        pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
        pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
        pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT), { size: 16 }),
        PaymasterData.TREASURY,
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
            PaymasterData.COMBINED_BYTE_RECIPIENT,  // 0x02 - recipientPresent
            PaymasterData.VALID_UNTIL,
            PaymasterData.VALID_AFTER,
            PaymasterData.ERC20_ADDRESS,
            pad(toHex(PaymasterData.POST_GAS_LIMIT), { size: 16 }),
            pad(toHex(BigInt(PaymasterData.EXCHANGE_RATE)), { size: 32 }),
            pad(toHex(PaymasterData.PAYMASTER_VALIDATION_GAS_LIMIT), { size: 16 }),
            PaymasterData.TREASURY,
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
    console.log('Recipient address:', PaymasterData.RECIPIENT)
}


// Call it immediately
main().catch(console.error);
