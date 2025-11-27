import "dotenv/config";
import { keccak256 } from "viem";
import { exit } from "node:process";
import { keys } from "./helpers/getKeys";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { initializeCallData, getDigestToInitOffchain } from "../../src/helpers/initializeAccount";
import { checkAuthorization } from "../../src/helpers/checkAuthorization";

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

    // CRITICAL: Verify authorization is attached
    console.log("\n=== Checking Authorization ===");
    const authorized = await checkAuthorization(publicClient, owner.account.address);
    console.log("Authorization status:", authorized);

    if (!authorized) {
        console.error("\n❌ ERROR: Authorization not attached!");
        console.error("The account must have EIP-7702 authorization attached before initialization.");
        console.error("\nPlease run: npx tsx test/attache7702Test.ts");
        throw new Error("Account must have authorization attached before initialization");
    }
    console.log("✅ Authorization confirmed - account has delegation attached\n");

    // Check account bytecode
    const code = await publicClient.getCode({ address: owner.account.address });
    console.log("Account bytecode length:", code?.length || 0);
    console.log("Bytecode prefix:", code?.slice(0, 10));

    // 2. Get keys
    const { keyMK, keyData, keySK, sessionKeyData } = keys();

    // 3. Define initial guardian
    const initialGuardian = keccak256(wallets.walletClientPaymasterOwner!.account!.address);
    console.log("Initial guardian:", initialGuardian);

    // 4. Compute digest (use account address for EIP-712 domain, not implementation!)
    console.log("Computing initialization digest...");
    const digest = await getDigestToInitOffchain(
        publicClient,
        owner.account.address,  // CRITICAL: Use account address, not implementation address!
        keyMK,
        keyData,
        keySK,
        sessionKeyData,
        initialGuardian
    );
    console.log("Digest:", digest);

    // 5. Sign digest (raw signature without Ethereum signed message prefix)
    console.log("\n=== Signing Digest ===");
    console.log("Digest to sign:", digest);
    console.log("Signer address:", owner.account.address);

    // CRITICAL: Sign the hash directly without the Ethereum signed message prefix
    // The contract uses ECDSA.recover which expects a raw signature
    if (!owner.account.sign) {
        throw new Error("Account does not support signing");
    }
    const signature = await owner.account.sign({ hash: digest });
    console.log("Signature:", signature);

    // Verify signature locally
    console.log("\n=== Verifying Signature Locally ===");
    try {
        const { recoverAddress } = await import("viem");
        const recovered = await recoverAddress({
            hash: digest,
            signature: signature,
        });
        console.log("Recovered address:", recovered);
        console.log("Signer address:  ", owner.account.address);
        console.log("Match:", recovered.toLowerCase() === owner.account.address.toLowerCase());

        if (recovered.toLowerCase() !== owner.account.address.toLowerCase()) {
            console.error("❌ WARNING: Signature recovery doesn't match signer!");
        } else {
            console.log("✅ Signature verified locally");
        }
    } catch (error) {
        console.error("❌ Error verifying signature:", error);
    }

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

    // 7. Send transaction TO ITSELF (7702 pattern)
    console.log("Sending initialization transaction to owner address...");
    const txHash = await owner.sendTransaction({
        account: owner.account,
        to: owner.account.address,  // ✅ Send to self (7702 pattern)
        data: initCallData,
        chain: null,
    });
    console.log("Transaction sent! Hash:", txHash);

    // 8. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Initialization successful! TX Hash:", txHash);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
