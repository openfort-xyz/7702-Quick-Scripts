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
    keccak256,
    concat,
    toHex,
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

// EIP-712 TypeHash for PackedUserOperation (v0.8/v0.9)
const PACKED_USEROP_TYPEHASH = keccak256(
    toHex("PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)")
);

// Paymaster signature magic (keccak("PaymasterSignature")[:8])
const PAYMASTER_SIG_MAGIC = "22e325a297439656";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Strip paymaster signature from paymasterAndData for hash computation.
 * The paymaster signature is NOT part of the UserOp hash.
 */
function stripPaymasterSignature(paymasterData: Hex): Hex {
    if (!paymasterData || paymasterData === "0x" || paymasterData.length < 92) {
        return paymasterData;
    }

    const dataWithout0x = paymasterData.slice(2);
    const magic = dataWithout0x.slice(-16);

    if (magic.toLowerCase() !== PAYMASTER_SIG_MAGIC.toLowerCase()) {
        return paymasterData;
    }

    // Extract signature size (2 bytes before magic)
    const sigSizeHex = dataWithout0x.slice(-20, -16);
    const sigSize = Number.parseInt(sigSizeHex, 16);

    // Strip: signature + size(2 bytes) + magic(8 bytes)
    const totalToStrip = sigSize * 2 + 4 + 16;
    const contextData = dataWithout0x.slice(0, -totalToStrip);

    return ("0x" + contextData + PAYMASTER_SIG_MAGIC) as Hex;
}

/**
 * Pack accountGasLimits from verificationGasLimit and callGasLimit.
 */
function packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
    const packed = (verificationGasLimit << 128n) | callGasLimit;
    return toHex(packed, { size: 32 });
}

/**
 * Pack gasFees from maxPriorityFeePerGas and maxFeePerGas.
 */
function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
    const packed = (maxPriorityFeePerGas << 128n) | maxFeePerGas;
    return toHex(packed, { size: 32 });
}

/**
 * Pack paymasterAndData from paymaster, paymasterData, paymasterVerificationGasLimit, and paymasterPostOpGasLimit.
 */
function packPaymasterAndData(
    paymaster: Address | undefined,
    paymasterData: Hex | undefined,
    paymasterVerificationGasLimit: bigint | undefined,
    paymasterPostOpGasLimit: bigint | undefined
): Hex {
    if (!paymaster) return "0x";

    const parts: Hex[] = [
        paymaster,
        toHex(paymasterVerificationGasLimit ?? 0n, { size: 16 }),
        toHex(paymasterPostOpGasLimit ?? 0n, { size: 16 }),
    ];

    if (paymasterData && paymasterData !== "0x") {
        parts.push(paymasterData);
    }

    return concat(parts);
}

/**
 * Compute UserOp hash for EIP-7702 accounts.
 * CRITICAL: For EIP-7702, we must hash the delegate address instead of "0x7702".
 * This matches the EntryPoint's Eip7702Support._getEip7702InitCodeHashOverride() logic.
 */
function computeEip7702UserOpHash(
    userOp: any,
    chainId: number,
    entryPointAddress: Address
): Hex {
    // For EIP-7702, hash the delegate address (Calibur implementation) instead of "0x7702"
    const initCodeHash = keccak256(CALIBUR_ADDRESS);
    console.log("DEBUG: initCodeHash =", initCodeHash);
    console.log("DEBUG: CALIBUR_ADDRESS =", CALIBUR_ADDRESS);

    const callDataHash = keccak256(userOp.callData || "0x");
    console.log("DEBUG: callDataHash =", callDataHash);

    // Strip paymaster signature before hashing
    const strippedPaymasterData = stripPaymasterSignature(userOp.paymasterData);
    console.log("DEBUG: original paymasterData =", userOp.paymasterData);
    console.log("DEBUG: stripped paymasterData =", strippedPaymasterData);

    const paymasterAndData = packPaymasterAndData(
        userOp.paymaster,
        strippedPaymasterData,
        userOp.paymasterVerificationGasLimit,
        userOp.paymasterPostOpGasLimit
    );
    console.log("DEBUG: packed paymasterAndData =", paymasterAndData);
    const paymasterAndDataHash = keccak256(paymasterAndData);
    console.log("DEBUG: paymasterAndDataHash =", paymasterAndDataHash);

    const accountGasLimits = packAccountGasLimits(
        BigInt(userOp.verificationGasLimit),
        BigInt(userOp.callGasLimit)
    );
    console.log("DEBUG: accountGasLimits =", accountGasLimits);

    const gasFees = packGasFees(
        BigInt(userOp.maxPriorityFeePerGas),
        BigInt(userOp.maxFeePerGas)
    );
    console.log("DEBUG: gasFees =", gasFees);

    // Encode the struct hash
    const structHash = keccak256(
        encodeAbiParameters(
            parseAbiParameters(
                "bytes32, address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32"
            ),
            [
                PACKED_USEROP_TYPEHASH,
                userOp.sender,
                BigInt(userOp.nonce),
                initCodeHash,
                callDataHash,
                accountGasLimits,
                BigInt(userOp.preVerificationGas),
                gasFees,
                paymasterAndDataHash,
            ]
        )
    );
    console.log("DEBUG: structHash =", structHash);

    // Compute domain separator
    const DOMAIN_NAME = "ERC4337";
    const DOMAIN_VERSION = "1";
    const domainTypeHash = keccak256(
        toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    );
    const domainSeparator = keccak256(
        encodeAbiParameters(
            parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"),
            [
                domainTypeHash,
                keccak256(toHex(DOMAIN_NAME)),
                keccak256(toHex(DOMAIN_VERSION)),
                BigInt(chainId),
                entryPointAddress,
            ]
        )
    );
    console.log("DEBUG: domainSeparator =", domainSeparator);
    console.log("DEBUG: chainId =", chainId);
    console.log("DEBUG: entryPointAddress =", entryPointAddress);

    // Wrap in EIP-712
    const finalHash = keccak256(concat(["0x1901" as Hex, domainSeparator, structHash]));
    console.log("DEBUG: finalHash =", finalHash);
    return finalHash;
}

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

            // CRITICAL FIX FOR EIP-7702:
            // For gas estimation phase, viem uses factory="0x7702" which gets packed as initCode.
            // But for signing, the EntryPoint hashes the delegate address (CALIBUR_ADDRESS) instead.
            //
            // We need to temporarily replace factory with CALIBUR_ADDRESS for hash computation only,
            // so that when viem packs it into initCode, it will hash the delegate address.
            //
            // The actual UserOp sent to the bundler will still have factory="0x7702".
            const userOpForSigning = {
                ...params,
                signature: "0x",
                factory: CALIBUR_ADDRESS,  // Use delegate address for signing
                factoryData: "0x" as Hex,
            };

            const typedData = getUserOperationTypedData({
                chainId: chainIdValue,
                entryPointAddress: entryPoint.address,
                userOperation: userOpForSigning,
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
