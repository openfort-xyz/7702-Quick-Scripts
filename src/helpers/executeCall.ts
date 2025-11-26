import { Call } from "viem";
import { ABI_7702_ACCOUNT } from "@/data/abis";
import { encodeAbiParameters, encodeFunctionData, Hex } from "viem";

type StrictCall = {
    to: Hex;
    value: bigint;
    data: Hex;
};

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================
export const executeCallCallData = (mode: Hex, executionData: Hex): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "execute",
        args: [mode, executionData],
    });

// =============================================================
//                     INTERNAL HELPERS
// =============================================================

export const buildExecuteCall = (to: Hex, value: bigint, data: Hex): StrictCall => ({
    to,
    value,
    data,
});

export const buildExecuteBatchCall = (
    to: Hex[],
    value: bigint[],
    data: Hex[]
): StrictCall[] => {
    if (to.length !== value.length || to.length !== data.length) {
        throw new Error("to, value, and data arrays must be the same length");
    }

    return to.map((target, i) => ({
        to: target,
        value: value[i],
        data: data[i],
    }));
};

/**
 * abi.encode(calls) helper for execution payloads.
 * Accepts a single call or an array and always encodes as Call[].
 */
export const encodeExecutionData = (calls: Call | StrictCall | Array<Call | StrictCall>): Hex => {
    const normalized: StrictCall[] = (Array.isArray(calls) ? calls : [calls]).map((c) => {
        if (c.value === undefined || c.data === undefined) {
            throw new Error("Each call must include value and data");
        }
        return {
            to: c.to,
            value: BigInt(c.value),
            data: c.data as Hex,
        };
    });
    if (normalized.length === 0) {
        throw new Error("At least one call is required to encode execution data");
    }

    return encodeAbiParameters(
        [
            {
                type: "tuple[]",
                components: [
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "data", type: "bytes" },
                ],
            },
        ],
        [normalized]
    );
};
