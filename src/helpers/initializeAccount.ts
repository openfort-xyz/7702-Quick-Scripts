import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeFunctionData, Hex } from "viem";

export const initializeCallData = (
    key: IKeys.IKey,
    keyDat: IKeys.IKeyReg,
    sessionKey: IKeys.IKey,
    sessionKeyData: IKeys.IKeyReg,
    signature: Hex,
    initialGuardian: Hex
): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "initialize",
        args: [
            key,
            keyDat,
            sessionKey,
            sessionKeyData,
            signature,
            initialGuardian
        ]
    });

export const getDigestToInitCallData = (
    key: IKeys.IKey,
    keyDat: IKeys.IKeyReg,
    sessionKey: IKeys.IKey,
    sessionKeyData: IKeys.IKeyReg,
    initialGuardian: Hex
): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getDigestToInit",
        args: [
            key,
            keyDat,
            sessionKey,
            sessionKeyData,
            initialGuardian
        ]
    });