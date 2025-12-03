import { IKeys } from "@/interfaces/iTypes";
import { ABI_PAYMASTER_V3 } from "@/data/abis";
import { keccak256, encodePacked } from "viem";
import { encodeFunctionData, Hex, PublicClient } from "viem";
import { PackedUserOperation } from "viem/account-abstraction";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================

export const addSignerCallData = (signer: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "addSigner",
        args: [signer]
    });

export const addStakeCallData = (unstakeDelaySec: number): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "addStake",
        args: [unstakeDelaySec]
    });

export const depositCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "deposit",
        args: []
    });

export const grantRoleCallData = (role: Hex, account: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "grantRole",
        args: [role, account]
    });

export const removeSignerCallData = (signer: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "removeSigner",
        args: [signer]
    });

export const renounceRoleCallData = (role: Hex, callerConfirmation: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "renounceRole",
        args: [role, callerConfirmation]
    });

export const revokeRoleCallData = (role: Hex, account: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "revokeRole",
        args: [role, account]
    });

export const setManagerCallData = (newManager: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "setManager",
        args: [newManager]
    });

export const unlockStakeCallData = (): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "unlockStake",
        args: []
    });

export const withdrawStakeCallData = (withdrawAddress: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "withdrawStake",
        args: [withdrawAddress]
    });

export const withdrawToCallData = (withdrawAddress: Hex, amount: bigint): Hex =>
    encodeFunctionData({
        abi: ABI_PAYMASTER_V3,
        functionName: "withdrawTo",
        args: [withdrawAddress, amount]
    });

// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================

export const getMANAGER = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "MANAGER",
        args: [],
    });

export const getMANAGER_ROLE = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "MANAGER_ROLE",
        args: [],
    });

export const getOWNER = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "OWNER",
        args: [],
    });

export const getCostInToken = async (
    address: Hex, 
    pC: PublicClient,
    actualGasCost: bigint,
    postOpGas: bigint,
    actualUserOpFeePerGas: bigint,
    exchangeRate: bigint,

) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "getCostInToken",
        args: [actualGasCost, postOpGas, actualUserOpFeePerGas, exchangeRate],
    });

export const getDeposit = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "getDeposit",
        args: [],
    });

export const getHash = async (address: Hex, pC: PublicClient, mode: number, userOp: PackedUserOperation) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "getHash",
        args: [mode, userOp],
    });

export const getRoleAdmin = async (address: Hex, pC: PublicClient, role: Hex) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "getRoleAdmin",
        args: [role],
    });

export const getSigners = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "getSigners",
        args: [],
    });

export const hasRole = async (address: Hex, pC: PublicClient, role: Hex, account: Hex) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "hasRole",
        args: [role, account],
    });

export const signerAt = async (address: Hex, pC: PublicClient, id: bigint) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "signerAt",
        args: [id],
    });

export const signerCount = async (address: Hex, pC: PublicClient) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "signerCount",
        args: [],
    });

export const signers = async (address: Hex, pC: PublicClient, account: Hex) => 
    await pC.readContract({
        address,
        abi: ABI_PAYMASTER_V3,
        functionName: "signers",
        args: [account],
    });