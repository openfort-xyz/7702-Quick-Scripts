import "dotenv/config";
import { exit } from "node:process";
import { baseSepolia } from "viem/chains";
import { mode_1 } from "../../src/data/accountConstants";
import { erc20Abi, encodeFunctionData, Hex } from "viem";
import { getAddress } from "../../src/data/addressBook";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { executeCallCallData, buildExecuteCall, buildExecuteBatchCall, encodeExecutionData, type StrictCall } from "../../src/helpers/executeCall";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

const reciverAddress: Hex = "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1";

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

    const balanceBeforeOwner = await publicClient.readContract({
        address: getAddress("usdcBaseSepolia"),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner.account.address],
    });

    const balanceBeforeReceiver = await publicClient.readContract({
        address: getAddress("usdcBaseSepolia"),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [reciverAddress],
    });

    console.log("💰Owner USDC balance before:", balanceBeforeOwner);
    console.log("💰Receiver USDC balance before:", balanceBeforeReceiver);

    // 2. Create Call
    const call: StrictCall = buildExecuteCall(
        getAddress("usdcBaseSepolia"),
        BigInt(0),
        encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [
                reciverAddress,
                BigInt(1000_0), // 0.01 USDC (6 decimals)
            ],
        })
    );
    console.log("Execute Call:", call);

    // 3. Create calldata
    console.log("Creating calldata...");
    const callData = executeCallCallData(
        mode_1,
        encodeExecutionData(call)
    );
    console.log("Call Data:", callData);

    // 4. Send transaction TO ITSELF (7702 pattern)
    console.log("Sending key registration transaction to owner address...");
    const txHash = await owner.sendTransaction({
        account: owner.account,
        to: owner.account.address,
        data: callData,
        chain: baseSepolia
    });
    console.log("Transaction sent! Hash:", txHash);

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Key registration successful! TX Hash:", txHash);

    const balanceAfterOwner = await publicClient.readContract({
        address: getAddress("usdcBaseSepolia"),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner.account.address],
    });

    const balanceAfterReceiver = await publicClient.readContract({
        address: getAddress("usdcBaseSepolia"),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [reciverAddress],
    });

    console.log("💰Owner USDC balance before:", balanceAfterOwner);
    console.log("💰Receiver USDC balance before:", balanceAfterReceiver);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});