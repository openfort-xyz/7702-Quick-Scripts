import { baseSepolia } from "viem/chains";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { getGuardians, getPendingStatusGuardians, isLocked, isGuardian, guardianCount, getDigestToSignCompleteRecovery } from "../../../src/helpers/account/socialRecovery";
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

    const getAllGuardians = await getGuardians(accountAddress, publicClient);
    console.log("Guardians:", getAllGuardians);

    const pendingStatus = await getPendingStatusGuardians(accountAddress, publicClient, getAllGuardians[0]);
    console.log("Pending Status of first guardian:", pendingStatus);

    const lockedStatus = await isLocked(accountAddress, publicClient);
    console.log("Is Account Locked?:", lockedStatus);

    const isFirstGuardian = await isGuardian(accountAddress, publicClient, getAllGuardians[0]);
    console.log("Is first address a Guardian?:", isFirstGuardian);

    const totalGuardians = await guardianCount(accountAddress, publicClient);
    console.log("Total number of Guardians:", totalGuardians);

    const digestToSign = await getDigestToSignCompleteRecovery(accountAddress, publicClient);
    console.log("Digest to sign for complete recovery:", digestToSign);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
