import "dotenv/config";
import { baseSepolia } from "viem/chains";
import { getAddress } from "../../../src/data/addressBook";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { ABI_7702_ACCOUNT } from "../../../src/data/abis";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    const rpcUrl = requireEnv("BASE_SEPOLIA_RPC");
    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const owner = wallets.walletClientOwner7702;
    if (!owner?.account) {
        throw new Error("walletClientOwner7702 is not configured");
    }

    console.log("=== Checking EIP-712 Domain ===\n");

    console.log("1. Domain from Implementation Contract:");
    const implAddress = getAddress("opf7702ImplV1");
    console.log("   Address:", implAddress);

    try {
        const implDomain = await publicClient.readContract({
            address: implAddress,
            abi: ABI_7702_ACCOUNT,
            functionName: "eip712Domain",
        });
        console.log("   Domain:", implDomain);
    } catch (error: any) {
        console.log("   Error:", error.message);
    }

    console.log("\n2. Domain from Account (EOA with delegation):");
    console.log("   Address:", owner.account.address);

    try {
        const accountDomain = await publicClient.readContract({
            address: owner.account.address,
            abi: ABI_7702_ACCOUNT,
            functionName: "eip712Domain",
        });
        console.log("   Domain:", accountDomain);
    } catch (error: any) {
        console.log("   Error:", error.message);
    }

    console.log("\n=== Analysis ===");
    console.log("The digest computation should use the ACCOUNT's domain, not the implementation's domain!");
}

main().catch(console.error);
