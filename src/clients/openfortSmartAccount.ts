import { ABI_7702_ACCOUNT } from "@/data/abis";
import { getAddress } from "@/data/addressBook";
import { mode_1 } from "@/data/accountConstants";
import { buildBundlerClient } from "@/clients/bundlerClient";
import { getStubEOASignature } from "@/helpers/keys/signaturesHelpers";
import { toSmartAccount, entryPoint08Abi, toPackedUserOperation, ToSmartAccountReturnType, } from "viem/account-abstraction"
import { Call, encodeFunctionData, encodeAbiParameters, decodeFunctionData, Hex, PrivateKeyAccount, TypedDataDefinition, TypedData, } from "viem";

export async function openfortAccount(bundlerClient: ReturnType<typeof buildBundlerClient>, wallet: PrivateKeyAccount): Promise<ToSmartAccountReturnType> {
    const callType = {
        components: [
            { name: 'target', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        type: 'tuple',
    };

    return await toSmartAccount({
        client: bundlerClient,
        entryPoint: {
            abi: entryPoint08Abi,
            address: getAddress("entryPointV9"),
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
            address: getAddress("opf7702ImplV1")
        },
        async getNonce() {
            return bundlerClient.readContract({
                address: getAddress("entryPointV9"),
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
            const { chainId = bundlerClient.chain.id, authorization, ...userOperation } = parameters
            const packedUserOp = toPackedUserOperation({ ...userOperation, sender: wallet.address });
            const userOpHash = await bundlerClient.request({
                method: "eth_call",
                params: [
                    {
                        to: getAddress("entryPointV9"),
                        data: encodeFunctionData({
                            abi: entryPoint08Abi,
                            functionName: "getUserOpHash",
                            args: [packedUserOp]
                        })
                    },
                    "latest",
                    authorization ? {
                        [wallet.address]: {
                            code: `0xef0100${getAddress("opf7702ImplV1").toLowerCase().substring(2)}`
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
