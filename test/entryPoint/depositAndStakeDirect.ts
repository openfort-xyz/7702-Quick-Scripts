import "dotenv/config";
import { Hex } from "viem"
import { exit } from "node:process";
import { optimismSepolia } from "viem/chains";
import { getAddress } from "../../src/data/addressBook";
import { mode_1 } from "../../src/data/accountConstants";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { depositToCallData, addStakeCallData, balanceOf, getDepositInfo } from "../../src/helpers/entry-point/entryPointActions"
import { executeCallCallData, buildExecuteBatchCall, encodeExecutionData, type StrictCall } from "../../src/helpers/account/executeCall";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    const rpcUrl = requireEnv("OP_SEPOLIA_RPC");
    const publicClient = buildPublicClient(optimismSepolia, rpcUrl);
    const wallets = walletsClient(optimismSepolia, rpcUrl);

    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!owner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }
    
    console.log("Wallet Clients initialized:", owner.account?.address);
    console.log("Wallet Balance:", await publicClient.getBalance({ address: owner.account!.address }));

    const balanceOfEPBefore = await balanceOf(owner.account!.address, publicClient);
    console.log("balanceOf Before:", balanceOfEPBefore);

    const depositInfoBefore = await getDepositInfo(owner.account!.address, publicClient);
    console.log("deposit info Before:", depositInfoBefore);

    const callDataDepositTo = depositToCallData(owner.account!.address);
    const callDataAddStake = addStakeCallData(860);

    console.log("Sending key registration transaction to owner address...");
    const txHash = await owner.sendTransaction({
        account: owner.account,
        to: getAddress("entryPointV9"),
        data: callDataDepositTo,
        value: BigInt(500),
        chain: optimismSepolia
    });
    console.log("Transaction sent! Hash:", txHash);

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("Key registration successful! TX Hash:", txHash);

    const balanceOfEPAfter = await balanceOf(owner.account!.address, publicClient);
    console.log("balanceOf After:", balanceOfEPAfter);

    const depositInfoAfter = await getDepositInfo(owner.account!.address, publicClient);
    console.log("deposit info After:", depositInfoAfter);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});
