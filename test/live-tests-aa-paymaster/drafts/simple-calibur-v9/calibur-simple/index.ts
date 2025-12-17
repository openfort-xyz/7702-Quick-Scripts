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
} from "viem";
import {
    type SmartAccount,
    entryPoint08Abi,
    getUserOperationTypedData,
    toSmartAccount,
} from "viem/account-abstraction";
import { getChainId, readContract } from "viem/actions";
import { getAction, parseAbi } from "viem/utils";

// =============================================================================
// Constants
// =============================================================================

// Calibur v0.9 implementation
const CALIBUR_ADDRESS = "0x0909bABe99b0A5f8C1fbfcD5E2510E6c15082c53" as Address;

// EntryPoint v0.9
const ENTRYPOINT_ADDRESS = "0x433709009B8330FDa32311DF1C2AFA402eD8D009" as Address;

// Root key hash (owner EOA sentinel)
const ROOT_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

// Stub signature for gas estimation
const STUB_SIG = "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as Hex;

// =============================================================================
// Types
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CaliburAccountConfig = {
    client: Client<Transport, Chain | undefined, any>;
    owner: LocalAccount;
};

// =============================================================================
// Main Function
// =============================================================================

/**
 * Create a Calibur Smart Account (v0.9)
 *
 * @example
 * ```ts
 * const account = await createCaliburAccount({
 *     client,
 *     owner: privateKeyToAccount(privateKey),
 * });
 * ```
 */
export async function createCaliburAccount(config: CaliburAccountConfig): Promise<SmartAccount> {
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
        authorization: { address: CALIBUR_ADDRESS, account: localOwner },
        getFactoryArgs: async () => ({ factory: "0x7702" as Address, factoryData: "0x" as Hex }),

        async getAddress() {
            return localOwner.address;
        },

        async encodeCalls(calls) {
            const callTuples = calls.map(c => [c.to, c.value ?? 0n, c.data ?? "0x"] as const);
            const encoded = encodeAbiParameters(
                parseAbiParameters("((address,uint256,bytes)[],bool)"),
                [[callTuples, true]],
            );
            return `0x8dd7712f${encoded.slice(2)}` as Hex; // executeUserOp selector
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
            return encodeAbiParameters(
                parseAbiParameters("bytes32,bytes,bytes"),
                [ROOT_KEY, STUB_SIG, "0x"],
            );
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

            return encodeAbiParameters(
                parseAbiParameters("bytes32,bytes,bytes"),
                [ROOT_KEY, sig, "0x"],
            );
        },
    }) as Promise<SmartAccount>;
}

// =============================================================================
// Re-exports
// =============================================================================

export { CALIBUR_ADDRESS, ENTRYPOINT_ADDRESS };
