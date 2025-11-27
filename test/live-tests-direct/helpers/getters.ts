import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { getKeyRegistrationInfoCallData } from "../../../src/helpers/keysHelper"; 
import { exit } from "process";


async function main() {
    const rpcUrl = process.env["BASE_SEPOLIA_RPC"];
    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const regInfoMK = await getKeyRegistrationInfoCallData(wallets.walletClientOwner7702?.account?.address, publicClient, 0n);

    const regInfoSK = await getKeyRegistrationInfoCallData(wallets.walletClientOwner7702?.account?.address, publicClient, 1n);

    console.log("Key Registration Info:");
    console.log("Master Key (MK):", regInfoMK);
    console.log("Session Key (SK):", regInfoSK);

}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
