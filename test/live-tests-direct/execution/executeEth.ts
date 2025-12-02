import "dotenv/config";
import { exit } from "node:process";
import { optimismSepolia } from "viem/chains";
import { mode_1 } from "../../../src/data/accountConstants";
import { Hex, privateKeyToAccount, SignAuthorizationReturnType } from "viem";
import { getAddress } from "../../../src/data/addressBook";
import { walletsClient, OWNER_7702_PRIVATE_KEY } from "../../../src/clients/walletClient";
import { buildPublicClient } from "../../../src/clients/publicClient";
import { buildBundlerClient } from "../../../src/clients/bundlerClient";
import { openfortAccount } from "../../../src/clients/openfortSmartAccount";
import { checkAuthorization } from "../../../src/helpers/authorization/checkAuthorization";
import { executeCallCallData, buildExecuteCall, encodeExecutionData, type StrictCall } from "../../../src/helpers/account/executeCall";

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined in environment variables`);
    }
    return value;
};

const receiverAddress: Hex = "0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1";

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

    console.log("SA address:", await smartAccount.getAddress());
    console.log("Owner address:", owner.account.address);
    console.log("Owner balance:", await publicClient.getBalance({ address: owner.account.address }));

    // Check if authorization is needed
    const senderCode = await publicClient.getCode({
        address: ownerSA.address
    });

    const delegateAddress = smartAccount.authorization.address;
    let authorization: SignAuthorizationReturnType | undefined;

    if(senderCode !== `0xef0100${delegateAddress.toLowerCase().substring(2)}`) {
        console.log("\nCreating EIP-7702 authorization...");
        authorization = await bundlerClient.signAuthorization({
            account: ownerSA,
            contractAddress: delegateAddress
        });
        console.log("Authorization created!");
    } else {
        console.log("\nAccount already delegated, no authorization needed");
    }

    console.log("Delegate address:", delegateAddress);

    // Verify authorization status
    console.log("\n=== Checking Authorization ===");
    const authorized = await checkAuthorization(publicClient, owner.account.address);
    console.log("Authorization status:", authorized);

    const balanceBeforeOwner = await publicClient.getBalance({ address: owner.account.address });
    const balanceBeforeReceiver = await publicClient.getBalance({ address: receiverAddress });

    console.log("\n💰Owner ETH balance before:", balanceBeforeOwner);
    console.log("💰Receiver ETH balance before:", balanceBeforeReceiver);

    // 2. Create Call
    const call: StrictCall = buildExecuteCall(
        receiverAddress,
        BigInt(10_000),  // 0.00000001 ETH
        "0x"
    );
    console.log("\nExecute Call:", call);

    // 3. Create calldata
    console.log("Creating calldata...");
    const callData = executeCallCallData(
        mode_1,
        encodeExecutionData(call)
    );
    console.log("Call Data:", callData);

    // 4. Send transaction TO ITSELF (7702 pattern) with authorization
    console.log("\nSending transaction to owner address...");
    const txHash = await owner.sendTransaction({
        account: owner.account,
        to: owner.account.address,  // Send to self (7702 pattern)
        data: callData,
        authorizationList: authorization ? [authorization] : undefined,  // Include EIP-7702 authorization
        chain: optimismSepolia
    });
    console.log("Transaction sent! Hash:", txHash);

    // 5. Wait and verify
    console.log("Waiting for transaction to be mined...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Transaction Status:", receipt.status === "success" ? "✅ SUCCESS" : "❌ FAILED");
    console.log("Gas used:", receipt.gasUsed.toString());

    const balanceAfterOwner = await publicClient.getBalance({ address: owner.account.address });
    const balanceAfterReceiver = await publicClient.getBalance({ address: receiverAddress });

    console.log("\n💰Owner ETH balance after:", balanceAfterOwner);
    console.log("💰Receiver ETH balance after:", balanceAfterReceiver);
    console.log("\n✅ Transaction successful!");
}

main().catch((error) => {
    console.error("❌ Error during execution:", error);
    exit(1);
});
