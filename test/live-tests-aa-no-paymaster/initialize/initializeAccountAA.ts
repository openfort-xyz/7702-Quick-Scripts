import "dotenv/config";
import { exit } from "node:process";
import { keys } from "../helpers/getKeys";
import { optimismSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "../../../src/data/addressBook";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { buildBundlerClient } from "../../../src/clients/bundlerClient";
import { openfortAccount } from "../../../src/clients/openfortSmartAccount";
import { keccak256, Hex, SignAuthorizationReturnType, parseUnits, encodeFunctionData, encodeAbiParameters } from "viem";
import { walletsClient, OWNER_7702_PRIVATE_KEY } from "../../../src/clients/walletClient";
import { signAuthorization } from "../../../src/helpers/authorization/signAuthorization";
import { checkAuthorization } from "../../../src/helpers/authorization/checkAuthorization";
import { initializeCallData, getDigestToInitOffchain } from "../../../src/helpers/account/initializeAccount";
import { ABI_7702_ACCOUNT } from "../../../src/data/abis";
import { mode_1 } from "../../../src/data/accountConstants";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

async function main() {
    // 1. Setup clients
    const rpcUrl = requireEnv("OP_SEPOLIA_RPC");
    const publicClient = buildPublicClient(optimismSepolia, rpcUrl);
    const wallets = walletsClient(optimismSepolia, rpcUrl);
    const bundlerClient = buildBundlerClient(optimismSepolia);
    const ownerSA = privateKeyToAccount(OWNER_7702_PRIVATE_KEY as Hex);
    const smartAccount = await openfortAccount(publicClient, ownerSA);

    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!owner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }

    console.log("SA address:", await smartAccount.getAddress())

    console.log("Owner address:", owner.account.address);
    console.log("Owner balance:", await publicClient.getBalance({ address: owner.account.address }));

    const senderCode = await publicClient.getCode({
        address: ownerSA.address
    });

    const delegateAddress = smartAccount.authorization.address;
    console.log("delegateAddress", delegateAddress)
    let authorization: SignAuthorizationReturnType | undefined;
    if(delegateAddress && senderCode !== `0xef0100${delegateAddress.toLowerCase().substring(2)}`) {
        authorization = await bundlerClient.signAuthorization({
            account: ownerSA,
            contractAddress: delegateAddress
        })
    }

    const hash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        authorization,
        factory: authorization ? "0x7702" : undefined,
        factoryData: authorization ? "0x" : undefined,
        calls: [
            {
                to: "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1",
                value: parseUnits('0.00000001', 18)
            }
        ],
    });

    // console.log("userop hash:: ", hash);

    // Check account bytecode
    // const code = await publicClient.getCode({ address: owner.account.address });
    // console.log("Account bytecode length:", code?.length || 0);
    // console.log("Bytecode prefix:", code?.slice(0, 10));

    // 2. Get keys
    // const { keyMK, keyData, keySK, sessionKeyData } = keys();

    // // 3. Define initial guardian
    // const initialGuardian = keccak256(wallets.walletClientPaymasterOwner!.account!.address);
    // console.log("Initial guardian:", initialGuardian);

    // // 4. Compute digest (use account address for EIP-712 domain, not implementation!)
    // console.log("Computing initialization digest...");
    // const digest = await getDigestToInitOffchain(
    //     publicClient,
    //     owner.account.address,  // CRITICAL: Use account address, not implementation address!
    //     keyMK,
    //     keyData,
    //     keySK,
    //     sessionKeyData,
    //     initialGuardian
    // );
    // console.log("Digest:", digest);

    // // 5. Sign digest (raw signature without Ethereum signed message prefix)
    // console.log("\n=== Signing Digest ===");
    // console.log("Digest to sign:", digest);
    // console.log("Signer address:", owner.account.address);

    // // CRITICAL: Sign the hash directly without the Ethereum signed message prefix
    // // The contract uses ECDSA.recover which expects a raw signature
    // if (!owner.account.sign) {
    //     throw new Error("Account does not support signing");
    // }
    // const signature = await owner.account.sign({ hash: digest });
    // console.log("Signature:", signature);

    // // Verify signature locally
    // console.log("\n=== Verifying Signature Locally ===");
    // try {
    //     const { recoverAddress } = await import("viem");
    //     const recovered = await recoverAddress({
    //         hash: digest,
    //         signature: signature,
    //     });
    //     console.log("Recovered address:", recovered);
    //     console.log("Signer address:  ", owner.account.address);
    //     console.log("Match:", recovered.toLowerCase() === owner.account.address.toLowerCase());

    //     if (recovered.toLowerCase() !== owner.account.address.toLowerCase()) {
    //         console.error("❌ WARNING: Signature recovery doesn't match signer!");
    //     } else {
    //         console.log("✅ Signature verified locally");
    //     }
    // } catch (error) {
    //     console.error("❌ Error verifying signature:", error);
    // }

    // // 6. Create calldata
    // console.log("Creating initialize calldata...");
    // const initCallData = initializeCallData(
    //     keyMK,
    //     keyData,
    //     keySK,
    //     sessionKeyData,
    //     signature,
    //     initialGuardian
    // );
    // console.log("Initialize Call Data:", initCallData);

    // // 7. Send transaction TO ITSELF (7702 pattern)
    // console.log("Sending initialization transaction to owner address...");
    // const txHash = await owner.sendTransaction({
    //     account: owner.account,
    //     to: owner.account.address,  // ✅ Send to self (7702 pattern)
    //     data: initCallData,
    //     chain: null,
    // });
    // console.log("Transaction sent! Hash:", txHash);

    // // 8. Wait and verify
    // console.log("Waiting for transaction to be mined...");
    // const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    // console.log("Transaction Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    // console.log("Initialization successful! TX Hash:", txHash);
}

main().catch((error) => {
    console.error("Error during initialization:", error);
    exit(1);
});
