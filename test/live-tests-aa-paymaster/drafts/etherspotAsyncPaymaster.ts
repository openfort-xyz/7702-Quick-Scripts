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
const sigLen = pad(toHex(65), { size: 2 });
const dummyPaymasterSig = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;

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

    return concat([
        paymasterAddress,
        stubVerificationGasLimit,
        stubPostOpGasLimit,
        paymasterData,
        dummyPaymasterSig,
        sigLen,
        PAYMASTER_SIG_MAGIC

    ]) as Hex;
}

async function createPaymasterDataForUserOpHash(paymasterAddress: Hex, userOp: UserOperation): Promise<Hex> {
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
                    "nonce": toHex(userOp.nonce),
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

    let userOp: UserOperation = {} as any;
    userOp.sender = await openfortAccount.getAddress();
    userOp.nonce = await openfortAccount.getNonce();
    userOp.factory = '0x7702';
    userOp.factoryData = '0x';
    userOp.callData = await openfortAccount.encodeCalls(call);
    userOp.verificationGasLimit = 0n;
    userOp.callGasLimit = 0n;
    userOp.preVerificationGas = 0n;
    userOp.maxFeePerGas = BigInt(gasFee.maxFeePerGas);
    userOp.maxPriorityFeePerGas = BigInt(gasFee.maxPriorityFeePerGas);
    userOp.paymaster = paymasterAddress;
    userOp.paymasterData = await createStubPaymasterData(paymasterAddress);
    userOp.paymasterVerificationGasLimit = 0n;
    userOp.paymasterPostOpGasLimit = 0n;

    const gasValues = await getGasValues(userOp, chain.id.toString(), bundlerUrl, openfortAccount, entrypoint09Address);

    console.log("gasValues returned: ", gasValues);

    userOp.callGasLimit = BigInt(gasValues.callGasLimit);
    userOp.verificationGasLimit = BigInt(gasValues.verificationGasLimit);
    userOp.preVerificationGas = BigInt(gasValues.preVerificationGas);
    userOp.paymasterVerificationGasLimit = BigInt(gasValues.paymasterVerificationGasLimit);
    userOp.paymasterPostOpGasLimit = BigInt(gasValues.paymasterPostOpGasLimit);
}

main(optimismSepolia);
