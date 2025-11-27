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
    const regInfoSK_2 = await getKeyRegistrationInfo(accountAddress, publicClient, 3n);

    console.log("Key Registration Info:");
    console.log("Master Key (MK):", regInfoMK);
    console.log("Session Key (SK):", regInfoSK);
    console.log("Session Key (SK_2):", regInfoSK_2);

    const getKeyByIdMK = await getKeyById(accountAddress, publicClient, 0n);
    const getKeyByIdSK = await getKeyById(accountAddress, publicClient, 1n);
    const getKeyByIdSK_2 = await getKeyById(accountAddress, publicClient, 3n);

    console.log("Get Key By ID:");
    console.log("Master Key (MK):", getKeyByIdMK);
    console.log("Session Key (SK):", getKeyByIdSK);
    console.log("Session Key (SK_2):", getKeyByIdSK_2);

    // Compute keyId using encodePacked to match Solidity's abi.encodePacked
    const keyIdMK = await computeKeyIdP256(getKeyByIdMK.pubKey.x, getKeyByIdMK.pubKey.y);
    const keyIdSK = await computeKeyIdP256(getKeyByIdSK.pubKey.x, getKeyByIdSK.pubKey.y);
    const keyIdSK_2 = await computeKeyIdP256(getKeyByIdSK_2.pubKey.x, getKeyByIdSK_2.pubKey.y);

    const isMKActive = await isKeyActive(accountAddress, publicClient, keyIdMK);
    const isSKActive = await isKeyActive(accountAddress, publicClient, keyIdSK);
    const isSK_2Active = await isKeyActive(accountAddress, publicClient, keyIdSK_2);

    console.log("Is Key Active:");
    console.log("Master Key (MK):", isMKActive);
    console.log("Session Key (SK):", isSKActive);
    console.log("Session Key (SK):", isSK_2Active);

}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
