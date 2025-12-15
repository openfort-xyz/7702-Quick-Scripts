import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";
import {
    Chain,
    concat,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    Hex,
    getAddress,
    pad,
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
import { addressBook } from "../../../src/data/addressBook";
import { helpers } from "../../../src/helpers/paymaster/paymasterData";
import { getHash } from "../../../src/helpers/paymaster/paymasterActions";
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
    const paymasterSigner = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

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


    // Align with foundry test values (no dynamic estimation)
    const maxPriorityFeePerGas = 15n * 10n ** 9n; // 15 gwei
    const maxFeePerGas = 80n * 10n ** 9n; // 80 gwei

    const call: Call[] = [
        {
            to: getAddress("0x000000000000000000000000000000000000bAbE"),
            value: 0n
        }
    ];

    const callData = await openfortAccount.encodeCalls(call);
    const nonce = await openfortAccount.getNonce();
    const paymasterAddress = addressBook.paymasterV9.address;
    const postGas = 50_000n;
    const modeByte = 1; // (VERIFYING_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH
    const validUntil = Math.floor(Date.now() / 1000) + 86400;
    const validAfter = 0;
    const verificationGasLimit = 400_000n;
    const callGasLimit = 600_000n;
    const preVerificationGas = 800_000n;

    // Dummy async paymaster data for hashing / estimation alignment
    const dummyPaymasterDataWithAsync = concat([
        pad(toHex(modeByte), { size: 1 }),
        pad(toHex(validUntil), { size: 6 }),
        pad(toHex(validAfter), { size: 6 }),
        helpers.DUMMY_SIG,
        pad(toHex((helpers.DUMMY_SIG.length - 2) / 2), { size: 2 }),
        helpers.PAYMASTER_SIG_MAGIC
    ]) as Hex;

    // Stage 1: paymasterData for account signature (mode/validity + magic)
    const paymasterDataStage1 = concat([
        pad(toHex(modeByte), { size: 1 }),
        pad(toHex(validUntil), { size: 6 }),
        pad(toHex(validAfter), { size: 6 }),
        helpers.PAYMASTER_SIG_MAGIC
    ]) as Hex;

    // Stage 2: paymasterData for paymaster hash (adds uint16(0) before magic)
    const paymasterDataStage2 = concat([
        pad(toHex(modeByte), { size: 1 }),
        pad(toHex(validUntil), { size: 6 }),
        pad(toHex(validAfter), { size: 6 }),
        pad(toHex(0), { size: 2 }),
        helpers.PAYMASTER_SIG_MAGIC
    ]) as Hex;

    const packedUserOpForPaymasterHash = toPackedUserOperation({
        sender: await openfortAccount.getAddress(),
        nonce,
        initCode: '0x7702',
        callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        paymaster: paymasterAddress as `0x${string}`,
        paymasterVerificationGasLimit: verificationGasLimit,
        paymasterPostOpGasLimit: postGas,
        paymasterData: paymasterDataStage2,
        signature: '0x'
    });

    const paymasterHash = await getHash(
        paymasterAddress as Hex,
        bundlerClient,
        helpers.VERIFYING_MODE,
        packedUserOpForPaymasterHash
    );

    const paymasterSignature = await paymasterSigner.signMessage({
        message: { raw: paymasterHash as Hex }
    });

    // Stage 3: final paymasterAndData with async signature + length
    const finalPaymasterAndData = concat([
        paymasterAddress,
        pad(toHex(verificationGasLimit), { size: 16 }),
        pad(toHex(postGas), { size: 16 }),
        pad(toHex(modeByte), { size: 1 }),
        pad(toHex(validUntil), { size: 6 }),
        pad(toHex(validAfter), { size: 6 }),
        paymasterSignature as Hex,
        pad(toHex((paymasterSignature.length - 2) / 2), { size: 2 }),
        helpers.PAYMASTER_SIG_MAGIC
    ]) as Hex;

    // Final account signature over the full userOp (with paymaster sig)
    const accountSignature = await openfortAccount.signUserOperation({
        sender: await openfortAccount.getAddress(),
        nonce,
        initCode: '0x7702',
        callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxPriorityFeePerGas,
        maxFeePerGas,
        paymasterAndData: finalPaymasterAndData,
        signature: '0x' as `0x${string}`
    });

    const finalUserOp = {
        sender: await openfortAccount.getAddress(),
        nonce: toHex(nonce),
        initCode: '0x7702',
        callData,
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        maxFeePerGas: toHex(maxFeePerGas),
        paymasterAndData: finalPaymasterAndData,
        signature: accountSignature
    };

    console.log("\n=== Final UserOperation (async verifying mode) ===");
    console.log("paymasterAndData length (bytes):", (finalPaymasterAndData.length - 2) / 2);
    console.log("paymasterAndData:", finalPaymasterAndData);
    console.log("signature (account):", accountSignature);
    console.log("signature (paymaster):", paymasterSignature);
    console.log("userOp ready to send:", finalUserOp);

    const packedForHandleOps = {
        sender: await openfortAccount.getAddress(),
        nonce,
        initCode: '0x7702' as Hex,
        callData,
        accountGasLimits: concat([
            pad(toHex(verificationGasLimit), { size: 16 }),
            pad(toHex(callGasLimit), { size: 16 })
        ]) as Hex,
        preVerificationGas,
        gasFees: concat([
            pad(toHex(maxPriorityFeePerGas), { size: 16 }),
            pad(toHex(maxFeePerGas), { size: 16 })
        ]) as Hex,
        paymasterAndData: finalPaymasterAndData,
        signature: accountSignature as Hex
    };

    const beneficiary = "0x0047E22c52DEEe45ED3ab87D4E27DaD61Db81E78";
    const rawUserOp = encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: "handleOps",
        args: [[packedForHandleOps], beneficiary]
    });

    console.log("rawUserOp to send to entrypoint:", rawUserOp);
}
main(optimismSepolia);
