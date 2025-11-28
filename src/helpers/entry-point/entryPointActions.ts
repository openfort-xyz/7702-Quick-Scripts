import { getAddress } from "@/data/addressBook";
import { encodeFunctionData, Hex, PublicClient } from "viem";
import { entryPoint08Abi } from "viem/_types/account-abstraction";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================
export const depositToCallData = (account: Hex): Hex =>
    encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: "depositTo",
        args: [account],
    });

export const addStakeCallData = (unstakeDelaySec: number): Hex =>
    encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: "addStake",
        args: [unstakeDelaySec],
    });
// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================
export const balanceOf = async (account: Hex, pC: PublicClient) =>
    await pC.readContract({
        address: getAddress("entryPointV9"),
        abi: entryPoint08Abi,
        functionName: "balanceOf",
        args: [account]
    });

export const getDepositInfo = async (account: Hex, pC: PublicClient) =>
    await pC.readContract({
        address: getAddress("entryPointV9"),
        abi: entryPoint08Abi,
        functionName: "getDepositInfo",
        args: [account]
    });