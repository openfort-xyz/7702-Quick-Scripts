import "dotenv/config";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { ABI_7702_ACCOUNT } from "../../src/data/abis";

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

    console.log("Checking account:", owner.account.address);

    // Try to call a view function to see if account is initialized
    try {
        // Try to read the nonce - if this works, account is initialized
        const result = await publicClient.readContract({
            address: owner.account.address,
            abi: ABI_7702_ACCOUNT,
            functionName: "id",
        });
        console.log("✅ Account is INITIALIZED");
        console.log("Account id:", result);
    } catch (error: any) {
        console.log("❌ Account might NOT be initialized or method doesn't exist");
        console.log("Error:", error.message);
    }

    // Check the raw storage at slot 0 (where initialized flag would be)
    try {
        const storage = await publicClient.getStorageAt({
            address: owner.account.address,
            slot: "0xeddd36aac8c71936fe1d5edb073ff947aa7c1b6174e87c15677c96ab9ad95400",
        });
        console.log("\nStorage at slot 0:", storage);

        if (storage && storage !== "0xeddd36aac8c71936fe1d5edb073ff947aa7c1b6174e87c15677c96ab9ad95400") {
            console.log("⚠️  Account appears to have initialized state");
        } else {
            console.log("✅ Account storage is empty");
        }
    } catch (error: any) {
        console.log("Error reading storage:", error.message);
    }
}

main().catch(console.error);
