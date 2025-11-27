import "dotenv/config";
import { exit } from "node:process";
import { keys } from "../helpers/getKeys";
import { baseSepolia } from "viem/chains";
import { decodeErrorResult, Hex } from "viem";
import { IKeys } from "../../../src/interfaces/iTypes";
import { KeyType } from "../../../src/data/accountConstants";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { completeRecoveryCallData } from "../../../src/helpers/account/socialRecovery";
import { ABI_7702_ACCOUNT } from "../../../src/data/abis";

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
    let signatures: Hex[] = [];
    signatures[0] = "0xb5553de315e0edf504d9150af82dafa5c4667fa618ed0a6f19c69b41166c55103ac225168df54212a25c1c01fd35bebfea408fdac2e31ddd6f80a4bbf9a5f1cb0000000000000000000000000000000000000000000000000000000000000000";
    
    // 3. Create calldata
    console.log("Creating calldata...");
    const callData = completeRecoveryCallData(
        signatures,
    );
    console.log("Call Data:", callData);

    // 4. Send transaction TO ITSELF (7702 pattern)
    console.log("Sending transaction to owner address...");
    let txHash;
    try {
        txHash = await owner.sendTransaction({
            account: owner.account,
            to: owner.account.address,
            data: callData,
            chain: baseSepolia
        });
        console.log("Transaction sent! Hash:", txHash);
    } catch (error: any) {
        console.error("❌ Transaction reverted");

        // Try to extract error data from various possible locations
        console.error("Extracting error data...");

        // Check all possible error data locations
        const errorData =
            error.data?.data ||
            error.cause?.data?.data ||
            error.details?.data ||
            error.walk?.((e: any) => e.data)?.data ||
            null;

        if (errorData && typeof errorData === 'string' && errorData.startsWith("0x")) {
            try {
                const decodedError = decodeErrorResult({
                    abi: ABI_7702_ACCOUNT,
                    data: errorData as `0x${string}`
                });
                console.error("✅ Error decoded successfully:");
                console.error("   Error name:", decodedError.errorName);
                if (decodedError.args && decodedError.args.length > 0) {
                    console.error("   Error args:", decodedError.args);
                }
            } catch (decodeErr) {
                console.error("Could not decode error. Raw data:", errorData);
            }
        } else {
            // Try simulation as fallback
            console.error("No direct error data, trying simulation...");
            try {
                await publicClient.call({
                    to: owner.account.address,
                    data: callData,
                    account: owner.account.address,
                });
            } catch (simError: any) {
                const simData =
                    simError.data?.data ||
                    simError.cause?.data?.data ||
                    simError.details?.data ||
                    simError.walk?.((e: any) => e.data)?.data ||
                    null;

                if (simData && typeof simData === 'string' && simData.startsWith("0x")) {
                    try {
                        const decodedError = decodeErrorResult({
                            abi: ABI_7702_ACCOUNT,
                            data: simData as `0x${string}`
                        });
                        console.error("✅ Error decoded successfully:");
                        console.error("   Error name:", decodedError.errorName);
                        if (decodedError.args && decodedError.args.length > 0) {
                            console.error("   Error args:", decodedError.args);
                        }
                    } catch (decodeErr) {
                        console.error("Could not decode error. Raw data:", simData);
                    }
                } else {
                    console.error("No hex error data found. Error:", error.message);
                }
            }
        }

        exit(1);
    }

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Key registration successful! TX Hash:", txHash);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});