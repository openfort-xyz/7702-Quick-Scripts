import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";
import {
    Chain,
    concat,
    createWalletClient,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    Hex,
    http,
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
import { ABI_7702_ACCOUNT, ABI_PAYMASTER_V3 } from "../../../src/data/abis";
import axios from 'axios';
import { UserOperation } from "viem/account-abstraction";

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

const PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;
const dummyPaymasterSig = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;
const sigLen = pad(toHex(dummyPaymasterSig.length), { size: 2 });

console.log("DEBUG: dummyPaymasterSig.length =", dummyPaymasterSig.length);
console.log("DEBUG: sigLen =", sigLen);

async function getFreshUserOp(openfortAccount: any, call: Call[], gasFee: { maxPriorityFeePerGas: Hex, maxFeePerGas: Hex }, paymasterAddress: Hex): Promise<UserOperation<'0.8'>> {
    return {
        sender: await openfortAccount.getAddress(),
        nonce: await openfortAccount.getNonce(),
        factory: '0x7702',
        callData: await openfortAccount.encodeCalls(call),
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: BigInt(gasFee.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(gasFee.maxPriorityFeePerGas),
        paymaster: await createStubPaymasterData(paymasterAddress),
        signature: await openfortAccount.getStubSignature(),
    }
}

async function createVerifyingModePaymasterData(validUntil: number, validAfter: number): Promise<Hex> {
    const VERIFYING_MODE = 0n;
    const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
    const mode = (VERIFYING_MODE << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
    const modeHex = pad(toHex(mode), { size: 1 });
    const validUntilHex = pad(toHex(validUntil), { size: 6 });
    const validAfterHex = pad(toHex(validAfter), { size: 6 });
    return concat([modeHex, validUntilHex, validAfterHex]) as Hex;
}

async function createStubPaymasterData(paymasterAddress: Hex): Promise<Hex> {
    const paymasterData = await createVerifyingModePaymasterData(1796977534, 0); // Fri Dec 11 2026 09:25:34 GMT+0100 (Central European Standard Time)
    const stubVerificationGasLimit = pad(toHex(400000), { size: 16 });
    const stubPostOpGasLimit = pad(toHex(50000), { size: 16 });

    const result = concat([
        paymasterAddress,
        stubVerificationGasLimit,
        stubPostOpGasLimit,
        paymasterData,
        dummyPaymasterSig,
        sigLen,
        PAYMASTER_SIG_MAGIC

    ]) as Hex;

    console.log("DEBUG: Stub paymaster data =", result);
    console.log("DEBUG: Stub paymaster data length (bytes) =", (result.length - 2) / 2);

    return result;
}

async function signUserOperationHash(paymasterAddress: Hex, userOp: UserOperation): Promise<Hex> {
    const verificationGasLimit = pad(toHex(userOp.verificationGasLimit), { size: 16 });
    const paymasterData = await createVerifyingModePaymasterData(1796977534, 0); // Fri Dec 11 2026 09:25:34 GMT+0100 (Central European Standard Time)
    const postOpGasLimit = pad(toHex(50000), { size: 16 });

    return concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        PAYMASTER_SIG_MAGIC
    ]) as Hex;
}

async function createPaymasterDataForPaymasterHash(paymasterAddress: Hex, userOp: UserOperation): Promise<Hex> {
    const verificationGasLimit = pad(toHex(userOp.verificationGasLimit), { size: 16 });
    const paymasterData = await createVerifyingModePaymasterData(1796977534, 0);
    const postOpGasLimit = pad(toHex(50000), { size: 16 });

    return concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        pad(toHex(0), { size: 2 }), // 0-length signature marker
        PAYMASTER_SIG_MAGIC
    ]) as Hex;
}

