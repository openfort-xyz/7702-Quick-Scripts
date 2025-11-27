import "dotenv/config";
import { baseSepolia } from "viem/chains";
import { buildPublicClient } from "../../../src/clients/publicClient";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function decodeError(accountAddress: string, calldata: string) {
    const rpcUrl = requireEnv("BASE_SEPOLIA_RPC");
    const publicClient = buildPublicClient(baseSepolia, rpcUrl);

    try {
        await publicClient.call({
            to: accountAddress as `0x${string}`,
            data: calldata as `0x${string}`,
            account: accountAddress as `0x${string}`,
        });
        console.log("✅ Transaction would succeed");
    } catch (error: any) {
        const errorData = error.cause?.data || error.data;
        console.log("❌ Transaction would revert");
        console.log("Error data:", errorData);

        if (errorData) {
            console.log("\nTo decode, run:");
            console.log(`cast 4byte ${errorData}`);
        }
    }
}

const accountAddress = process.argv[2];
const calldata = process.argv[3];

if (!accountAddress || !calldata) {
    console.log("Usage: npx tsx decodeError.ts <account> <calldata>");
    process.exit(1);
}

decodeError(accountAddress, calldata);
