import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeFunctionData, Hex } from "viem";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================
export const setEntryPointCallData = (entryPointAddress: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "setEntryPoint",
        args: [entryPointAddress],
    });

export const setWebAuthnVerifierCallData = (verifierAddress: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "setWebAuthnVerifier",
        args: [verifierAddress],
    });

export const setGasPolicyCallData = (gasPolicyAddress: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "setGasPolicy",
        args: [gasPolicyAddress],
    });

// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================

export const getEntryPointCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "entryPoint",
        args: [],
    });

export const getWebAuthnVerifierCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "webAuthnVerifier",
        args: [],
    });

export const getGasPolicyCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "gasPolicy",
        args: [],
    });