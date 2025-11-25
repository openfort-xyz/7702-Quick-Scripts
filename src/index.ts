import "dotenv/config";
import { exit } from "process";
import { baseSepolia } from "viem/chains";
import {walletsClient} from "./clients/walletClient";
import { buildPublicClient } from "./clients/publicClient";
import { getStubEOASignature, encodeEOASignature, encodeWebAuthnSignature, encodeP256Signature, WebAuthnSignature, P256Signature } from "./helpers/accountHelpers";

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

    const wrappedEoaSignature = encodeEOASignature("0x864088609f8bfd27c4648d97ee05a6aac63a4fc0bc018c7123be0cfa530f8ebc394afd61672da9610fbf972c2abc698a7f811eb25595b515e8d5dbbcbf526c631c");
    console.log("EOA Signature:", wrappedEoaSignature);

    const webAuthnSignature: WebAuthnSignature = {
        requireUserVerification: true,
        authenticatorData: "0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000",
        clientDataJSON: `{"type":"webauthn.get","challenge":"Yhkhx-GoA4bghFJYFIMf7bzfCCxBKO9h2ri7imcPbpI","origin":"http://localhost:5173","crossOrigin":false}`,
        challengeIndex: 23,
        typeIndex: 1,
        r: "0x2b15cba11f6cb602e77afa982453882a937aa927daffdbbdc061b244cb0d3b28",
        s: "0x19df7755074a49d35fb5b5874e19973a9e4498ee27de4770f80ed12a14b389eb",
        pubKey: {
            x: "0x55f434ca0c4b938c457f673a570126a26ea03633b19f36047be2ffa005c40b50",
            y: "0x22e25237817804ecb4d942f6b03ea37281949283170a50ca815a6be3dd8e9333",
        },
    };
    const wrappedWebAuthnSignature = encodeWebAuthnSignature(webAuthnSignature);
    console.log("WebAuthn Signature:", wrappedWebAuthnSignature);

    const p256NonKeySignature: P256Signature = {
        r: "0x12a483a0ba7f65c715bee0cb7199e3c89e7a591fbafddd001dde6cbcb76851fc",
        s: "0x592005ea074f13e4639a461600db8ff2d79868aa6fc9af315ae13a5cd92aa15a",
        pubKey: {
            x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
            y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b",
        },
        keyType: 3,
    };
    const wrappedP256NonKeySignature = encodeP256Signature(p256NonKeySignature);
    console.log("P256 Signature:", wrappedP256NonKeySignature);

    // const stubEoaSignature = getStubEOASignature();
    // console.log("Stub EOA Signature:", stubEoaSignature);
}

main().catch((error) => {
    console.error(error);
    exit(1);
});