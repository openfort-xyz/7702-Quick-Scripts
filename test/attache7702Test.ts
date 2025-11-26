import "dotenv/config";
import { exit } from "node:process";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../src/clients/walletClient";
import { buildPublicClient } from "../src/clients/publicClient";
import { signAuthorization } from "../src/helpers/signAuthorization";
import { checkAuthorization } from "../src/helpers/checkAuthorization";
import { attachAuthorization } from "../src/helpers/attachAuthorization";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    const rpcUrl = requireEnv("BASE_SEPOLIA_RPC");
    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    console.log("Wallet Clients initialized:", owner.account?.address);
    console.log("Wallet Balance:", await publicClient.getBalance({ address: owner.account!.address }));
    const authorized = await checkAuthorization(publicClient, owner.account.address);
    console.log("Is Authorized:", authorized);

    // if (authorized) {
    //     console.log("Authorization already attached for owner:", owner.account.address);
    //     return;
    // }

    console.log("No authorization found, signing a new one...");
    const signedAuth = await signAuthorization(wallets);
    console.log("Signed Authorization:", signedAuth);

    const txHash = await attachAuthorization(owner, signedAuth);
    console.log("Wait for the transaction to be mined...");
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Authorization transaction sent, tx hash:", txHash);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});
