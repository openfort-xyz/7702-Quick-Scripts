import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeAbiParameters, encodeFunctionData, Hex } from "viem";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================
export const proposeGuardianCallData = (guardian: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "proposeGuardian",
        args: [guardian],
    });

export const confirmGuardianProposalCallData = (guardian: Hex): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "confirmGuardianProposal",
        args: [guardian],
    });

export const cancelGuardianProposalCallData = (guardian: Hex): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "cancelGuardianProposal",
        args: [guardian],
    });

export const revokeGuardianCallData = (guardian: Hex): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "revokeGuardian",
        args: [guardian],
    });

export const confirmGuardianRevocationCallData = (guardian: Hex): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "confirmGuardianRevocation",
        args: [guardian],
    });

export const cancelGuardianRevocationCallData = (guardian: Hex): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "cancelGuardianRevocation",
        args: [guardian],
    });

export const startRecoveryCallData = (recoveryKey: IKeys.IKey): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "startRecovery",
        args: [recoveryKey],
    });

export const completeRecoveryCallData = (signatures: Hex[]): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "completeRecovery",
        args: [signatures],
    });

export const cancelRecoveryCallData = (): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "cancelRecovery",
        args: [],
    });

// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================

export const getGuardiansCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getGuardians",
        args: [],
    });

export const getPendingStatusGuardiansCallData = (guardian: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getPendingStatusGuardians",
        args: [guardian],
    });

export const isLockedCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "isLocked",
        args: [],
    });

export const isGuardianCallData = (guardian: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "isGuardian",
        args: [guardian],
    });

export const guardianCountCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "guardianCount",
        args: [],
    });

export const getDigestToSignCompleteRecoveryCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getDigestToSign",
        args: [],
    });