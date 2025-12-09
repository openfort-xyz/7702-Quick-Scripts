import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";
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
import { ABI_7702_ACCOUNT } from "../../src/data/abis";
import axios from 'axios';
import { helpers } from "../../src/helpers/paymaster/paymasterData";
import { getHash } from "../../src/helpers/paymaster/paymasterActions";
import { addressBook } from "../../src/data/addressBook";

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

    // Create dummy paymaster data for gas estimation
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
    const dummyValidAfter = 0;
    const dummyPaymasterData = helpers.appendSignatureToPaymasterData(
        helpers.createVerifyingModePaymasterData(dummyValidUntil, dummyValidAfter),
        helpers.DUMMY_SIG
    );

    const userOpGas = await axios.post(
        bundlerUrl,
        {
            "jsonrpc": "2.0",
            "method": "eth_estimateUserOperationGas",
            "params": [
                {
                    "sender": await openfortAccount.getAddress(),
                    "nonce": "0x0",
                    "initCode": "0x7702",
                    "callData": await openfortAccount.encodeCalls(call),
                    "callGasLimit": "0x0",
                    "verificationGasLimit": "0x0",
                    "preVerificationGas": "0x0",
                    "maxPriorityFeePerGas": "0x3b9aca00",
                    "maxFeePerGas": "0x7a5cf70d5",
                    "paymasterAndData": `${PAYMASTER_ADDRESS}${dummyPaymasterData.slice(2)}`,
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

    // Create real paymaster data (without signature yet)
    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;

    // Get gas limits from estimation
    const paymasterVerificationGasLimit = userOpGas.data.result.paymasterVerificationGasLimit
        ? BigInt(userOpGas.data.result.paymasterVerificationGasLimit)
        : 150000n; // Fallback if not provided
    const paymasterPostOpGasLimit = userOpGas.data.result.paymasterPostOpGasLimit
        ? BigInt(userOpGas.data.result.paymasterPostOpGasLimit)
        : 50000n; // Fallback if not provided

    // Create paymaster data WITHOUT gas limits (just mode + timestamps)
    const paymasterDataWithoutSig = helpers.createVerifyingModePaymasterData(validUntil, validAfter);

    // Build complete paymasterAndData with gas limits included
    // Structure: address (20) + verificationGasLimit (16) + postOpGasLimit (16) + mode+timestamps (13)
    const paymasterAndDataWithoutSig = concat([
        PAYMASTER_ADDRESS,                                          // 20 bytes
        pad(toHex(paymasterVerificationGasLimit), { size: 16 }),    // 16 bytes
        pad(toHex(paymasterPostOpGasLimit), { size: 16 }),          // 16 bytes
        paymasterDataWithoutSig                                     // 13 bytes (mode + validUntil + validAfter)
    ]) as Hex;

    console.log("\n=== Paymaster Configuration ===");
    console.log("Paymaster Address:", PAYMASTER_ADDRESS);
    console.log("Verification Gas Limit:", paymasterVerificationGasLimit.toString());
    console.log("PostOp Gas Limit:", paymasterPostOpGasLimit.toString());
    console.log("Paymaster Data (without sig):", paymasterDataWithoutSig);
    console.log("paymasterAndData (without sig):", paymasterAndDataWithoutSig);
    console.log("paymasterAndData length:", (paymasterAndDataWithoutSig.length - 2) / 2, "bytes");
    console.log("Valid Until:", new Date(validUntil * 1000).toISOString());
    console.log("Valid After:", validAfter);

    const userOp = {
        sender: await openfortAccount.getAddress(),
        nonce: toHex(await openfortAccount.getNonce()),
        initCode: '0x7702',
        callData: await openfortAccount.encodeCalls(call),
        callGasLimit: userOpGas.data.result.callGasLimit,
        verificationGasLimit: userOpGas.data.result.verificationGasLimit,
        preVerificationGas: userOpGas.data.result.preVerificationGas,
        maxPriorityFeePerGas: gasFee.data.result.maxPriorityFeePerGas,
        maxFeePerGas: gasFee.data.result.maxFeePerGas,
        paymasterAndData: paymasterAndDataWithoutSig
    };

    // Get paymaster hash from contract
    console.log("\n=== Getting Paymaster Hash ===");

    // Manually construct PackedUserOperation to match contract ABI structure
    const verificationGasLimit = BigInt(userOpGas.data.result.verificationGasLimit);
    const callGasLimit = BigInt(userOpGas.data.result.callGasLimit);
    const maxPriorityFeePerGas = BigInt(gasFee.data.result.maxPriorityFeePerGas);
    const maxFeePerGas = BigInt(gasFee.data.result.maxFeePerGas);

    // Pack gas limits into bytes32 fields as per ERC-4337 v0.7+ format
    const accountGasLimits = concat([
        pad(toHex(verificationGasLimit), { size: 16 }),
        pad(toHex(callGasLimit), { size: 16 })
    ]);
    const gasFees = concat([
        pad(toHex(maxPriorityFeePerGas), { size: 16 }),
        pad(toHex(maxFeePerGas), { size: 16 })
    ]);

    const packedUserOpForHash = {
        sender: userOp.sender as `0x${string}`,
        nonce: BigInt(userOp.nonce),
        initCode: userOp.initCode as `0x${string}`,
        callData: userOp.callData as `0x${string}`,
        accountGasLimits: accountGasLimits as `0x${string}`,
        preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
        gasFees: gasFees as `0x${string}`,
        paymasterAndData: paymasterAndDataWithoutSig as `0x${string}`,
        signature: '0x' as `0x${string}`
    };

    const VERIFYING_MODE = 0;
    const pmHash = await getHash(PAYMASTER_ADDRESS, bundlerClient, VERIFYING_MODE, packedUserOpForHash);
    console.log("Paymaster hash:", pmHash);

    // Sign paymaster hash
    const pmSignature = await paymasterSigner.signMessage({
        message: { raw: pmHash as Hex }
    });
    console.log("Paymaster signature:", pmSignature);

    // Append signature to complete paymasterAndData
    const paymasterAndDataWithSignature = concat([
        paymasterAndDataWithoutSig,
        pmSignature.slice(2) as Hex  // Remove 0x prefix
    ]) as Hex;

    // Update userOp with signed paymaster data
    userOp.paymasterAndData = paymasterAndDataWithSignature;
    console.log("Final paymasterAndData (with sig):", paymasterAndDataWithSignature);
    console.log("Final paymasterAndData Length:", (paymasterAndDataWithSignature.length - 2) / 2, "bytes");
    console.log("Expected: 130 bytes (20 address + 16 verificationGasLimit + 16 postOpGasLimit + 1 mode + 6 validUntil + 6 validAfter + 65 signature)");

    console.log("\n=== Signing UserOperation ===");
    const signature = await openfortAccount.signUserOperation({
        sender: userOp.sender,
        nonce: await openfortAccount.getNonce(),
        initCode: userOp.initCode as `0x${string}`,
        callData: userOp.callData,
        callGasLimit: BigInt(userOpGas.data.result.callGasLimit),
        verificationGasLimit: BigInt(userOpGas.data.result.verificationGasLimit),
        preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
        maxPriorityFeePerGas: BigInt(gasFee.data.result.maxPriorityFeePerGas),
        maxFeePerGas: BigInt(gasFee.data.result.maxFeePerGas),
        paymasterAndData: paymasterAndDataWithSignature as `0x${string}`,
        signature: '0x' as `0x${string}`
    });

    console.log("\n=== Sending UserOperation with Paymaster ===");
    console.log("paymasterAndData:", paymasterAndDataWithSignature);
    console.log("paymasterAndData length:", paymasterAndDataWithSignature.length, "chars");

    const sendUserOperation = await axios.post(
        bundlerUrl,
        {
            'jsonrpc': '2.0',
            'method': 'eth_sendUserOperation',
            'params': [
                {
                    sender: userOp.sender,
                    nonce: userOp.nonce,
                    initCode: userOp.initCode,
                    callData: userOp.callData,
                    callGasLimit: userOp.callGasLimit,
                    verificationGasLimit: userOp.verificationGasLimit,
                    preVerificationGas: userOp.preVerificationGas,
                    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
                    maxFeePerGas: userOp.maxFeePerGas,
                    paymasterAndData: paymasterAndDataWithSignature,
                    signature
                },
                entrypoint09Address
            ],
            'id': bundlerClient.chain.id
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("sendUserOperation response:: ", sendUserOperation.data);

    const userOpHash = sendUserOperation.data.result;
    console.log("UserOp hash:: ", userOpHash);

    console.log("Waiting for UserOperation to be mined...");
    let receipt = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (!receipt && attempts < maxAttempts) {
        const response = await axios.post(
            bundlerUrl,
            {
                'id': bundlerClient.chain.id,
                'method': 'eth_getUserOperationReceipt',
                'params': [userOpHash]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.result) {
            receipt = response.data.result;
            console.log("\n✅ UserOperation mined successfully!");
            console.log("userOperationReceipt response:: ", response.data);
        } else {
            attempts++;
            process.stdout.write(`\rAttempt ${attempts}/${maxAttempts}...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
    }

    if (!receipt) {
        console.log("\n❌ Timeout: UserOperation receipt not found after 2 minutes");
    }
}
main(optimismSepolia);
