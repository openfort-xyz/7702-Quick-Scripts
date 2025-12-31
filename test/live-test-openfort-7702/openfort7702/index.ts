import {
    type Address,
    type Chain,
    type Client,
    type Hex,
    type LocalAccount,
    type PrivateKeyAccount,
    type Transport,
    encodeAbiParameters,
    parseAbiParameters,
    encodeFunctionData,
} from "viem";
import {
    type SmartAccount,
    entryPoint08Abi,
    getUserOperationTypedData,
    toSmartAccount,
} from "viem/account-abstraction";
import { getChainId, readContract } from "viem/actions";
import { getAction, parseAbi } from "viem/utils";
import { ABI_7702_ACCOUNT } from "./abis";
import { KEY_TYPE } from "./interfaces";

// =============================================================================
// Constants
// =============================================================================

// Openfort v0.9 implementation
const OPENFORT_ADDRESS = "0x77020901f40BE88Df754E810dA9868933787652B" as Address;

// EntryPoint v0.9
const ENTRYPOINT_ADDRESS = "0x433709009B8330FDa32311DF1C2AFA402eD8D009" as Address;

// Mode ERC7821
const MODE_1 = "0x0100000000000000000000000000000000000000000000000000000000000000" as Hex;

// Stub signature of EOA for gas estimation
const STUB_SIG_EOA = encodeAbiParameters(
    [
        { type: 'uint256' },
        { type: 'bytes' }
    ],
    [
        BigInt(KEY_TYPE.EOA),
        "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    ]
);

// Stub signature of WEBAUTHN for gas estimation
const STUB_SIG_WEBAUTHN = encodeAbiParameters(
    [
        { type: 'uint256' },
        { type: 'bytes' }
    ],
    [
        BigInt(KEY_TYPE.WEBAUTHN),
        "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    ]
);

// Stub signature of P256 for gas estimation
const STUB_SIG_P256 = encodeAbiParameters(
    [
        { type: 'uint256' },
        { type: 'bytes' }
    ],
    [
        BigInt(KEY_TYPE.P256),
        "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    ]
);

// Stub signature of P256NONKEY for gas estimation
const STUB_SIG_P256NONKEY = encodeAbiParameters(
    [
        { type: 'uint256' },
        { type: 'bytes' }
    ],
    [
        BigInt(KEY_TYPE.P256NONKEY),
        "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    ]
);

// Call type struct Call { address target; uint256 value; bytes data; }
const callType = {
    components: [
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
    ],
    type: 'tuple',
};

// =============================================================================
// Types
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenfortAccountConfig = {
    client: Client<Transport, Chain | undefined, any>;
    owner: LocalAccount;
};

// =============================================================================
// Main Function
// =============================================================================

/**
 * Create a Openfort Smart Account (v0.9)
 *
 * @example
 * ```ts
 * const account = await createOpenfortAccount({
 *     client,
 *     owner: privateKeyToAccount(privateKey),
 * });
 * ```
 */
export async function createOpenfortAccount(config: OpenfortAccountConfig): Promise<SmartAccount> {
    const { client, owner } = config;
    const localOwner = owner as PrivateKeyAccount;

    const entryPoint = {
        address: ENTRYPOINT_ADDRESS,
        abi: entryPoint08Abi, // v0.9 uses same ABI as v0.8
        version: "0.8" as const, // Cast for viem compatibility
    };

    let chainId: number;
    const getChainIdCached = async () => {
        if (chainId) return chainId;
        chainId = client.chain?.id ?? await getAction(client, getChainId, "getChainId")({});
        return chainId;
    };

    return toSmartAccount({
        client,
        entryPoint,
        authorization: { address: OPENFORT_ADDRESS, account: localOwner },

        getFactoryArgs: async () => ({ factory: "0x7702" as Address, factoryData: "0x" as Hex }),

        async getAddress() {
            return localOwner.address;
        },

        async encodeCalls(calls) {
            return encodeFunctionData({
                abi: ABI_7702_ACCOUNT,
                functionName: "execute",
                args: [
                    MODE_1, // ERC7821 mode_1
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

        async getNonce({ key = 0n } = {}) {
            return readContract(client, {
                abi: parseAbi(["function getNonce(address, uint192) pure returns (uint256)"]),
                address: entryPoint.address,
                functionName: "getNonce",
                args: [localOwner.address, key],
            });
        },

        async getStubSignature() {
            return STUB_SIG_EOA;
        },

        async getStubSignatureP256(keyType: KEY_TYPE) {
            switch (keyType) {
                case KEY_TYPE.WEBAUTHN:
                    return STUB_SIG_WEBAUTHN;
                case KEY_TYPE.P256:
                    return STUB_SIG_P256;
                case KEY_TYPE.P256NONKEY:
                    return STUB_SIG_P256NONKEY;
                default:
                    throw new Error(`Unknown key type: ${keyType}`);
            }

        },

        async sign({ hash }) {
            return localOwner.signMessage({ message: hash });
        },

        async signMessage({ message }) {
            return localOwner.signMessage({ message });
        },

        async signTypedData(params) {
            return localOwner.signTypedData(params as Parameters<typeof localOwner.signTypedData>[0]);
        },

        async signUserOperation(params) {
            const chainIdValue = params.chainId ?? await getChainIdCached();

            const typedData = getUserOperationTypedData({
                chainId: chainIdValue,
                entryPointAddress: entryPoint.address,
                userOperation: { ...params, sender: localOwner.address, signature: "0x" },
            });

            const sig = await localOwner.signTypedData(typedData);

            const packedSig = encodeAbiParameters(
                [
                    { type: 'uint256' },
                    { type: 'bytes' }
                ],
                [0n, sig]
            );

            return packedSig;
        },
    }) as Promise<SmartAccount>;
}

// =============================================================================
// Re-exports
// =============================================================================

export { OPENFORT_ADDRESS, ENTRYPOINT_ADDRESS };
