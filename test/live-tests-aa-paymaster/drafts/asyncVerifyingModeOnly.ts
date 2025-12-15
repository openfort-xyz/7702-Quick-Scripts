import createFreeBundler from "@etherspot/free-bundler";
import {
    Chain,
    concat,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    getAddress,
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
    console.log("\n=== Async VERIFYING_MODE Test ===\n");

    const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);
    const paymasterSigner = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

    const PAYMASTER_ADDRESS = addressBook.paymasterV9.address;
    const ENTRYPOINT_ADDRESS = "0x433709009b8330fda32311df1c2afa402ed8d009";
    const IMPLEMENTATION_ADDRESS = "0x77020901f40BE88Df754E810dA9868933787652B";

    const bundlerUrl = "https://rpc.erc4337.io/11155420";

    const bundlerClient = createFreeBundler({
        chain,
        bundlerUrl
    }).extend(publicActions).extend(walletActions);

    console.log("Owner address:", owner.address);
    console.log("Paymaster signer:", paymasterSigner.address);
    console.log("Paymaster address:", PAYMASTER_ADDRESS);

    // Create smart account
    const openfortAccount = await toSmartAccount({
        client: bundlerClient,
        entryPoint: {
            abi: entryPoint08Abi,
            address: ENTRYPOINT_ADDRESS,
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
                        data: call.data,
                    } as Call;
                });
            } else if (res.functionName === "execute") {
                return [{
                    to: res.args[0] as Hex,
                    value: res.args[1] as bigint,
                    data: res.args[2] as Hex,
                } as Call];
            }
            throw new Error("cannot decode calls");
        },
        async getAddress() {
            return owner.address
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
        async signMessage({ message }: { message: TypedData | SignAuthorizationReturnType | TypedDataDefinition<any> | Hex }) {
            if (typeof message === 'string') {
                return await owner.signMessage({ message })
            }
            return await owner.signMessage({ message: message.raw as Hex });
        },
        async signTransaction(transaction: any) {
            return await owner.signTransaction(transaction);
        },
        async signTypedData(typedData) {
            return await owner.signTypedData(typedData);
        },
        async signUserOperation(parameters: any) {
            const { chainId = bundlerClient.chain.id, authorization, ...userOperation } = parameters;
            const packedUserOp = toPackedUserOperation({ ...userOperation, sender: owner.address });

            const userOpHash = await bundlerClient.request({
                method: "eth_call",
                params: [
                    {
                        to: ENTRYPOINT_ADDRESS,
                        data: encodeFunctionData({
                            abi: entryPoint08Abi,
                            functionName: "getUserOpHash",
                            args: [packedUserOp]
                        })
                    },
                    "latest",
                    authorization ? {
                        [owner.address]: {
                            code: `0xef0100${IMPLEMENTATION_ADDRESS.toLowerCase().substring(2)}`
                        }
                    } : {}
                ]
            });

            const rawSignature = await owner.sign({
                hash: userOpHash as Hex
            });

            const sig = encodeAbiParameters(
                [
                    { type: 'uint256' },
                    { type: 'bytes' }
                ],
                [0n, rawSignature]
            );

            return sig;
        }
    });

    // 1. Build callData - simple call to 0xbAbE (checksummed address)
    const callData = await openfortAccount.encodeCalls([{
        to: getAddress('0x000000000000000000000000000000000000bAbE'),
        value: 0n,
        data: '0x' as Hex
    }]);

    console.log("\n=== Call Data ===");
    console.log("callData:", callData);

    // 2. Get nonce
    const nonce = await bundlerClient.readContract({
        address: ENTRYPOINT_ADDRESS,
        abi: entryPoint08Abi,
        functionName: 'getNonce',
        args: [owner.address, BigInt(1)]
    });

    console.log("\n=== Nonce ===");
    console.log("nonce:", nonce);

    // 3. Get gas fees using skandha_getGasPrice
    const gasFee = await axios.post(
        bundlerUrl,
        {
            'id': chain.id,
            'method': 'skandha_getGasPrice'
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("\n=== Gas Fees ===");
    console.log("gasFee response:", gasFee.data);

    const maxPriorityFeePerGas = BigInt(gasFee.data.result.maxPriorityFeePerGas);
    const maxFeePerGas = BigInt(gasFee.data.result.maxFeePerGas);

    console.log("maxPriorityFeePerGas:", maxPriorityFeePerGas);
    console.log("maxFeePerGas:", maxFeePerGas);

    // 4. Create dummy paymaster data for gas estimation (ASYNC format - 140 bytes)
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const dummyValidAfter = 0;
    const dummyVerificationGasLimit = 150000n;
    const dummyPostOpGasLimit = 50000n;

    const dummyPaymasterDataBase = helpers.createVerifyingModePaymasterData(dummyValidUntil, dummyValidAfter);
    const dummyPaymasterDataWithAsync = helpers.appendAsyncSignatureToPaymasterData(
        dummyPaymasterDataBase,
        helpers.DUMMY_SIG
    );
    const dummyPaymasterAndData = concat([
        PAYMASTER_ADDRESS,
        pad(toHex(dummyVerificationGasLimit), { size: 16 }),
        pad(toHex(dummyPostOpGasLimit), { size: 16 }),
        dummyPaymasterDataWithAsync
    ]) as Hex;

    console.log("\n=== Gas Estimation (ASYNC format) ===");
    console.log("Dummy paymasterAndData length:", (dummyPaymasterAndData.length - 2) / 2, "bytes (expected: 140)");

    // Create stub signature for gas estimation
    const stubSignature = encodeAbiParameters(
        [
            { type: 'uint256' },
            { type: 'bytes' }
        ],
        [
            0n,
            "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
        ]
    );

    // 5. Get gas estimation
    const userOpGas = await axios.post(
        bundlerUrl,
        {
            "jsonrpc": "2.0",
            "method": "eth_estimateUserOperationGas",
            "params": [
                {
                    "sender": owner.address,
                    "nonce": "0x0",
                    "initCode": "0x",  // Empty for EIP-7702 (delegation already set)
                    "callData": callData,
                    "callGasLimit": "0x0",
                    "verificationGasLimit": "0x0",
                    "preVerificationGas": "0x0",
                    "maxPriorityFeePerGas": toHex(maxPriorityFeePerGas),
                    "maxFeePerGas": toHex(maxFeePerGas),
                    "paymasterAndData": dummyPaymasterAndData,
                    "signature": stubSignature
                },
                ENTRYPOINT_ADDRESS
            ],
            "id": chain.id
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("estimation response:", userOpGas.data);

    const verificationGasLimit = BigInt(userOpGas.data.result.verificationGasLimit);
    const callGasLimit = BigInt(userOpGas.data.result.callGasLimit);
    const preVerificationGas = BigInt(userOpGas.data.result.preVerificationGas);

    console.log("\nGas Estimation:");
    console.log("verificationGasLimit:", verificationGasLimit);
    console.log("callGasLimit:", callGasLimit);
    console.log("preVerificationGas:", preVerificationGas);

    // 6. Build packed gas limits and fees
    const accountGasLimits = concat([
        pad(toHex(verificationGasLimit), { size: 16 }),
        pad(toHex(callGasLimit), { size: 16 })
    ]);

    const gasFees = concat([
        pad(toHex(maxPriorityFeePerGas), { size: 16 }),
        pad(toHex(maxFeePerGas), { size: 16 })
    ]);

    // 7. Valid window and constants
    const validUntil = Math.floor(Date.now() / 1000) + 86400;  // 1 day
    const validAfter = 0;

    // Constants from Foundry
    const postGas = 50000n;
    const modeByte = 1;  // (VERIFYING_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = (0 << 1) | 1 = 1
    const PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;

    console.log("\n=== Paymaster Parameters ===");
    console.log("validUntil:", validUntil);
    console.log("validAfter:", validAfter);
    console.log("postGas:", postGas);
    console.log("modeByte:", modeByte);

    // ==== STAGE 1: For Account Signing (73 bytes) ====
    const paymasterDataStage1 = concat([
        PAYMASTER_ADDRESS,  // 20 bytes
        pad(toHex(verificationGasLimit), { size: 16 }),  // 16 bytes
        pad(toHex(postGas), { size: 16 }),  // 16 bytes
        pad(toHex(modeByte), { size: 1 }),  // 1 byte
        pad(toHex(validUntil), { size: 6 }),  // 6 bytes
        pad(toHex(validAfter), { size: 6 }),  // 6 bytes
        PAYMASTER_SIG_MAGIC  // 8 bytes
    ]);

    console.log("\n=== STAGE 1: For Account Signing ===");
    console.log("paymasterAndData length:", (paymasterDataStage1.length - 2) / 2, "bytes (expected: 73)");
    console.log("paymasterAndData:", paymasterDataStage1);

    // ==== STAGE 2: For Paymaster Hash (75 bytes) ====
    const paymasterDataStage2 = concat([
        PAYMASTER_ADDRESS,  // 20 bytes
        pad(toHex(verificationGasLimit), { size: 16 }),  // 16 bytes
        pad(toHex(postGas), { size: 16 }),  // 16 bytes
        pad(toHex(modeByte), { size: 1 }),  // 1 byte
        pad(toHex(validUntil), { size: 6 }),  // 6 bytes
        pad(toHex(validAfter), { size: 6 }),  // 6 bytes
        pad(toHex(0), { size: 2 }),  // 2 bytes (uint16 placeholder)
        PAYMASTER_SIG_MAGIC  // 8 bytes
    ]);

    console.log("\n=== STAGE 2: For Paymaster Hash ===");
    console.log("paymasterAndData length:", (paymasterDataStage2.length - 2) / 2, "bytes (expected: 75)");
    console.log("paymasterAndData:", paymasterDataStage2);

    // ==== PARALLEL SIGNING ====
    console.log("\n=== Starting Parallel Signing ===\n");
    const signingStartTime = performance.now();

    let accountSignature: Hex = '0x';
    let paymasterSignature: Hex = '0x';

    await Promise.all([
        // Task 1: Sign account userOp
        (async () => {
            console.log("→ Starting account signature...");

            const userOpForAccountSigning = {
                sender: owner.address,
                nonce: nonce,
                initCode: '0x' as `0x${string}`,  // Empty for EIP-7702
                callData: callData,
                callGasLimit: callGasLimit,
                verificationGasLimit: verificationGasLimit,
                preVerificationGas: preVerificationGas,
                maxPriorityFeePerGas: maxPriorityFeePerGas,
                maxFeePerGas: maxFeePerGas,
                paymasterAndData: paymasterDataStage1,  // Use Stage 1 (73 bytes)
                signature: '0x' as `0x${string}`
            };

            const sig = await openfortAccount.signUserOperation(userOpForAccountSigning);
            accountSignature = sig;
            console.log("✓ Account signature completed");
        })(),

        // Task 2: Sign paymaster hash
        (async () => {
            console.log("→ Starting paymaster signature...");

            // Build PACKED userOp for paymaster hash (Stage 2)
            const packedUserOpForPmHash = {
                sender: owner.address as `0x${string}`,
                nonce: nonce,
                initCode: '0x' as `0x${string}`,  // Empty for EIP-7702
                callData: callData as `0x${string}`,
                accountGasLimits: accountGasLimits as `0x${string}`,  // Already packed
                preVerificationGas: preVerificationGas,
                gasFees: gasFees as `0x${string}`,  // Already packed
                paymasterAndData: paymasterDataStage2 as `0x${string}`,  // Use Stage 2 (75 bytes)
                signature: '0x' as `0x${string}`
            };

            const pmHash = await getHash(
                PAYMASTER_ADDRESS as Hex,
                bundlerClient,
                helpers.VERIFYING_MODE,  // 0
                packedUserOpForPmHash  // Pass packed userOp directly
            );

            console.log("Paymaster hash:", pmHash);

            const sig = await paymasterSigner.signMessage({
                message: { raw: pmHash as Hex }
            });
            paymasterSignature = sig;
            console.log("✓ Paymaster signature completed");
        })()
    ]);

    const signingEndTime = performance.now();
    console.log(`\n✓ Parallel signing took: ${(signingEndTime - signingStartTime).toFixed(2)}ms\n`);

    // ==== STAGE 3: Final paymasterAndData (140 bytes) ====
    const finalPaymasterAndData = concat([
        PAYMASTER_ADDRESS,  // 20 bytes
        pad(toHex(verificationGasLimit), { size: 16 }),  // 16 bytes
        pad(toHex(postGas), { size: 16 }),  // 16 bytes
        pad(toHex(modeByte), { size: 1 }),  // 1 byte
        pad(toHex(validUntil), { size: 6 }),  // 6 bytes
        pad(toHex(validAfter), { size: 6 }),  // 6 bytes
        paymasterSignature,  // 65 bytes
        pad(toHex((paymasterSignature.length - 2) / 2), { size: 2 }),  // 2 bytes (uint16 sigLength)
        PAYMASTER_SIG_MAGIC  // 8 bytes
    ]);

    console.log("=== STAGE 3: Final paymasterAndData ===");
    console.log("paymasterAndData length:", (finalPaymasterAndData.length - 2) / 2, "bytes (expected: 140)");
    console.log("paymasterAndData:", finalPaymasterAndData);
    console.log("\nSignatures:");
    console.log("  Account signature:", accountSignature);
    console.log("  Paymaster signature:", paymasterSignature);

    // ==== SEND USER OPERATION ====
    console.log("\n=== Sending UserOperation to Bundler ===");

    const finalUserOp = {
        sender: owner.address,
        nonce: toHex(nonce),
        initCode: '0x',  // Empty for EIP-7702 (delegation already set)
        callData: callData,
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        maxFeePerGas: toHex(maxFeePerGas),
        paymasterAndData: finalPaymasterAndData,
        signature: accountSignature
    };

    console.log("\nFinal UserOp:", finalUserOp);

    // ==== TENDERLY SIMULATION DATA ====
    console.log("\n=== Tenderly Simulation ===");

    // Build packed UserOp for handleOps
    console.log("\n🔍 DEBUG: Building packed UserOp for handleOps");
    console.log("  finalPaymasterAndData:", finalPaymasterAndData);
    console.log("  finalPaymasterAndData length:", (finalPaymasterAndData.length - 2) / 2, "bytes");

    const packedUserOpForHandleOps = toPackedUserOperation({
        sender: owner.address,
        nonce: nonce,
        initCode: '0x' as `0x${string}`,
        callData: callData,
        callGasLimit: callGasLimit,
        verificationGasLimit: verificationGasLimit,
        preVerificationGas: preVerificationGas,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        paymasterAndData: finalPaymasterAndData,
        signature: accountSignature as `0x${string}`
    });

    console.log("\n🔍 DEBUG: Packed UserOp result:");
    console.log("  paymasterAndData in packed:", packedUserOpForHandleOps.paymasterAndData);
    console.log("  paymasterAndData length:", (packedUserOpForHandleOps.paymasterAndData.length - 2) / 2, "bytes");

    // Encode handleOps call
    const handleOpsCalldata = encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: 'handleOps',
        args: [[packedUserOpForHandleOps], "0x0047e22c52deee45ed3ab87d4e27dad61db81e78"]  // beneficiary = owner
    });

    console.log("\n🔍 DEBUG: Encoded calldata length:", (handleOpsCalldata.length - 2) / 2, "bytes");

    console.log("\n📋 Copy this data for Tenderly simulation:");
    console.log("\nTo Address (Entry Point):", ENTRYPOINT_ADDRESS);
    console.log("\nCalldata (handleOps):");
    console.log(handleOpsCalldata);
    console.log("\nCalldata length:", (handleOpsCalldata.length - 2) / 2, "bytes");
    console.log("\n⚠️  IMPORTANT: Add State Override for EIP-7702");
    console.log("State Override JSON:");
    console.log(JSON.stringify({
        [owner.address]: {
            code: `0xef0100${IMPLEMENTATION_ADDRESS.toLowerCase().substring(2)}`
        }
    }, null, 2));
    console.log("\n===========================\n");

    // const sendUserOperation = await axios.post(
    //     bundlerUrl,
    //     {
    //         'jsonrpc': '2.0',
    //         'method': 'eth_sendUserOperation',
    //         'params': [
    //             finalUserOp,
    //             ENTRYPOINT_ADDRESS
    //         ],
    //         'id': chain.id
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
    //     console.log("\n✓ UserOp hash:", userOpHash);

    //     console.log("\nWaiting for UserOperation to be mined...");
    //     let receipt = null;
    //     let attempts = 0;
    //     const maxAttempts = 60;

    //     while (!receipt && attempts < maxAttempts) {
    //         const response = await axios.post(
    //             bundlerUrl,
    //             {
    //                 'id': chain.id,
    //                 'jsonrpc': '2.0',
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
    //             console.log("\n✓ UserOperation mined successfully!");
    //             console.log("Receipt:", JSON.stringify(response.data, null, 2));
    //             break;
    //         } else {
    //             attempts++;
    //             process.stdout.write(`\rAttempt ${attempts}/${maxAttempts}...`);
    //             await new Promise(resolve => setTimeout(resolve, 2000));
    //         }
    //     }

    //     if (!receipt) {
    //         console.log("\n✗ Timeout: UserOperation receipt not found after 2 minutes");
    //     }
    // } else {
    //     console.log("\n✗ Error sending UserOperation");
    //     console.log("Error details:", sendUserOperation.data.error);
    // }
};

main(optimismSepolia).catch((error) => {
    console.error("\n✗ Script failed:", error);
    process.exit(1);
});
