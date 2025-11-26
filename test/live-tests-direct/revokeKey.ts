import "dotenv/config";
import { exit } from "node:process";
import { keys } from "./helpers/getKeys";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../src/clients/walletClient";
import { revokeKeyCallData } from "../../src/helpers/keysHelper";
import { buildPublicClient } from "../../src/clients/publicClient";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    // 1. Setup clients
    const rpcUrl = requireEnv("BASE_SEPOLIA_RPC");
    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!owner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }

    console.log("Owner address:", owner.account.address);
    console.log("Owner balance:", await publicClient.getBalance({ address: owner.account.address }));

    // 2. Get keys
    const { keySK_2 } = keys();

    // 3. Create calldata
    console.log("Creating calldata...");
    const callData = revokeKeyCallData(
        keySK_2
    );
    console.log("Call Data:", callData);

    // // 4. Send transaction TO ITSELF (7702 pattern)
    // console.log("Sending initialization transaction to owner address...");
    // const txHash = await owner.sendTransaction({
    //     account: owner.account,
    //     to: owner.account.address,  // ✅ Send to self (7702 pattern)
    //     data: initCallData,
    //     chain: null,
    // });
    // console.log("Transaction sent! Hash:", txHash);

    // // 5. Wait and verify
    // console.log("Waiting for transaction to be mined...");
    // const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    // console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    // console.log("Initialization successful! TX Hash:", txHash);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});