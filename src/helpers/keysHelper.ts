import { IKeys } from "@/interfaces/iTypes";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeFunctionData, Hex } from "viem";

export const registerKeyCallData = (key: IKeys.IKey, keyReg: IKeys.IKeyReg): Hex => 
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "registerKey",
        args: [
            key,
            keyReg
        ]});