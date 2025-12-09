import "dotenv/config";
import { exit } from "node:process";
import { optimismSepolia } from "viem/chains";
import { getAddress } from "../../src/data/addressBook";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { entryPoint08Abi, entryPoint08Address } from "viem/account-abstraction";
import { getDeposit, depositCallData, addStakeCallData } from "../../src/helpers/paymaster/paymasterActions";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    // 1. Setup clients
    const rpcUrl = "https://optimism-sepolia-public.nodies.app";
    const publicClient = buildPublicClient(optimismSepolia, rpcUrl);
    const wallets = walletsClient(optimismSepolia, rpcUrl);
    const paymasterAddress = getAddress("paymasterV9");

    const paymasterOwner = wallets.walletClientPaymasterOwner;
    if (!paymasterOwner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!paymasterOwner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }

    console.log("Paymaster Owner address:", paymasterOwner.account.address);
    console.log("Owner balance:", await publicClient.getBalance({ address: paymasterOwner.account.address }));

    const deposit = await getDeposit(paymasterAddress, publicClient);
    console.log("deposit:", deposit)

    const balanceOfEPBefore = await publicClient.readContract({
        address: entryPoint08Address,
        abi: entryPoint08Abi,
        functionName: "balanceOf",
        args: [paymasterAddress]
    });
    console.log("balanceOf:", balanceOfEPBefore);

    const depositInfoBefore = await publicClient.readContract({
        address: entryPoint08Address,
        abi: entryPoint08Abi,
        functionName: "getDepositInfo",
        args: [paymasterAddress]
    });
    console.log("deposit info:", depositInfoBefore);

    const depositTo = depositCallData();
    console.log("Sending transaction...");
    const txHash = await paymasterOwner.sendTransaction({
        account: paymasterOwner.account,
        to: paymasterAddress,
        data: depositTo,
        chain: optimismSepolia,
        value: 1_000_000_000_000_00n // 0.0001 ETH
    });
    console.log("Transaction sent! Hash:", txHash);

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Key registration successful! TX Hash:", txHash);

    const addStake = addStakeCallData(860);
    console.log("Sending transaction 2...");
    const txHash_2 = await paymasterOwner.sendTransaction({
        account: paymasterOwner.account,
        to: paymasterAddress,
        data: addStake,
        chain: optimismSepolia,
        value: 1_000_000_000_000_00n // 0.0001 ETH
    });
    console.log("Transaction sent! Hash:", txHash_2);

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt_2 = await publicClient.waitForTransactionReceipt({ hash: txHash_2 });
    console.log("Transaction Status:", receipt_2.status === "success" ? "SUCCESS" : "FAILED");
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
