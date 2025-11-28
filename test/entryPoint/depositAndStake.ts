import "dotenv/config";
import { exit } from "node:process";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../src/clients/walletClient";
import { buildPublicClient } from "../../src/clients/publicClient";
import { depositToCallData, addStakeCallData, balanceOf, getDepositInfo } from "../../src/helpers/entry-point/entryPointActions"

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

    const balanceOfEPBefore = await balanceOf(owner.account!.address, publicClient);
    console.log("balanceOf Before:", balanceOfEPBefore);

    const depositInfoBefore = await getDepositInfo(owner.account!.address, publicClient);
    console.log("deposit info Before:", depositInfoBefore);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});
