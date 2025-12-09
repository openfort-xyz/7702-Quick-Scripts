import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";
import {
    Chain,
    decodeErrorResult,
    decodeFunctionData,
    encodeAbiParameters,
    encodeFunctionData,
    Hex,
    parseUnits,
    publicActions,
    SignAuthorizationReturnType,
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

// Helper function to extract error data from bundler error messages
function extractErrorData(detailsString: string): Hex | null {
    const match = detailsString.match(/0x[a-fA-F0-9]{8,}/);
    return match ? match[0] as Hex : null;
}

// Helper function to get AA error explanation
function getAAErrorExplanation(errorCode: string): string {
    const aaErrors: Record<string, string> = {
        'AA23': 'Signature validation reverted (or OOG)',
        'AA24': 'Signature validation failed',
        'AA25': 'Invalid account nonce',
        'AA21': 'Didn\'t pay prefund',
        'AA22': 'Account expired or not due'
    };
    return aaErrors[errorCode] || 'Unknown AA error';
}

const main = async (
    chain: Chain
) => {
    const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);

    const bundlerUrl = process.env.BUNDLER_URL || getFreeBundlerUrl(chain.id);

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
        async encodeCalls (calls: readonly Call[]) {
            return encodeFunctionData({
                abi: ABI_7702_ACCOUNT,
                functionName: "execute",
                args: [
                    "0x0100000000000000000000000000000000000000000000000000000000000000", // mode_1
                    encodeAbiParameters(
                        [{...callType, type: 'tuple[]'}],
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
            if(res.functionName === "executeBatch") {
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
            const packedUserOp = toPackedUserOperation({...userOperation, sender: owner.address});
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
    if(delegateAddress && senderCode !== `0xef0100${delegateAddress.toLowerCase().substring(2)}`) {
        authorization = await bundlerClient.signAuthorization({
            account: owner,
            contractAddress: delegateAddress
        })
    }

    try {
        const hash = await bundlerClient.sendUserOperation({
            account: openfortAccount,
            authorization,
            factory: authorization ? "0x7702" : undefined,
            factoryData: authorization ? "0x" : undefined,
            calls: [
                {
                    to: "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1",
                    value: parseUnits('0.00000001', 18)
                }
            ],
        });

        console.log("userop hash:: ", hash);
        return hash;
    } catch (error: any) {
        console.error("\n❌ UserOperation Failed\n");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        // Extract EntryPoint error code
        let aaErrorCode = 'Unknown';
        if (error.cause?.details) {
            const aaMatch = error.cause.details.match(/AA\d+/);
            if (aaMatch) {
                aaErrorCode = aaMatch[0];
            }
        }

        console.log("\n📋 Error Details:");
        console.log(`  • Error Type: ${error.name || 'Unknown'}`);
        console.log(`  • EntryPoint Code: ${aaErrorCode}`);
        console.log(`  • Explanation: ${getAAErrorExplanation(aaErrorCode)}`);

        // Decode custom error using viem
        if (error.cause?.details) {
            const errorData = extractErrorData(error.cause.details);
            if (errorData) {
                try {
                    const decodedError = decodeErrorResult({
                        abi: ABI_7702_ACCOUNT,
                        data: errorData
                    });
                    console.log(`  • Contract Error: ${decodedError.errorName}`);
                    if (decodedError.args && decodedError.args.length > 0) {
                        console.log(`  • Error Arguments:`, decodedError.args);
                    }

                    // Provide context-specific suggestions
                    console.log("\n💡 Suggested Fixes:");
                    switch (decodedError.errorName) {
                        case 'OpenfortBaseAccount7702V1__InvalidSignature':
                            console.log("  1. Verify signature encoding format: encodeAbiParameters([uint256, bytes], [0n, rawSignature])");
                            console.log("  2. Check that the owner account is signing the correct userOpHash");
                            console.log("  3. Ensure state override is used during gas estimation (check signUserOperation)");
                            console.log("  4. Verify the account is properly initialized with the master key");
                            break;
                        case 'KeyManager__KeyInactive':
                        case 'KeyManager__KeyRevoked':
                            console.log("  1. The signing key might not be registered or active");
                            console.log("  2. Check if account initialization completed successfully");
                            console.log("  3. Verify the key hasn't been revoked");
                            console.log("  4. Try re-initializing the account with the key");
                            break;
                        case 'KeyManager__InvalidSignatureLength':
                            console.log("  1. Signature might be malformed or incorrect length");
                            console.log("  2. Check stub signature length (should be valid for gas estimation)");
                            console.log("  3. Verify signature encoding matches expected format");
                            break;
                        case 'NotFromEntryPoint':
                            console.log("  1. This function can only be called by the EntryPoint");
                            console.log("  2. Don't call validateUserOp directly");
                            break;
                        default:
                            console.log(`  • Unknown error: ${decodedError.errorName}`);
                            console.log("  • Check the contract implementation for this error");
                    }
                } catch (decodeError) {
                    console.log(`  • Raw Error Data: ${errorData}`);
                    console.log(`  • Could not decode error (not in ABI)`);
                }
            }
        }

        // Log UserOp details for debugging
        console.log("\n📦 UserOperation Details:");
        console.log(`  • Sender: ${openfortAccount.address}`);
        console.log(`  • Authorization: ${authorization ? 'Required (first tx)' : 'Not needed (delegated)'}`);

        // Extract details from error metadata if available
        if (error.metaMessages) {
            const nonceMatch = error.metaMessages.find((msg: string) => msg.includes('nonce:'));
            const signatureMatch = error.metaMessages.find((msg: string) => msg.includes('signature:'));

            if (nonceMatch) {
                const nonce = nonceMatch.split('nonce:')[1]?.trim();
                console.log(`  • Nonce: ${nonce}`);
            }
            if (signatureMatch) {
                const sig = signatureMatch.split('signature:')[1]?.trim().substring(0, 20);
                console.log(`  • Signature (first 20 chars): ${sig}...`);
            }
        }

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        throw error;
    }
}
main(optimismSepolia);
