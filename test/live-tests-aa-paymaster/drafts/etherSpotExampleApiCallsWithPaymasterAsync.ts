import createFreeBundler from "@etherspot/free-bundler";
import {
    Chain,
    concat,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    Hex,
    pad,
    parseUnits,
    publicActions,
    SignAuthorizationReturnType,
    toHex,
    TypedData,
    TypedDataDefinition,
    walletActions
} from "viem";
import {
    entryPoint08Abi,
    toSmartAccount,
    toPackedUserOperation
} from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia } from "viem/chains";
import dotenv from "dotenv";
import { ABI_7702_ACCOUNT } from "../../../src/data/abis";
import axios from 'axios';
import { helpers } from "../../../src/helpers/paymaster/paymasterData";
import { getHash } from "../../../src/helpers/paymaster/paymasterActions";
import { addressBook } from "../../../src/data/addressBook";

dotenv.config();

type Call = {
    to: Hex
    data?: Hex | undefined
    value?: bigint | undefined
}

const callType = {
    components: [
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
    ],
    type: 'tuple',
};

const main = async (
    chain: Chain
) => {
    const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);
    const paymasterSigner = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);
    const PAYMASTER_ADDRESS = addressBook.paymasterV9.address;

    const bundlerUrl = "https://rpc.erc4337.io/11155420";

    const bundlerClient = createFreeBundler({
        chain,
        bundlerUrl
    }).extend(publicActions).extend(walletActions);

    const entrypoint09Address = "0x433709009b8330fda32311df1c2afa402ed8d009";
    const implementation = "0x77020901f40BE88Df754E810dA9868933787652B";

    const openfortAccount = await toSmartAccount({
        client: bundlerClient,
        entryPoint: {
            abi: entryPoint08Abi,
            address: entrypoint09Address,
            version: "0.8" // using 0.8 temporarily, until viem supports 0.9
        },
        async encodeCalls(calls: readonly Call[]) {
            return encodeFunctionData({
                abi: ABI_7702_ACCOUNT,
                functionName: "execute",
                args: [
                    "0x0100000000000000000000000000000000000000000000000000000000000000", // mode_1
                    encodeAbiParameters(
                        [{ ...callType, type: 'tuple[]' }],
                        [calls.map((call) => {
                            return {
                                target: call.to,
                                value: call.value ?? 0n,
                                data: call.data ?? "0x"
                            }
                        })]
                    )
                ]
            })
        },
        async decodeCalls(data: Hex) {
            const res = decodeFunctionData({
                abi: ABI_7702_ACCOUNT,
                data
            });
            if (res.functionName === "executeBatch") {
                return res.args[0].map((call) => {
                    return {
                        to: call.target,
                        value: call.value,
                        data: call.data
                    }
                });
            }
            throw new Error("unknown call encoded: " + data);
        },
        authorization: {
            account: owner,
            address: implementation
        },
        async getNonce() {
            return bundlerClient.readContract({
                address: entrypoint09Address,
                abi: entryPoint08Abi,
                functionName: "getNonce",
                args: [owner.address, 1n]
            })
        },
        async getAddress() {
            return owner.address
        },
        async getFactoryArgs() {
            return { factory: '0x7702', factoryData: '0x' }
        },
        async getStubSignature() {
            return encodeAbiParameters(
                [
                    { type: 'uint256' },
                    { type: 'bytes' }
                ],
                [
                    0n,
                    "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
                ]
            );
        },
        async signMessage(parameters) {
            const { message } = parameters
            return await owner.signMessage({ message })
        },
        async signTypedData(parameters) {
            const { domain, types, primaryType, message } =
                parameters as TypedDataDefinition<TypedData, string>
            return await owner.signTypedData({
                domain,
                message,
                primaryType,
                types,
            })
        },
        async signUserOperation(parameters) {
            const { chainId = bundlerClient.chain.id, authorization, ...userOperation } = parameters
            const packedUserOp = toPackedUserOperation({ ...userOperation, sender: owner.address });
            const userOpHash = await bundlerClient.request({
                method: "eth_call",
                params: [
                    {
                        to: entrypoint09Address,
                        data: encodeFunctionData({
                            abi: entryPoint08Abi,
                            functionName: "getUserOpHash",
                            args: [packedUserOp]
                        })
                    },
                    "latest",
                    authorization ? {
                        [owner.address]: {
                            code: `0xef0100${implementation.toLowerCase().substring(2)}`
                        }
                    } : {}
                ]
            })

            const rawSignature = await owner.sign({
                hash: userOpHash as Hex
            })
            const sig = encodeAbiParameters(
                [
                    { type: 'uint256' },
                    { type: 'bytes' }
                ],
                [0n, rawSignature]
            );

            return sig;
        },
    });

    console.log("wallet:: ", openfortAccount.address);

    const senderCode = await bundlerClient.getCode({
        address: owner.address
    });

    const delegateAddress = openfortAccount.authorization?.address;
    let authorization: SignAuthorizationReturnType | undefined;
    if (delegateAddress && senderCode !== `0xef0100${delegateAddress.toLowerCase().substring(2)}`) {
        authorization = await bundlerClient.signAuthorization({
            account: owner,
            contractAddress: delegateAddress
        })
    }

    const gasFee = await axios.post(
        bundlerUrl,
        {
            'id': 11155420,
            'method': 'skandha_getGasPrice'
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("gasFee:: ", gasFee.data);

    const call: Call[] = [
        {
            to: "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1",
            value: parseUnits('0.00000001', 18)
        }
    ];

    // === ASYNC MODE IMPLEMENTATION ===
    // In async mode, both signatures can be computed in parallel because:
    // - Account signature uses paymasterData with MAGIC suffix (no pm signature yet)
    // - Paymaster signature uses paymasterData with placeholder + MAGIC
    // Final format: 140 bytes (address + gas limits + data + signature + length + magic)

    // Create dummy paymaster data for gas estimation (ASYNC format)
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const dummyValidAfter = 0;
    const dummyVerificationGasLimit = 150000n;
    const dummyPostOpGasLimit = 50000n;

    // Build complete dummy paymasterAndData with ASYNC format (140 bytes)
    const dummyPaymasterDataBase = helpers.createVerifyingModePaymasterData(dummyValidUntil, dummyValidAfter);
    const dummyPaymasterDataWithAsync = helpers.appendAsyncSignatureToPaymasterData(
        dummyPaymasterDataBase,
        helpers.DUMMY_SIG
    );
    const dummyPaymasterAndData = concat([
        PAYMASTER_ADDRESS,                                      // 20 bytes
        pad(toHex(dummyVerificationGasLimit), { size: 16 }),    // 16 bytes
        pad(toHex(dummyPostOpGasLimit), { size: 16 }),          // 16 bytes
        dummyPaymasterDataWithAsync                             // 88 bytes (1 mode + 6 validUntil + 6 validAfter + 65 sig + 2 length + 8 magic)
    ]) as Hex;

    console.log("\n=== Gas Estimation (ASYNC format) ===");
    console.log("Dummy paymasterAndData length:", (dummyPaymasterAndData.length - 2) / 2, "bytes (expected: 140)");

    const userOpGas = await axios.post(
        bundlerUrl,
        {
            "jsonrpc": "2.0",
            "method": "eth_estimateUserOperationGas",
            "params": [
                {
                    "sender": await openfortAccount.getAddress(),
                    "nonce": "0x0",
                    "initCode": "0x",
                    "callData": await openfortAccount.encodeCalls(call),
                    "callGasLimit": "0x0",
                    "verificationGasLimit": "0x0",
                    "preVerificationGas": "0x0",
                    "maxPriorityFeePerGas": "0x3b9aca00",
                    "maxFeePerGas": "0x7a5cf70d5",
                    "paymasterAndData": dummyPaymasterAndData,
                    "signature": await openfortAccount.getStubSignature()
                },
                entrypoint09Address
            ],
            "id": 11155420
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("estimation response:: ", userOpGas.data);

    // Setup for ASYNC mode
    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;

    const verificationGasLimit = BigInt(userOpGas.data.result.verificationGasLimit);
    const paymasterVerificationGasLimit = verificationGasLimit;
    const paymasterPostOpGasLimit = 50000n;

    console.log("\n=== ASYNC MODE: Parallel Signing ===");
    console.log("This allows both signatures to be computed simultaneously!");
    const signingStartTime = performance.now();

    // Prepare paymasterData for account signing (with MAGIC suffix, no signature)
    const paymasterDataForAccountSigning = helpers.createVerifyingModePaymasterDataAsync(validUntil, validAfter);
    const paymasterAndDataForAccountSigning = concat([
        PAYMASTER_ADDRESS,
        pad(toHex(paymasterVerificationGasLimit), { size: 16 }),
        pad(toHex(paymasterPostOpGasLimit), { size: 16 }),
        paymasterDataForAccountSigning  // mode + validUntil + validAfter + magic (21 bytes)
    ]) as Hex;

    // Prepare paymasterData for paymaster signing (with placeholder + MAGIC)
    const paymasterDataForPmSigning = helpers.createVerifyingModePaymasterDataAsyncWithPlaceholder(validUntil, validAfter);
    const paymasterAndDataForPmSigning = concat([
        PAYMASTER_ADDRESS,
        pad(toHex(paymasterVerificationGasLimit), { size: 16 }),
        pad(toHex(paymasterPostOpGasLimit), { size: 16 }),
        paymasterDataForPmSigning  // mode + validUntil + validAfter + uint16(0) + magic (23 bytes)
    ]) as Hex;

    console.log("Account signing uses paymasterAndData length:", (paymasterAndDataForAccountSigning.length - 2) / 2, "bytes");
    console.log("PM signing uses paymasterAndData length:", (paymasterAndDataForPmSigning.length - 2) / 2, "bytes");

    const nonce = await openfortAccount.getNonce();
    const callData = await openfortAccount.encodeCalls(call);

    let accountSignature: Hex;
    let paymasterSignature: Hex;

    // Sign both in parallel - THIS IS THE ASYNC ADVANTAGE!
    await Promise.all([
        // Parallel task 1: Sign account operation
        (async () => {
            console.log("� Starting account signature...");
            const sig = await openfortAccount.signUserOperation({
                sender: owner.address,
                nonce: nonce,
                initCode: '0x' as `0x${string}`,
                callData: callData,
                callGasLimit: BigInt(userOpGas.data.result.callGasLimit),
                verificationGasLimit: BigInt(userOpGas.data.result.verificationGasLimit),
                preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
                maxPriorityFeePerGas: BigInt(gasFee.data.result.maxPriorityFeePerGas),
                maxFeePerGas: BigInt(gasFee.data.result.maxFeePerGas),
                paymasterAndData: paymasterAndDataForAccountSigning as `0x${string}`,
                signature: '0x' as `0x${string}`
            });
            accountSignature = sig;
            console.log(" Account signature completed");
        })(),

        // Parallel task 2: Sign paymaster data
        (async () => {
            console.log("� Starting paymaster signature...");

            const callGasLimit = BigInt(userOpGas.data.result.callGasLimit);
            const maxPriorityFeePerGas = BigInt(gasFee.data.result.maxPriorityFeePerGas);
            const maxFeePerGas = BigInt(gasFee.data.result.maxFeePerGas);

            const accountGasLimits = concat([
                pad(toHex(verificationGasLimit), { size: 16 }),
                pad(toHex(callGasLimit), { size: 16 })
            ]);
            const gasFees = concat([
                pad(toHex(maxPriorityFeePerGas), { size: 16 }),
                pad(toHex(maxFeePerGas), { size: 16 })
            ]);

            const packedUserOpForPmHash = {
                sender: owner.address as `0x${string}`,
                nonce: nonce,
                initCode: '0x' as `0x${string}`,
                callData: callData as `0x${string}`,
                accountGasLimits: accountGasLimits as `0x${string}`,
                preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
                gasFees: gasFees as `0x${string}`,
                paymasterAndData: paymasterAndDataForPmSigning as `0x${string}`,
                signature: '0x' as `0x${string}`
            };

            const pmHash = await getHash(PAYMASTER_ADDRESS, bundlerClient, helpers.VERIFYING_MODE, packedUserOpForPmHash);
            console.log("Paymaster hash:", pmHash);

            const sig = await paymasterSigner.signMessage({
                message: { raw: pmHash as Hex }
            });
            paymasterSignature = sig;
            console.log(" Paymaster signature completed");
        })()
    ]);

    const signingEndTime = performance.now();
    console.log(`\n( Parallel signing took: ${(signingEndTime - signingStartTime).toFixed(2)}ms`);
    console.log("(Compare to sync mode which takes ~347ms)\n");

    // Build final paymasterAndData with ASYNC format (140 bytes)
    const paymasterDataBase = helpers.createVerifyingModePaymasterData(validUntil, validAfter);
    const paymasterDataWithAsyncSig = helpers.appendAsyncSignatureToPaymasterData(paymasterDataBase, paymasterSignature);

    const finalPaymasterAndData = concat([
        PAYMASTER_ADDRESS,
        pad(toHex(paymasterVerificationGasLimit), { size: 16 }),
        pad(toHex(paymasterPostOpGasLimit), { size: 16 }),
        paymasterDataWithAsyncSig  // mode + validUntil + validAfter + signature + length + magic
    ]) as Hex;

    console.log("=== Final ASYNC Paymaster Data ===");
    console.log("Final paymasterAndData length:", (finalPaymasterAndData.length - 2) / 2, "bytes");
    console.log("Expected: 140 bytes");
    console.log("Structure: 20 (address) + 16 (verificationGasLimit) + 16 (postOpGasLimit) +");
    console.log("           1 (mode) + 6 (validUntil) + 6 (validAfter) +");
    console.log("           65 (signature) + 2 (length) + 8 (magic)");
    console.log("\nPaymaster signature:", paymasterSignature);
    console.log("Account signature:", accountSignature);

    // // Send the UserOperation
    // console.log("\n=== Sending UserOperation ===");
    // const sendUserOperation = await axios.post(
    //     bundlerUrl,
    //     {
    //         'jsonrpc': '2.0',
    //         'method': 'eth_sendUserOperation',
    //         'params': [
    //             {
    //                 sender: owner.address,
    //                 nonce: toHex(nonce),
    //                 initCode: '0x',
    //                 callData: callData,
    //                 callGasLimit: userOpGas.data.result.callGasLimit,
    //                 verificationGasLimit: userOpGas.data.result.verificationGasLimit,
    //                 preVerificationGas: userOpGas.data.result.preVerificationGas,
    //                 maxPriorityFeePerGas: gasFee.data.result.maxPriorityFeePerGas,
    //                 maxFeePerGas: gasFee.data.result.maxFeePerGas,
    //                 paymasterAndData: finalPaymasterAndData,
    //                 signature: accountSignature
    //             },
    //             entrypoint09Address
    //         ],
    //         'id': bundlerClient.chain.id
    //     },
    //     {
    //         headers: {
    //             'Content-Type': 'application/json'
    //         }
    //     }
    // );

    // console.log("Response:", sendUserOperation.data);

    // if (sendUserOperation.data.result) {
    //     const userOpHash = sendUserOperation.data.result;
    //     console.log("\n UserOp hash:", userOpHash);

    //     console.log("\nWaiting for UserOperation to be mined...");
    //     let receipt = null;
    //     let attempts = 0;
    //     const maxAttempts = 60;

    //     while (!receipt && attempts < maxAttempts) {
    //         const response = await axios.post(
    //             bundlerUrl,
    //             {
    //                 'id': bundlerClient.chain.id,
    //                 'method': 'eth_getUserOperationReceipt',
    //                 'params': [userOpHash]
    //             },
    //             {
    //                 headers: {
    //                     'Content-Type': 'application/json'
    //                 }
    //             }
    //         );

    //         if (response.data.result) {
    //             receipt = response.data.result;
    //             console.log("\n UserOperation mined successfully!");
    //             console.log("Receipt:", response.data);
    //             break;
    //         } else {
    //             attempts++;
    //             process.stdout.write(`\rAttempt ${attempts}/${maxAttempts}...`);
    //             await new Promise(resolve => setTimeout(resolve, 2000));
    //         }
    //     }

    //     if (!receipt) {
    //         console.log("\nL Timeout: UserOperation receipt not found after 2 minutes");
    //     }
    // } else {
    //     console.log("\nL Error sending UserOperation");
    //     console.log("Error details:", sendUserOperation.data.error);
    // }

    const userOp =   {
                    sender: owner.address,
                    nonce: toHex(nonce),
                    initCode: '0x',
                    callData: callData,
                    callGasLimit: userOpGas.data.result.callGasLimit,
                    verificationGasLimit: userOpGas.data.result.verificationGasLimit,
                    preVerificationGas: userOpGas.data.result.preVerificationGas,
                    maxPriorityFeePerGas: gasFee.data.result.maxPriorityFeePerGas,
                    maxFeePerGas: gasFee.data.result.maxFeePerGas,
                    paymasterAndData: finalPaymasterAndData,
                    signature: accountSignature
                }

    console.log("userOp", userOp);
}

main(optimismSepolia).catch((error) => {
    console.error("\nL Script failed:", error);
    process.exit(1);
});
