import "dotenv/config";
import { baseSepolia } from "viem/chains";
import { keys } from "../helpers/getKeys";
import { getAddress } from "../../../src/data/addressBook";
import { keccak256 } from "viem";
import { walletsClient } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { getDigestToInitOffchain, getDigestToInitCallData } from "../../src/helpers/initializeAccount";

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
    if (!owner?.account) {
        throw new Error("walletClientOwner7702 is not configured");
    }

    const { keyMK, keyData, keySK, sessionKeyData } = keys();
    const initialGuardian = keccak256(wallets.walletClientPaymasterOwner!.account!.address);

    console.log("=== Computing Digest Offchain ===");
    console.log("Using account address for EIP-712 domain:", owner.account.address);
    const digestOffchain = await getDigestToInitOffchain(
        publicClient,
        owner.account.address,  // Use account address, not implementation address!
        keyMK,
        keyData,
        keySK,
        sessionKeyData,
        initialGuardian
    );
    console.log("Offchain digest:", digestOffchain);

    console.log("\n=== Computing Digest Onchain ===");
    try {
        const callData = getDigestToInitCallData(
            keyMK,
            keyData,
            keySK,
            sessionKeyData,
            initialGuardian
        );

        const digestOnchain = await publicClient.call({
            to: owner.account.address,
            data: callData,
        });
        console.log("Onchain digest:", digestOnchain.data);

        if (digestOffchain === digestOnchain.data) {
            console.log("\n✅ DIGESTS MATCH - Signature computation is correct");
        } else {
            console.log("\n❌ DIGESTS DON'T MATCH - This is the problem!");
            console.log("Offchain:", digestOffchain);
            console.log("Onchain: ", digestOnchain.data);
        }
    } catch (error: any) {
        console.log("❌ Error calling getDigestToInit on contract:");
        console.log(error.message);
        console.log("\nThis might mean the account doesn't have the delegation attached or the function doesn't exist");
    }
}

main().catch(console.error);
