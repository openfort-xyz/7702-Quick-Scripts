import "dotenv/config";
import { baseSepolia } from "viem/chains";
import { buildPublicClient } from "../src/clients/publicClient";
import { getDigestToInitCallData, getDigestToInitOffchain } from "../src/helpers/initializeAccount";
import { IKeys } from "../src/interfaces/iTypes";
import { PubKey } from "../src/helpers/signaturesHelpers";
import { KeyType } from "../src/data/accountConstants";
import { assert } from "console";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

// IMPORTANT: For digest computation, we need to use an ACCOUNT ADDRESS (EOA with delegation),
// NOT the implementation contract address. The EIP-712 domain's verifyingContract must be the account.
const TEST_ACCOUNT_ADDRESS = "0xCdeaA61C5956BfB99e06FB93d8241848dC091127"; // Example account with delegation

const rpcUrl = requireEnv("BASE_SEPOLIA_RPC");
const publicClient = buildPublicClient(baseSepolia, rpcUrl);

const pubKey: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
};

const key: IKeys.IKey = {
    pubKey,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.WEBAUTHN,
};

const keyData: IKeys.IKeyReg = {
    validUntil: 281474976710655,
    validAfter: 0,
    limit: 0,  // Master key has no limit
    whitelisting: false,
    contractAddress: "0x0000000000000000000000000000000000000000",
    spendTokenInfo: {
        token: "0x0000000000000000000000000000000000000000",
        limit: BigInt(0),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(0),
};

const sessionKey: IKeys.IKey = {
    pubKey,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.P256_NONKEY,
};

const sessionKeyData: IKeys.IKeyReg = {
    validUntil: 1795706982,
    validAfter: 0,
    limit: 10,
    whitelisting: true,
    contractAddress: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
    spendTokenInfo: {
        token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC Base Sepolia
        limit: BigInt(0),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(100 * 1e18),
};

const initialGuardian = "0x8f04faeea2caea28551c664a3f907c3fe98f1b96d919899ab1f9abfa4aa37db4";

const run = async () => {
    console.log("=== Testing Digest Computation ===");
    console.log("Test Account:", TEST_ACCOUNT_ADDRESS);
    console.log("Network: Base Sepolia\n");

    // Get digest from on-chain contract
    console.log("1. Computing digest ON-CHAIN (calling contract)...");
    const { data: digestOnChain } = await publicClient.call({
        to: TEST_ACCOUNT_ADDRESS,
        data: getDigestToInitCallData(
            key,
            keyData,
            sessionKey,
            sessionKeyData,
            initialGuardian
        ),
    });
    console.log("   On-chain digest:", digestOnChain);

    // Compute digest off-chain using helper
    console.log("\n2. Computing digest OFF-CHAIN (using helper)...");
    const digestOffchain = await getDigestToInitOffchain(
        publicClient,
        TEST_ACCOUNT_ADDRESS,  // Use account address, not implementation!
        key,
        keyData,
        sessionKey,
        sessionKeyData,
        initialGuardian
    );
    console.log("   Off-chain digest:", digestOffchain);

    // Verify they match
    console.log("\n3. Verification:");
    if (digestOnChain === digestOffchain) {
        console.log("   ✅ SUCCESS: Digests match!");
        console.log("   The off-chain digest computation is correct.");
    } else {
        console.error("   ❌ FAIL: Digests do not match!");
        console.error("   On-chain: ", digestOnChain);
        console.error("   Off-chain:", digestOffchain);
        throw new Error("Digest mismatch!");
    }

    assert(
        digestOnChain === digestOffchain,
        "Digests do not match!"
    );
};

run().catch((err) => {
    console.error("\n❌ Test failed:");
    console.error(err);
    process.exit(1);
});
