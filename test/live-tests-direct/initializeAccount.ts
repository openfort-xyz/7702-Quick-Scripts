import "dotenv/config";
import { keccak256 } from "viem";
import { exit } from "node:process";
import { keys } from "./helpers/getKeys";
import { baseSepolia } from "viem/chains";
import { getAddress } from "../../src/data/addressBook";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { initializeCallData, getDigestToInitOffchain } from "../../src/helpers/initializeAccount";

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
    const { keyMK, keyData, keySK, sessionKeyData } = keys();

    // 3. Define initial guardian
    const initialGuardian = keccak256(wallets.walletClientPaymasterOwner!.account!.address);
    console.log("Initial guardian:", initialGuardian);

    // 4. Compute digest
    console.log("Computing initialization digest...");
    const digest = await getDigestToInitOffchain(
        publicClient,
        getAddress("opf7702ImplV1"),
        keyMK,
        keyData,
        keySK,
        sessionKeyData,
        initialGuardian
    );
    console.log("Digest:", digest);

    // 5. Sign digest
    console.log("Signing digest with owner wallet...");
    const signature = await owner.signMessage({
        message: { raw: digest }
    });
    console.log("Signature:", signature);

    // 6. Create calldata
    console.log("Creating initialize calldata...");
    const initCallData = initializeCallData(
        keyMK,
        keyData,
        keySK,
        sessionKeyData,
        signature,
        initialGuardian
    );
    console.log("Initialize Call Data:", initCallData);

    // // 7. Send transaction TO ITSELF (7702 pattern)
    // console.log("Sending initialization transaction to owner address...");
    // const txHash = await owner.sendTransaction({
    //     account: owner.account,
    //     to: owner.account.address,  // ✅ Send to self (7702 pattern)
    //     data: initCallData,
    //     chain: null,
    // });
    // console.log("Transaction sent! Hash:", txHash);

    // // 8. Wait and verify
    // console.log("Waiting for transaction to be mined...");
    // const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    // console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    // console.log("Initialization successful! TX Hash:", txHash);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
