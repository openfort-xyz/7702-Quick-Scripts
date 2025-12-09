import { exit } from 'node:process';
import { baseSepolia } from 'viem/chains';
import { PAYMASTER_V3 } from './data/addressBook';
import { helpers, gasFees } from "./helpers/Helpers";
import { publicClient } from "./clients/publicClient";
import { getNonce } from './actions/entryPointActions';
import { walletsClient } from './clients/walltesClient';
import { UserOperation } from 'viem/account-abstraction';
import { sponsorUserOperation } from 'permissionless/actions/pimlico';
import { getHash, createPaymasterData } from './actions/paymasterActions';
import { getSimpleAccount, createSmartAccount, pimlicoClient } from "./clients/pimlicoClient";
import { getDummyPaymasterData, type UserOperationWithEip7702Auth, estimateUserOperationGas, getPaymasterData, sendUserOperation, waitForUserOperationReceipt } from './actions/pimlicoActions';
import { Hex } from 'viem';
import { hashMessage, keccak256, toBytes } from 'viem';

async function main() {
    const gasFees: gasFees = await helpers.getGasParams(publicClient);
    console.log(gasFees.maxFeePerGas);
    console.log(gasFees.maxPriorityFeePerGas);

    const authorization = await helpers.getAuthorization(walletsClient.walletClientAccount7702, walletsClient.walletClientAccount7702.account);
    console.log(authorization);

    let userOp: UserOperationWithEip7702Auth = await helpers.getFreshUserOp(authorization);
    userOp.sender = walletsClient.walletClientAccount7702.account.address;
    userOp.nonce = await getNonce(publicClient, userOp.sender, 0n);
    userOp.callData = await helpers.getCallData();
    userOp.maxFeePerGas = gasFees.maxFeePerGas;
    userOp.maxPriorityFeePerGas = gasFees.maxPriorityFeePerGas;
    console.log(userOp);

    // Create dummy paymaster data for our custom PAYMASTER_V3
    // This allows gas estimation to work correctly with our paymaster's validation logic
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
    const dummyValidAfter = 0;
    const dummySignature = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;
    const dummyPaymasterData = helpers.appendSignatureToPaymasterData(
        helpers.createVerifyingModePaymasterData(dummyValidUntil, dummyValidAfter),
        dummySignature
    );

    // Set custom PAYMASTER_V3 with dummy data for gas estimation
    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = dummyPaymasterData;
    // Set high initial gas limits for paymaster - estimation will refine these
    userOp.paymasterVerificationGasLimit = 150000n;
    userOp.paymasterPostOpGasLimit = 50000n;

    const simpleSmartAccout = await getSimpleAccount();
    const smartAccountClient = await createSmartAccount(simpleSmartAccout);
    const gasEstimates = await estimateUserOperationGas(smartAccountClient, userOp);
    console.log(gasEstimates);

    // Convert gas estimates to bigint (they are hex strings from Pimlico)
    // Must convert before passing to toHex() to avoid encoding string as bytes
    userOp.preVerificationGas = typeof gasEstimates.preVerificationGas === 'string'
        ? BigInt(gasEstimates.preVerificationGas)
        : gasEstimates.preVerificationGas;
    userOp.verificationGasLimit = typeof gasEstimates.verificationGasLimit === 'string'
        ? BigInt(gasEstimates.verificationGasLimit)
        : gasEstimates.verificationGasLimit;
    userOp.callGasLimit = typeof gasEstimates.callGasLimit === 'string'
        ? BigInt(gasEstimates.callGasLimit)
        : gasEstimates.callGasLimit;

    // Paymaster gas limits might not exist in gasEstimates type, so use safe access
    const pmVerificationGas = (gasEstimates as any).paymasterVerificationGasLimit;
    const pmPostOpGas = (gasEstimates as any).paymasterPostOpGasLimit;

    userOp.paymasterVerificationGasLimit = pmVerificationGas
        ? (typeof pmVerificationGas === 'string' ? BigInt(pmVerificationGas) : pmVerificationGas)
        : 0n;
    userOp.paymasterPostOpGasLimit = pmPostOpGas
        ? (typeof pmPostOpGas === 'string' ? BigInt(pmPostOpGas) : pmPostOpGas)
        : 0n;
    console.log("UserOp with gas estimates:", userOp)

    // Now switch to custom PAYMASTER_V3
    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;
    const paymasterDataWithoutSig = helpers.createVerifyingModePaymasterData(validUntil, validAfter);

    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = paymasterDataWithoutSig;

    // Get hash from custom paymaster (this will hash only the structure without signature)
    const pmHash = await getHash(publicClient, helpers.VERIFYING_MODE, userOp);
    console.log("Paymaster hash:", pmHash)

    // Sign the paymaster hash with authorized signer
    const pmSignature = await walletsClient.signMessageWithEOA(pmHash);
    console.log("Paymaster signature:", pmSignature);

    // Append signature to paymaster data
    userOp.paymasterData = helpers.appendSignatureToPaymasterData(paymasterDataWithoutSig, pmSignature);
    console.log("Final paymaster data:", userOp.paymasterData);
    console.log("\n=== VERIFICATION: Custom Paymaster Configuration ===");
    console.log("Paymaster Address (should be PAYMASTER_V3):", userOp.paymaster);
    console.log("Expected PAYMASTER_V3:", PAYMASTER_V3);
    console.log("Match:", userOp.paymaster === PAYMASTER_V3);
    console.log("===================================================\n");

    const userOpSig = await simpleSmartAccout.signUserOperation(userOp);
    userOp.signature = userOpSig;

    console.log("Complete UserOp before sending:", JSON.stringify({
        sender: userOp.sender,
        nonce: userOp.nonce.toString(),
        paymaster: userOp.paymaster,
        paymasterData: userOp.paymasterData,
        paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit?.toString(),
        paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit?.toString(),
    }, null, 2));


    // const userOperationHash = await sendUserOperation(smartAccountClient, userOp);

    // const { receipt } = await waitForUserOperationReceipt(smartAccountClient, userOperationHash);
    // console.log("User operation receipt:", receipt);
}

main().catch((e) => {
    console.error(e);
    exit(1);
});

// Current PM Data:        0x01 000068c19d92 000000000000 3b2a16f027b6fb0a6a60dfde828680b78468869d50036807e9d3d5c01247af7470fe484f78479134a945c5b02ffb1618f751f4785885857a671edbcc8d92db671b
// Post Changes PM Data:   0x01 000000000000 000000000000 9ff2f05d5ee66202611e4b2623ff0ce7da5a4ea3df012426acafb7781166ae83601cae1d2dbcff5ea51db5dbbf5fc8be891fce20c12b9720d2012dd311a2e1131c
