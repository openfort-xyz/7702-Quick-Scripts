import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeFunctionData, Hex } from "viem";

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

export const getKeyRegistrationInfoCallData = (id: bigint): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getKeyRegistrationInfo",
        args: [id]
    });

export const getKeyByIdCallData = (id: bigint): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getKeyById",
        args: [id]
    });

export const isKeyActiveCallData = (keyHash: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "isKeyActive",
        args: [keyHash]
    });