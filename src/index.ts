import "dotenv/config";
import { exit } from "process";
import { baseSepolia } from "viem/chains";
import {walletsClient} from "./clients/walletClient";
import { buildPublicClient } from "./clients/publicClient";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    const sepoliaRpc = requireEnv("BASE_SEPOLIA_RPC");

    const publicClient = buildPublicClient(baseSepolia, sepoliaRpc);

    console.log(
        "Current block number on Base Sepolia:",
        await publicClient.getBlockNumber()
    );

    const walletsClients = walletsClient(baseSepolia, sepoliaRpc);
    const ownerWallet = walletsClients.walletClientOwner7702;
    if (!ownerWallet) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    console.log("Wallet Clients initialized:", ownerWallet.chain);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});
