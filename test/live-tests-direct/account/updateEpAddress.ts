import "dotenv/config";
import { exit } from "node:process";
import { optimismSepolia } from "viem/chains";
import { getAddress } from "../../../src/data/addressBook";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { setEntryPointCallData, getEntryPoint } from "../../../src/helpers/account/setAddresses";

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
    const publicClient = buildPublicClient(optimismSepolia, rpcUrl);
    const wallets = walletsClient(optimismSepolia, rpcUrl);

    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!owner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }

    console.log("Owner address:", owner.account.address);
    console.log("Owner balance:", await publicClient.getBalance({ address: owner.account.address }));

    console.log("Current EP Address:", await getEntryPoint(owner.account.address, publicClient));
    // 2. Create calldata
    console.log("Creating calldata...");
    const callData = setEntryPointCallData(
        getAddress("entryPointV9")
    );
    console.log("Call Data:", callData);

    // 3. Send transaction TO ITSELF (7702 pattern)
    console.log("Sending key registration transaction to owner address...");
    const txHash = await owner.sendTransaction({
        account: owner.account,
        to: owner.account.address,
        data: callData,
        chain: optimismSepolia
        });
    console.log("Transaction sent! Hash:", txHash);

    // 4. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Key registration successful! TX Hash:", txHash);

    console.log("New EP Address:", await getEntryPoint(owner.account.address, publicClient));
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
