import { exit } from 'node:process';
import { parseEther } from 'viem';
import { PAYMASTER_V3_EPV9 } from './data/addressBook';
import { helpers } from "./helpers/Helpers";
import { publicClient } from "./clients/publicClient";
import { walletsClient } from './clients/walltesClient';
import { bundlerClient, ENTRY_POINT_V9_ADDRESS } from './clients/etherspotClient';
import { createOpenfortAccount, getAuthorization } from './clients/openfortAccount';
import { getHash } from './actions/paymasterActions';
import { Hex } from 'viem';

async function main() {
    const startTime = performance.now();

    const owner = walletsClient.walletClientAccount7702.account;

    console.log("Creating Openfort account for:", owner.address);
    const openfortAccount = await createOpenfortAccount(owner);

    const authorization = await getAuthorization(owner);
    console.log("Authorization needed:", authorization ? "Yes" : "No");

    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;

    const calls = [
        {
            to: helpers.RECIVER,
            value: parseEther('0')
        }
    ];

    console.log("\n=== Starting Sequential Signing ===");
    const signingStartTime = performance.now();

    const paymasterDataForPmSigning = helpers.createVerifyingModePaymasterDataAsyncWithPlaceholder(validUntil, validAfter);

    const userOpForPmHash = {
        sender: owner.address,
        nonce: await openfortAccount.getNonce(),
        callData: await openfortAccount.encodeCalls(calls),
        callGasLimit: 100000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 100000n,
        maxFeePerGas: 1000000n,
        maxPriorityFeePerGas: 1000000n,
        paymaster: PAYMASTER_V3_EPV9,
        paymasterData: paymasterDataForPmSigning,
        paymasterVerificationGasLimit: 150000n,
        paymasterPostOpGasLimit: 50000n,
        signature: '0x'
    };

    const pmHash = await getHash(publicClient, helpers.VERIFYING_MODE, userOpForPmHash);
    console.log("✓ Paymaster hash computed:", pmHash);

    const paymasterSignature = await walletsClient.signMessageWithEOA(pmHash);
    console.log("✓ Paymaster signature completed");

    const paymasterDataForAccountSigning = helpers.createVerifyingModePaymasterDataAsync(validUntil, validAfter);

    const userOpForSigning = {
        sender: owner.address,
        nonce: await openfortAccount.getNonce(),
        callData: await openfortAccount.encodeCalls(calls),
        paymaster: PAYMASTER_V3_EPV9,
        paymasterData: paymasterDataForAccountSigning,
    };

    const accountSignature = await openfortAccount.signUserOperation(userOpForSigning);
    console.log("✓ Account signature completed");

    const signingEndTime = performance.now();
    console.log(`Sequential signing took: ${(signingEndTime - signingStartTime).toFixed(2)}ms\n`);

    const paymasterDataBase = helpers.createVerifyingModePaymasterData(validUntil, validAfter);
    const finalPaymasterData = helpers.appendAsyncSignatureToPaymasterData(paymasterDataBase, paymasterSignature);

    console.log("Account signature:", accountSignature);
    console.log("Paymaster signature:", paymasterSignature);
    console.log("Final paymaster data:", finalPaymasterData);

    console.log("\n=== VERIFICATION: Async Paymaster Configuration ===");
    console.log("Paymaster Address:", PAYMASTER_V3_EPV9);
    console.log("Entry Point:", ENTRY_POINT_V9_ADDRESS);
    console.log("===================================================\n");

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    console.log(`\n=== SYNC FLOW TIMING ===`);
    console.log(`Total time (preparation): ${totalTime.toFixed(2)}ms`);
    console.log(`Sequential signing time: ${(signingEndTime - signingStartTime).toFixed(2)}ms`);
    console.log(`========================\n`);

    console.log("\n=== FINAL USER OPERATION (Ready to send) ===");
    console.log(JSON.stringify({
        sender: owner.address,
        calls,
        authorization,
        factory: authorization ? "0x7702" : undefined,
        factoryData: authorization ? "0x" : undefined,
        paymaster: PAYMASTER_V3_EPV9,
        paymasterData: finalPaymasterData,
        signature: accountSignature
    }, null, 2));
    console.log("===========================================\n");

    console.log("\n✓ SYNC FLOW COMPLETED - Ready for sendUserOperation!");
}

main().catch((e) => {
    console.error("❌ Error:", e);
    exit(1);
});
