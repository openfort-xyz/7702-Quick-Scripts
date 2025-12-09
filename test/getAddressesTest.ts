import { exit } from "process";
import { baseSepolia } from "viem/chains";
import { walletsClient } from "../src/clients/walletClient";
import { buildPublicClient } from "../src/clients/publicClient";
import {getEntryPoint, getWebAuthnVerifier, getGasPolicy} from "../src/helpers/setAddresses";


async function main() {
    const rpcUrl = process.env["BASE_SEPOLIA_RPC"];
    if (!rpcUrl) {
        throw new Error("BASE_SEPOLIA_RPC is not defined in environment variables");
    }

    const publicClient = buildPublicClient(baseSepolia, rpcUrl);
    const wallets = walletsClient(baseSepolia, rpcUrl);

    const entryPointAddress = getEntryPoint(wallets.walletClientOwner7702!.account!.address, publicClient);

    const webAuthnVerifierAddress = getWebAuthnVerifier(
        wallets.walletClientOwner7702!.account!.address,
        publicClient
    );

    const gasPolicyAddress = getGasPolicy(
        wallets.walletClientOwner7702!.account!.address,
        publicClient
    );

    entryPointAddress.then((address) => {
        console.log("Entry Point Address:", address);
    });

    webAuthnVerifierAddress.then((address) => {
        console.log("WebAuthn Verifier Address:", address);
    });

    gasPolicyAddress.then((address) => {
        console.log("Gas Policy Address:", address);
    });
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
