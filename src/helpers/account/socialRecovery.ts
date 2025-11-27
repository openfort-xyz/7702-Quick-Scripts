import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeFunctionData, Hex, PublicClient } from "viem";

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

export const getGuardians = async (address: Hex, pC: PublicClient) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "getGuardians",
        args: [],
    });

export const getPendingStatusGuardians = async (address: Hex, pC: PublicClient, guardian: Hex) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "getPendingStatusGuardians",
        args: [guardian],
    });

export const isLocked = async (address: Hex, pC: PublicClient) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "isLocked",
        args: [],
    });

export const isGuardian = async (address: Hex, pC: PublicClient, guardian: Hex) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "isGuardian",
        args: [guardian],
    });

export const guardianCount = async (address: Hex, pC: PublicClient) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "guardianCount",
        args: [],
    });

export const getDigestToSignCompleteRecovery = async (address: Hex, pC: PublicClient) =>
    await pC.readContract({
        address,
        abi: ABI_7702_ACCOUNT,
        functionName: "getDigestToSign",
        args: [],
    });