async function getGasFee(chainId: string, bundlerUrl: string): Promise<{ maxPriorityFeePerGas: Hex, maxFeePerGas: Hex }> {
    const gasFee = await axios.post(
        bundlerUrl,
        {
            'id': chainId,
            'method': 'skandha_getGasPrice'
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("gasFee:: ", gasFee.data);

    return gasFee.data.result as { maxPriorityFeePerGas: Hex, maxFeePerGas: Hex };
}

async function getGasValues(userOp: UserOperation, chainId: string, bundlerUrl: string, openfortAccount: any, entryPointAddress: Hex): Promise<{ callGasLimit: string; verificationGasLimit: string; preVerificationGas: string; paymasterVerificationGasLimit: string; paymasterPostOpGasLimit: string }> {
    const userOpGas = await axios.post(
        bundlerUrl,
        {
            "jsonrpc": "2.0",
            "method": "eth_estimateUserOperationGas",
            "params": [
                {
                    "sender": userOp.sender,
                    "nonce": "0x0",  // Hardcoded to match working code
                    "initCode": userOp.factory,
                    "callData": userOp.callData,
                    "callGasLimit": toHex(userOp.callGasLimit || 0n),
                    "verificationGasLimit": toHex(userOp.verificationGasLimit || 0n),
                    "preVerificationGas": toHex(userOp.preVerificationGas || 0n),
                    "maxPriorityFeePerGas": toHex(userOp.maxPriorityFeePerGas),
                    "maxFeePerGas": toHex(userOp.maxFeePerGas),
                    "paymasterAndData": concat([userOp.paymaster || '0x', userOp.paymasterData || '0x']),
                    "signature": await openfortAccount.getStubSignature()
                },
                entryPointAddress
            ],
            "id": chainId
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    return userOpGas.data.result;
}

const main = async (
    chain: Chain
) => {
    const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);
    const paymasterSigner = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

    const bundlerUrl = "https://rpc.erc4337.io/11155420";

    const bundlerClient = createFreeBundler({
        chain,
        bundlerUrl
    }).extend(publicActions).extend(walletActions);

    const entrypoint09Address = "0x433709009b8330fda32311df1c2afa402ed8d009";
    const implementation = "0x77020901f40BE88Df754E810dA9868933787652B";
    const paymasterAddress = "0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97";

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

    const call: Call[] = [
        {
            to: "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1",
            value: parseUnits('0.00000001', 18)
        }
    ];

    const gasFee = await getGasFee(chain.id.toString(), bundlerUrl);

    console.log("gasFee returned: ", gasFee);

    let userOp: UserOperation<'0.8'> = await getFreshUserOp(openfortAccount, call, gasFee, paymasterAddress);

    console.log(userOp);
    const gasValues = await getGasValues(userOp, chain.id.toString(), bundlerUrl, openfortAccount, entrypoint09Address);

    console.log("gasValues returned: ", gasValues);
    console.log("DEBUG: verificationGasLimit from estimation =", gasValues.verificationGasLimit, "= decimal", parseInt(gasValues.verificationGasLimit, 16));

    userOp.callGasLimit = BigInt(gasValues.callGasLimit);
    userOp.verificationGasLimit = BigInt(gasValues.verificationGasLimit);
    userOp.preVerificationGas = BigInt(gasValues.preVerificationGas);
    userOp.paymasterVerificationGasLimit = BigInt(gasValues.verificationGasLimit);
    userOp.paymasterPostOpGasLimit = 50000n;

    const paymasterModeAndValidity = await createVerifyingModePaymasterData(1796977534, 0);

    userOp.paymaster = paymasterAddress;
    userOp.paymasterData = concat([
        paymasterModeAndValidity,
        PAYMASTER_SIG_MAGIC
    ]) as Hex;

    // console.log("Final UserOp: ", userOp);
    let packedUserOp = toPackedUserOperation(userOp);
    // FIX: Remove viem padding BEFORE calculating hash! (use spread to handle immutability)
    packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex };
    console.log("DEBUG: initCode after fix =", packedUserOp.initCode);
    // console.log("Final UserOp: ", packedUserOp);

    const userOpHash = await bundlerClient.readContract({
        address: entrypoint09Address,
        abi: entryPoint08Abi,
        functionName: "getUserOpHash",
        args: [packedUserOp],
    });

    console.log("userOpHash:: ", userOpHash);

    const rawUserOpSignature = await owner.sign({
        hash: userOpHash as Hex
    })

    const sig = encodeAbiParameters(
        [
            { type: 'uint256' },
            { type: 'bytes' }
        ],
        [0n, rawUserOpSignature]
    );
    userOp.signature = sig;

    userOp.paymasterData = concat([
        paymasterModeAndValidity,
        pad(toHex(0), { size: 2 }),
        PAYMASTER_SIG_MAGIC
    ]) as Hex;

    packedUserOp = toPackedUserOperation(userOp);
    packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex };

    const paymasterhash = await bundlerClient.readContract({
        address: paymasterAddress,
        abi: ABI_PAYMASTER_V3,
        functionName: "getHash",
        args: [0, packedUserOp],
    });

    const paymasterRawSignature = await paymasterSigner.signMessage({ message: { raw: paymasterhash } });

    userOp.paymasterData = concat([
        paymasterModeAndValidity,
        paymasterRawSignature,
        pad(toHex(65), { size: 2 }),
        PAYMASTER_SIG_MAGIC
    ]) as Hex;

    packedUserOp = toPackedUserOperation(userOp);
    packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex };
    console.log("Final UserOp: ", packedUserOp);

    const sender = privateKeyToAccount(process.env.PAYMASTER_OWNER_PRIVATE_KEY! as Hex);
    const senderWallet = createWalletClient({
        chain,
        account: sender,
        transport: http(bundlerUrl),
    });

    const txHash = await senderWallet.sendTransaction({
        to: entrypoint09Address,
        data: encodeFunctionData({
            abi: entryPoint08Abi,
            functionName: "handleOps",
            args: [
                [packedUserOp],
                sender.address
            ]
        }),
        chain
    });

    console.log("Transaction sent! Hash:", txHash);

    // console.log("Waiting for transaction to be mined...");
    // const receipt = await bundlerClient.waitForTransactionReceipt({ hash: txHash });
    // console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    // console.log("Key registration successful! TX Hash:", txHash);
    // // Send in PACKED v0.7+ format (convert BigInts to hex)
    // const sendUserOperation = await axios.post(
    //     bundlerUrl,
    //     {
    //         'jsonrpc': '2.0',
    //         'method': 'eth_sendUserOperation',
    //         'params': [
    //             {
    //                 'sender': packedUserOp.sender,
    //                 'nonce': toHex(packedUserOp.nonce),
    //                 'initCode': packedUserOp.initCode,
    //                 'callData': packedUserOp.callData,
    //                 'accountGasLimits': packedUserOp.accountGasLimits,
    //                 'preVerificationGas': toHex(packedUserOp.preVerificationGas),
    //                 'gasFees': packedUserOp.gasFees,
    //                 'paymasterAndData': packedUserOp.paymasterAndData,
    //                 'signature': packedUserOp.signature
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

    // console.log("sendUserOperation response:: ", sendUserOperation.data);
}
// [{"sender":"0xcdeaa61c5956bfb99e06fb93d8241848dc091127","nonce":"18446744073709551624","initCode":"0x7702","callData":"0xe9ae5c530100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a84e4f9d72cb37a8276090d3fc50895bd8e5aaf100000000000000000000000000000000000000000000000000000002540be40000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000","accountGasLimits":"0x00000000000000000000000000013dd00000000000000000000000000000659b","preVerificationGas":"53116","gasFees":"0x00000000000000000000000000100590000000000000000000000000001006cb","paymasterAndData":"0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a9700000000000000000000000000013dd00000000000000000000000000000c3500100006b1bb37e00000000000023df119f17e46eaf075e73e673d8046656fb08263973e79da671db7c4978c46c54b894c445b90ca02063a5b12a32ccd8ee05edfa8db5aaf8dcca810ec80bcf331b004122e325a297439656","signature":"0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000041db501179980c8a0c44061ad22014694aa58d78caf5e3aeabb1a194980103608e53b9c28470644e0ba6fd7cfb3698c20c535ee87986633193d6b7910767aa2f391c00000000000000000000000000000000000000000000000000000000000000"}]

main(optimismSepolia);
