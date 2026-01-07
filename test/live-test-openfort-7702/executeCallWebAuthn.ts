import { concat, Hex, toHex, pad } from "viem";
import { KEY_TYPE } from "./openfort7702/interfaces";
import { ABI_PAYMASTER_V3 } from "./openfort7702/abis";
import { OPEN_LOOT_CHAIN } from "./openfort7702/chainConstatnts";
import { PaymasterData } from "./openfort7702/paymasterConstants";
import { createOpenfortAccount, ENTRYPOINT_ADDRESS } from "./openfort7702"
import { privateKeyToAccount, SignAuthorizationReturnType } from "viem/accounts";
import { http, createClient, publicActions, walletActions, encodeAbiParameters } from "viem";
import { createBundlerClient, entryPoint08Abi, UserOperation } from "viem/account-abstraction";
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

    const nonce = await client.readContract({
        abi: entryPoint08Abi,
        address: ENTRYPOINT_ADDRESS,
        functionName: "getNonce",
        args: [openfortAccount.address, 0n],
    });

    console.log("nonce", nonce);

    let userOp: UserOperation<'0.8'> = {
        sender: await openfortAccount.getAddress(),
        nonce: nonce,
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

    // // ------------------------------------------------------------------------------------
    // //
    // //                    Sign UserOp and Paymaster in Parallel
    // //
    // // ------------------------------------------------------------------------------------

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

            const userOpHash = await client.readContract({
                address: ENTRYPOINT_ADDRESS,
                abi: entryPoint08Abi,
                functionName: 'getUserOpHash',
                args: [toPackedUserOperation(userOpForAccount)]
            });
            console.log("userOpHash:", userOpHash);
            return await wrapSignature() as Hex;
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

    console.log("userOp", toPackedUserOperation(userOp));

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

// ------------------------------------------------------------------------------------
//
//                                Signature Wrapper
//
// ------------------------------------------------------------------------------------

async function wrapSignature(): Promise<Hex> {
    const pk = {
        x: '0x8b945dc1f4a3877208944e8244fde736be9b002c5468695f54604b2cf749ed67' as Hex,
        y: '0x0ffbdcfccab58d8d4f9b34699095bf67aca0cf02e9607e0be2029f2f2fece140' as Hex,
    }
    const requireUserVerification: boolean = true;
    const authenticatorData: Hex = '0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000' as Hex;
    const clientDataJSON: string = "{\"type\":\"webauthn.get\",\"challenge\":\"55-dm6TunyNiRokYdql0KFh8J6YO6DDS_lEJgwd3dX0\",\"origin\":\"http://localhost:3000\"crossOrigin\":false";
    const challengeIndex: bigint = 23n;
    const typeIndex: bigint = 1n;
    const r: Hex = '0x362890f84f2e5047c9d71a33d0168fe548ea0bbe4f0a5b350df8783a6d8c254c' as Hex;
    const s: Hex = '0x4b9d4e01e0edd7c6ec1500866a87c9e6708a1cc3dd9a7ae7342c2b8529e86c68' as Hex;

    const inner = encodeAbiParameters(
        [
            { type: 'bool' },
            { type: 'bytes' },
            { type: 'string' },
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'bytes32' },
            { type: 'bytes32' },
            { type: 'tuple', components: [{ type: 'bytes32', name: 'x' }, { type: 'bytes32', name: 'y' }] }
        ],
        [
            requireUserVerification,
            authenticatorData,
            clientDataJSON,
            challengeIndex,
            typeIndex,
            r,
            s,
            pk
        ]
    );

    const packedSig = encodeAbiParameters(
        [
            { type: 'uint256' },
            { type: 'bytes' }
        ],
        [BigInt(KEY_TYPE.WEBAUTHN), inner]
    );

    return packedSig;
}

// Call it immediately
main().catch(console.error);
