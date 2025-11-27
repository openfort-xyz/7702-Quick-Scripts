import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { getKeyRegistrationInfo, getKeyById, isKeyActive, computeKeyIdP256 } from "../../../src/helpers/keysHelper";
import { exit } from "process";

async function main() {
    const rpcUrl = process.env["BASE_SEPOLIA_RPC"];
    if (!rpcUrl) {
        throw new Error("BASE_SEPOLIA_RPC is not defined in environment variables");
    }

    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const accountAddress = wallets.walletClientOwner7702?.account?.address;
    if (!accountAddress) {
        throw new Error("walletClientOwner7702 account address is not available");
    }

    const regInfoMK = await getKeyRegistrationInfo(accountAddress, publicClient, 0n);
    const regInfoSK = await getKeyRegistrationInfo(accountAddress, publicClient, 1n);

    console.log("Key Registration Info:");
    console.log("Master Key (MK):", regInfoMK);
    console.log("Session Key (SK):", regInfoSK);

    const getKeyByIdMK = await getKeyById(accountAddress, publicClient, 0n);
    const getKeyByIdSK = await getKeyById(accountAddress, publicClient, 1n);

    console.log("Get Key By ID:");
    console.log("Master Key (MK):", getKeyByIdMK);
    console.log("Session Key (SK):", getKeyByIdSK);

    // Compute keyId using encodePacked to match Solidity's abi.encodePacked
    const keyIdMK = await computeKeyIdP256(getKeyByIdMK.pubKey.x, getKeyByIdMK.pubKey.y);
    const keyIdSK = await computeKeyIdP256(getKeyByIdSK.pubKey.x, getKeyByIdSK.pubKey.y);

    const isMKActive = await isKeyActive(accountAddress, publicClient, keyIdMK);
    const isSKActive = await isKeyActive(accountAddress, publicClient, keyIdSK);

    console.log("Is Key Active:");
    console.log("Master Key (MK):", isMKActive);
    console.log("Session Key (SK):", isSKActive);

}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
