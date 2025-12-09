import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";
import {
    Chain,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    Hex,
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
                    "paymasterAndData": "0x",
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

    // Build complete UserOperation object
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
        paymasterAndData: '0x'
    };

    // Sign the UserOperation (convert hex strings to bigints for signing)
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
        paymasterAndData: userOp.paymasterAndData as `0x${string}`,
        signature: '0x' as `0x${string}` // placeholder for typing, will be generated
    });

    const sendUserOperation = await axios.post(
        bundlerUrl,
        {
            'jsonrpc': '2.0',
            'method': 'eth_sendUserOperation',
            'params': [
                {
                    ...userOp,
                    signature
                },
                entrypoint09Address
            ],
            'id': 123
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    console.log("sendUserOperation response:: ", sendUserOperation.data);

    // const hash = await bundlerClient.sendUserOperation({
    //     account: openfortAccount,
    //     authorization,
    //     factory: authorization ? "0x7702" : undefined,
    //     factoryData: authorization ? "0x" : undefined,
    //     calls: [
    //         {
    //             to: "0x03b22d7742fA2A8a8f01b64F40F0F2185E965cB8",
    //             value: parseUnits('0.00000001', 18)
    //         }
    //     ],
    // });

    // console.log("userop hash:: ", hash);
    // return hash;
}
main(optimismSepolia);
