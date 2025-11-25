import "dotenv/config";
import { exit } from "process";
import { baseSepolia } from "viem/chains";
import {walletsClient} from "./clients/walletClient";
import { buildPublicClient } from "./clients/publicClient";
import { getStubSignature, encodeEOASignature, encodeWebAuthnSignature, encodeP256Signature, WebAuthnSignature, P256Signature } from "./helpers/accountHelpers";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    const sepoliaRpc = requireEnv("BASE_SEPOLIA_RPC");

    const publicClient = buildPublicClient(baseSepolia, sepoliaRpc);

    console.log(
        "Current block number on Base Sepolia:",
        await publicClient.getBlockNumber()
    );

    const walletsClients = walletsClient(baseSepolia, sepoliaRpc);
    const ownerWallet = walletsClients.walletClientOwner7702;
    if (!ownerWallet) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    console.log("Wallet Clients initialized:", ownerWallet.chain);

    const eoaSignature = encodeEOASignature("0x864088609f8bfd27c4648d97ee05a6aac63a4fc0bc018c7123be0cfa530f8ebc394afd61672da9610fbf972c2abc698a7f811eb25595b515e8d5dbbcbf526c631c");
    console.log("EOA Signature:", eoaSignature);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});
