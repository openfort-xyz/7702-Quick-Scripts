import { concat, Hex } from "viem";
import { createOpenfortAccount } from "./openfort7702"
import { ABI_PAYMASTER_V3 } from "./openfort7702/abis";
import { OPEN_LOOT_CHAIN } from "./openfort7702/chainConstatnts";
import { PaymasterData } from "./openfort7702/paymasterConstants";
import { http, createClient, publicActions, walletActions } from "viem";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { privateKeyToAccount, SignAuthorizationReturnType } from "viem/accounts";
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
    chain: OPEN_LOOT_CHAIN,
    transport: http()
})
    .extend(publicActions)
    .extend(walletActions);

// Call for userOp
const calls = [{
    to: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as const,
    value: 0n,
    data: "0x" as const,
}];


// ------------------------------------------------------------------------------------
//
//                                  Register Key
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

    // This is required for Alto bundler to apply state overrides during signature validation
    const authorization: SignAuthorizationReturnType = await client.signAuthorization(openfortAccount.authorization!);

    // Get gas price from bundler
    const gasPrice = await client.estimateFeesPerGas()

    let userOp: UserOperation<'0.8'> = {
        sender: await openfortAccount.getAddress(),
        nonce: await openfortAccount.getNonce(),
        callData: await openfortAccount.encodeCalls(calls),
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        signature: await openfortAccount.getStubSignature(),
        authorization,
    }

    // ------------------------------------------------------------------------------------
    //
    //                           Create Paymaster Stub Data
    //
    // ------------------------------------------------------------------------------------

    const paymasterStubData = concat([
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.DUMMY_PAYMASTER_SIGNATURE,
        PaymasterData.SIGNATURE_LENGTHS,
        PaymasterData.PAYMASTER_SIG_MAGIC,
    ]);

    userOp = {
        ...userOp,
        paymaster: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
        paymasterData: paymasterStubData,
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
    //                    Sign UserOp and Paymaster in Parallel
    //
    // ------------------------------------------------------------------------------------

    const [accountSignature, paymasterSignature] = await Promise.all([
        // Account signing task
        (async () => {
            const userOpForAccount = { ...userOp };
            userOpForAccount.paymasterData = concat([
                PaymasterData.MODE,
                PaymasterData.VALID_UNTIL,
                PaymasterData.VALID_AFTER,
                PaymasterData.PAYMASTER_SIG_MAGIC,
            ]);
            return await openfortAccount.signUserOperation(userOpForAccount);
        })(),

        // Paymaster signing task
        (async () => {
            const userOpForPaymaster = { ...userOp };
            userOpForPaymaster.paymasterData = concat([
                PaymasterData.MODE,
                PaymasterData.VALID_UNTIL,
                PaymasterData.VALID_AFTER,
            ]);

            const paymasterHash = await client.readContract({
                address: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
                abi: ABI_PAYMASTER_V3,
                functionName: 'getHash',
                args: [Number(PaymasterData.VERIFYING_MODE), toPackedUserOperation(userOpForPaymaster)]
            });

            return await paymasterSignerAccount.signMessage({
                message: { raw: paymasterHash }
            });
        })()
    ]);

    // Combine both signatures
    userOp = {
        ...userOp,
        signature: accountSignature,
        paymasterData: concat([
            PaymasterData.MODE,
            PaymasterData.VALID_UNTIL,
            PaymasterData.VALID_AFTER,
            paymasterSignature,
            PaymasterData.SIGNATURE_LENGTHS,
            PaymasterData.PAYMASTER_SIG_MAGIC
        ])
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

    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash })
    console.log('UserOperationReceipt:', receipt)
    console.log('Transaction hash:', receipt.receipt.transactionHash)
}


// Call it immediately
main().catch(console.error);
