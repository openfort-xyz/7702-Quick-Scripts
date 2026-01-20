import { concat, Hex } from "viem";
import { optimismSepolia } from "viem/chains";
import { createOpenfortAccount } from "../../openfort7702"
import { ABI_PAYMASTER_V3 } from "../../openfort7702/abis";
import { PaymasterData } from "../../openfort7702/paymasterConstants";
import { http, createClient, publicActions, walletActions } from "viem";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
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

// Call for userOp
const calls = [{
    to: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as const,
    value: 0n,
    data: "0x" as const,
}];


// ------------------------------------------------------------------------------------
//
//                                  Execute Call
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
    //                           Create Paymaster Stub Data
    //
    // ------------------------------------------------------------------------------------

    const paymasterStubData = concat([
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER
    ]);

    userOp = {
        ...userOp,
        paymaster: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
        paymasterData: concat([
            paymasterStubData,
            PaymasterData.DUMMY_PAYMASTER_SIGNATURE
        ])
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
    //                    Sign UserOp and Paymaster Sequentially
    //
    // ------------------------------------------------------------------------------------

    const paymasterHash = await client.readContract({
        address: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
        abi: ABI_PAYMASTER_V3,
        functionName: 'getHash',
        args: [Number(PaymasterData.VERIFYING_MODE), toPackedUserOperation(userOp)]
    });

    const paymasterSignature = await paymasterSignerAccount.signMessage({
        message: { raw: paymasterHash }
    });

    userOp = {
        ...userOp,
        paymasterData: concat([
            PaymasterData.MODE,
            PaymasterData.VALID_UNTIL,
            PaymasterData.VALID_AFTER,
            paymasterSignature
        ])
    };

    const accountSignature = await openfortAccount.signUserOperation(userOp);

    userOp = {
        ...userOp,
        signature: accountSignature,
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
}


// Call it immediately
main().catch(console.error);
