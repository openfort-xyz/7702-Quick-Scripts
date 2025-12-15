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
import { ABI_7702_ACCOUNT, ABI_PAYMASTER_V3 } from "../../../src/data/abis";
import axios from 'axios';

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

async function createVerifyingModePaymasterData(validUntil: number, validAfter: number): Promise<Hex> {
    const VERIFYING_MODE = 0n;
    const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
    const mode = (VERIFYING_MODE << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
    const modeHex = pad(toHex(mode), { size: 1 });
    const validUntilHex = pad(toHex(validUntil), { size: 6 });
    const validAfterHex = pad(toHex(validAfter), { size: 6 });
    return concat([modeHex, validUntilHex, validAfterHex]) as Hex;
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


    const gasFee = await axios.post(
        bundlerUrl,
        {
            'id': bundlerClient.chain.id,
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

    const paymasterData = await createVerifyingModePaymasterData(1796977534, 0);
    // console.log("paymasterData:: ", paymasterData);

    const dummySig = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;
    const sigLen = pad(toHex(dummySig.length), { size: 2 });
    const PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;

    let verificationGasLimit = pad(toHex(400000), { size: 16 });
    const postOpGasLimit = pad(toHex(50000), { size: 16 });
    const paymasterFullData = concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        dummySig,
        sigLen,
        PAYMASTER_SIG_MAGIC

    ]) as Hex;
    console.log("paymasterFullData:: ", paymasterFullData);

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
                    "maxPriorityFeePerGas": gasFee.data.result.maxPriorityFeePerGas,
                    "maxFeePerGas": gasFee.data.result.maxFeePerGas,
                    "paymasterAndData": paymasterFullData,
                    "signature": await openfortAccount.getStubSignature()
                },
                entrypoint09Address
            ],
            "id": bundlerClient.chain.id
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("estimation response:: ", userOpGas.data);

    verificationGasLimit = pad(userOpGas.data.result.verificationGasLimit as Hex, { size: 16 });

    const paymasterForUserHash = concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        PAYMASTER_SIG_MAGIC

    ]) as Hex;
    console.log("paymasterForUserHash:: ", paymasterForUserHash);


    let userOp = {
        sender: await openfortAccount.getAddress(),
        nonce: await openfortAccount.getNonce(),
        initCode: "0x7702" as Hex,
        callData: await openfortAccount.encodeCalls(call),
        accountGasLimits: concat(
            [pad(userOpGas.data.result.verificationGasLimit, { size: 16 }),
            pad(userOpGas.data.result.callGasLimit, { size: 16 })
            ]) as Hex,
        preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
        gasFees: concat(
            [pad(userOpGas.data.result.maxPriorityFeePerGas, { size: 16 }),
            pad(userOpGas.data.result.maxFeePerGas, { size: 16 })
            ]) as Hex,
        paymasterAndData: paymasterForUserHash,
        signature: dummySig
    }

    console.log("userOp before signing:: ", userOp);

    const userOpHash = await bundlerClient.readContract({
        address: entrypoint09Address,
        abi: entryPoint08Abi,
        functionName: "getUserOpHash",
        args: [userOp],
    });

    console.log("userOpHash:: ", userOpHash);

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
    userOp.signature = sig;

    const paymasterForPaymasterhash = concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        pad(toHex(0), { size: 2 }),
        PAYMASTER_SIG_MAGIC

    ]) as Hex;
    console.log("paymasterForUserHash:: ", paymasterForUserHash);

    userOp.paymasterAndData = paymasterForPaymasterhash;

    const paymasterhash = await bundlerClient.readContract({
        address: paymasterAddress,
        abi: ABI_PAYMASTER_V3,
        functionName: "getHash",
        args: [0, userOp],
    });

    console.log("paymasterhash:: ", paymasterhash);
    console.log("paymasterForPaymasterhash:: ", paymasterForPaymasterhash);

    const paymasterRawSignature =  await paymasterSigner.signMessage({ message: { raw: paymasterhash } });
    console.log(paymasterRawSignature.length);

    // // const paymasterRawSignature = await paymasterSigner.signMessage({
    // //     message: { raw: paymasterhash as Hex }
    // // })

    const paymasterDataFinall = concat([
        paymasterAddress,
        verificationGasLimit,
        postOpGasLimit,
        paymasterData,
        paymasterRawSignature,
        pad(toHex(65), { size: 2 }),
        PAYMASTER_SIG_MAGIC

    ]) as Hex;
    console.log("paymasterDataFinall:: ", paymasterDataFinall);
    userOp.paymasterAndData = paymasterDataFinall;

    console.log("final userOp:: ", userOp);

    [{"sender":"0xcdeaa61c5956bfb99e06fb93d8241848dc091127","nonce":"18446744073709551624","initCode":"0x7702","callData":"0xe9ae5c530100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a84e4f9d72cb37a8276090d3fc50895bd8e5aaf100000000000000000000000000000000000000000000000000000002540be40000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000","accountGasLimits":"0x00000000000000000000000000013dd00000000000000000000000000000659b","preVerificationGas":"53116","gasFees":"0x00000000000000000000000000100590000000000000000000000000001006cb","paymasterAndData":"0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a9700000000000000000000000000013dd00000000000000000000000000000c3500100006b1bb37e00000000000023df119f17e46eaf075e73e673d8046656fb08263973e79da671db7c4978c46c54b894c445b90ca02063a5b12a32ccd8ee05edfa8db5aaf8dcca810ec80bcf331b004122e325a297439656","signature":"0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000041db501179980c8a0c44061ad22014694aa58d78caf5e3aeabb1a194980103608e53b9c28470644e0ba6fd7cfb3698c20c535ee87986633193d6b7910767aa2f391c00000000000000000000000000000000000000000000000000000000000000"}]

    // userOp = {
    //     sender: await openfortAccount.getAddress(),
    //     nonce: await openfortAccount.getNonce(),
    //     initCode: "0x7702" as Hex,
    //     callData: await openfortAccount.encodeCalls(call),
    //     accountGasLimits: concat(
    //         [pad(toHex(userOpGas.data.result.verificationGasLimit), { size: 16 }),
    //          pad(toHex(userOpGas.data.result.callGasLimit), { size: 16 })
    //         ]) as Hex,
    //     preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
    //     gasFees: concat(
    //         [pad(toHex(userOpGas.data.result.maxPriorityFeePerGas), { size: 16 }),
    //          pad(toHex(userOpGas.data.result.maxFeePerGas), { size: 16 })
    //         ]) as Hex,
    //     paymasterAndData: paymasterFullData,
    //     signature: dummySig
    // }

    // const paymasterhash = await bundlerClient.readContract({
    //     address: paymasterAddress,
    //     abi: ABI_PAYMASTER_V3,
    //     functionName: "getHash",
    //     args: [0, userOp],
    // });

    // console.log("paymasterhash:: ", paymasterhash);

    // const signature = await openfortAccount.signUserOperation({
    //     sender: userOp.sender,
    //     nonce: await openfortAccount.getNonce(),
    //     initCode: userOp.initCode as `0x${string}`,
    //     callData: userOp.callData,
    //     callGasLimit: BigInt(userOpGas.data.result.callGasLimit),
    //     verificationGasLimit: BigInt(userOpGas.data.result.verificationGasLimit),
    //     preVerificationGas: BigInt(userOpGas.data.result.preVerificationGas),
    //     maxPriorityFeePerGas: BigInt(gasFee.data.result.maxPriorityFeePerGas),
    //     maxFeePerGas: BigInt(gasFee.data.result.maxFeePerGas),
    //     paymasterAndData: userOp.paymasterAndData as `0x${string}`,
    //     signature: '0x' as `0x${string}`
    // });

    // const sendUserOperation = await axios.post(
    //     bundlerUrl,
    //     {
    //         'jsonrpc': '2.0',
    //         'method': 'eth_sendUserOperation',
    //         'params': [
    //             {
    //                 ...userOp,
    //                 signature
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

    // const userOpHash = sendUserOperation.data.result;
    // console.log("UserOp hash:: ", userOpHash);

    // console.log("Waiting for UserOperation to be mined...");
    // let receipt = null;
    // let attempts = 0;
    // const maxAttempts = 60;

    // while (!receipt && attempts < maxAttempts) {
    //     const response = await axios.post(
    //         bundlerUrl,
    //         {
    //             'id': bundlerClient.chain.id,
    //             'method': 'eth_getUserOperationReceipt',
    //             'params': [userOpHash]
    //         },
    //         {
    //             headers: {
    //                 'Content-Type': 'application/json'
    //             }
    //         }
    //     );

    //     if (response.data.result) {
    //         receipt = response.data.result;
    //         console.log("\n✅ UserOperation mined successfully!");
    //         console.log("userOperationReceipt response:: ", response.data);
    //     } else {
    //         attempts++;
    //         process.stdout.write(`\rAttempt ${attempts}/${maxAttempts}...`);
    //         await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    //     }
    // }

    // if (!receipt) {
    //     console.log("\n❌ Timeout: UserOperation receipt not found after 2 minutes");
    // }
}
main(optimismSepolia);
