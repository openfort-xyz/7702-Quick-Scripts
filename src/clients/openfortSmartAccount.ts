import { ABI_7702_ACCOUNT } from "@/data/abis";
import { mode_1 } from "@/data/accountConstants";
import { getStubEOASignature } from "@/helpers/keys/signaturesHelpers";
import { toSmartAccount, entryPoint08Abi, toPackedUserOperation } from "viem/account-abstraction"
import { Call, encodeFunctionData, encodeAbiParameters, decodeFunctionData, Hex, PrivateKeyAccount, TypedDataDefinition, TypedData, PublicClient } from "viem";

export async function openfortAccount(publicClient: PublicClient, wallet: PrivateKeyAccount) {
    const callType = {
        components: [
            { name: 'target', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        type: 'tuple',
    };

    return await toSmartAccount({
        client: publicClient,
        entryPoint: {
            abi: entryPoint08Abi,
            address: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
            version: "0.8" // using 0.8 temporarily, until viem supports 0.9
        },
        async encodeCalls(calls: readonly Call[]) {
            return encodeFunctionData({
                abi: ABI_7702_ACCOUNT,
                functionName: "execute",
                args: [
                    mode_1, // mode_1
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
            account: wallet,
            address: "0x770201093028dff97683df845D6cDF731D01Ff15"
        },
        async getNonce() {
            return publicClient.readContract({
                address: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
                abi: entryPoint08Abi,
                functionName: "getNonce",
                args: [wallet.address, 1n]
            })
        },
        async getAddress() {
            return wallet.address
        },
        async getFactoryArgs() {
            return { factory: '0x7702', factoryData: '0x' }
        },
        async getStubSignature() {
            return getStubEOASignature();
        },
        async signMessage(parameters) {
            const { message } = parameters
            return await wallet.signMessage({ message })
        },
        async signTypedData(parameters) {
            const { domain, types, primaryType, message } =
                parameters as TypedDataDefinition<TypedData, string>
            return await wallet.signTypedData({
                domain,
                message,
                primaryType,
                types,
            })
        },
        async signUserOperation(parameters) {
            const { chainId = publicClient.chain.id, authorization, ...userOperation } = parameters
            const packedUserOp = toPackedUserOperation({ ...userOperation, sender: wallet.address });
            const userOpHash = await publicClient.request({
                method: "eth_call",
                params: [
                    {
                        to: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
                        data: encodeFunctionData({
                            abi: entryPoint08Abi,
                            functionName: "getUserOpHash",
                            args: [packedUserOp]
                        })
                    },
                    "latest",
                    authorization ? {
                        [wallet.address]: {
                            code: `0xef0100${"0x770201093028dff97683df845D6cDF731D01Ff15".toLowerCase().substring(2)}`
                        }
                    } : {}
                ]
            })

            const rawSignature = await wallet.sign({
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

}
