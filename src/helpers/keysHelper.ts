import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { keccak256, encodePacked } from "viem";
import { encodeFunctionData, Hex, PublicClient } from "viem";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================

export const registerKeyCallData = (key: IKeys.IKey, keyReg: IKeys.IKeyReg): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "registerKey",
        args: [
            key,
            keyReg
        ]
    });

export const revokeKeyCallData = (key: IKeys.IKey): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "revokeKey",
        args: [key]
    });

export const revokeAllKeysCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "revokeAllKeys",
        args: []
    });

// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================

export const getKeyRegistrationInfo = async (address: Hex, pC: PublicClient, id: bigint) => 
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "getKeyRegistrationInfo",
        args: [id],
    });

export const getKeyById = async (address: Hex, pC: PublicClient, id: bigint) => 
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "getKeyById",
        args: [id],
    });

export const isKeyActive = async (address: Hex, pC: PublicClient, keyHash: Hex) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "isKeyActive",
        args: [keyHash]
    });

// =============================================================
//                   INTERNAL HELPER FUNCTIONS
// =============================================================

/**
 * Computes the keyId for an EOA key.
 * Matches Solidity: keccak256(abi.encodePacked(eoa));
 * @param address The EOA address (20 bytes)
 * @returns The keyId hash
 */
export function computeKeyIdEOA(address: Hex): Hex {
    return keccak256(encodePacked(["address"], [address]));
}

/**
 * Computes the keyId for a WebAuthn / P-256 / P-256NONKEY key.
 * Matches Solidity: keccak256(abi.encodePacked(pubKey.x, pubKey.y));
 * @param pubKeyX The x coordinate of the public key (32 bytes)
 * @param pubKeyY The y coordinate of the public key (32 bytes)
 * @returns The keyId hash
 */
export function computeKeyIdP256(pubKeyX: Hex, pubKeyY: Hex): Hex {
    return keccak256(encodePacked(["bytes32", "bytes32"], [pubKeyX, pubKeyY]));
}