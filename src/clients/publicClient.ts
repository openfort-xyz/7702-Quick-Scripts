import { createPublicClient, http } from "viem";
import type { Chain, PublicClient } from "viem";

/**
 * Build a typed viem PublicClient for a given chain with an optional RPC override.
 * Falls back to the chain default RPC if none is provided.
 */
export function buildPublicClient(
    chain: Chain,
    rpcUrl?: string | null
): PublicClient {
    const url = rpcUrl?.trim() || chain.rpcUrls.default.http[0];

    if (!url) {
        throw new Error(`No RPC URL provided for chain ${chain.name}`);
    }

    return createPublicClient({
        chain,
        transport: http(url),
    });
}
