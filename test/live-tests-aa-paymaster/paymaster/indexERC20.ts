import { exit } from 'node:process';
import { baseSepolia } from 'viem/chains';
import { PAYMASTER_V3, TREASURY, USDC_BASE_SEPOLIA } from './data/addressBook';
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
    console.log("=== ERC20 Token Sponsorship (USDC) ===\n");

    const gasFees: gasFees = await helpers.getGasParams(publicClient);
    console.log("Gas Fees:");
    console.log("  maxFeePerGas:", gasFees.maxFeePerGas);
    console.log("  maxPriorityFeePerGas:", gasFees.maxPriorityFeePerGas);

    const authorization = await helpers.getAuthorization(walletsClient.walletClientAccount7702, walletsClient.walletClientAccount7702.account);
    console.log("\nEIP-7702 Authorization:", authorization);

    let userOp: UserOperationWithEip7702Auth = await helpers.getFreshUserOp(authorization);
    userOp.sender = walletsClient.walletClientAccount7702.account.address;
    userOp.nonce = await getNonce(publicClient, userOp.sender, 0n);

    // Use batch call that includes USDC approval + empty call to RECIVER
    userOp.callData = await helpers.getCalBatchData();
    console.log("\nCallData includes:");
    console.log("  1. Approve USDC to PAYMASTER_V3 (MAX_UINT256)");
    console.log("  2. Empty call to RECIVER");

    userOp.maxFeePerGas = gasFees.maxFeePerGas;
    userOp.maxPriorityFeePerGas = gasFees.maxPriorityFeePerGas;

    // Create dummy ERC20 paymaster data for gas estimation
    // Exchange rate: 3000 USDC per 1 ETH (USDC has 6 decimals)
    // 3000 * 1e6 = 3_000_000_000
    const exchangeRate = 3_000_000_000n;
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
    const dummyValidAfter = 0;

    console.log("\nERC20 Paymaster Configuration:");
    console.log("  Token:", USDC_BASE_SEPOLIA, "(USDC)");
    console.log("  Treasury:", TREASURY);
    console.log("  Exchange Rate:", exchangeRate.toString(), "(3000 USDC per ETH)");
    console.log("  Mode: ERC20_MODE (1) - Basic (combinedByte: 0x00)");

    const dummyPaymasterData = helpers.getDummyPaymasterDataERC20(
        dummyValidUntil,
        dummyValidAfter,
        exchangeRate,
        50000n,  // postOpGas
        150000n  // paymasterValidationGasLimit
    );

    // Set custom PAYMASTER_V3 with dummy ERC20 data for gas estimation
    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = dummyPaymasterData;
    // Set high initial gas limits for ERC20 paymaster - estimation will refine these
    userOp.paymasterVerificationGasLimit = 150000n;
    userOp.paymasterPostOpGasLimit = 50000n;

    console.log("\nEstimating gas with dummy ERC20 paymaster data...");
    const simpleSmartAccout = await getSimpleAccount();
    const smartAccountClient = await createSmartAccount(simpleSmartAccout);
    const gasEstimates = await estimateUserOperationGas(smartAccountClient, userOp);
    console.log("Gas Estimates:", gasEstimates);

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
        : 150000n; // Fallback to high value if not provided
    userOp.paymasterPostOpGasLimit = pmPostOpGas
        ? (typeof pmPostOpGas === 'string' ? BigInt(pmPostOpGas) : pmPostOpGas)
        : 50000n; // Fallback to high value if not provided

    console.log("\nUserOp with gas estimates:");
    console.log("  preVerificationGas:", userOp.preVerificationGas.toString());
    console.log("  verificationGasLimit:", userOp.verificationGasLimit.toString());
    console.log("  callGasLimit:", userOp.callGasLimit.toString());
    console.log("  paymasterVerificationGasLimit:", userOp.paymasterVerificationGasLimit?.toString() || '150000 (fallback)');
    console.log("  paymasterPostOpGasLimit:", userOp.paymasterPostOpGasLimit?.toString() || '50000 (fallback)');

    // Now create real ERC20 paymaster data with actual timestamps
    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;

    const paymasterDataWithoutSig = helpers.createVerifyingModePaymasterDataERC20({
        combinedByte: 0x00, // Basic mode: no preFund, no constantFee, no recipient
        validUntil,
        validAfter,
        token: USDC_BASE_SEPOLIA,
        postOpGas: userOp.paymasterPostOpGasLimit || 50000n,
        exchangeRate: exchangeRate,
        paymasterValidationGasLimit: userOp.paymasterVerificationGasLimit || 150000n,
        treasury: TREASURY,
        allowAllBundlers: false
    });

    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = paymasterDataWithoutSig;

    // Get hash from custom paymaster with ERC20_MODE
    console.log("\nGetting paymaster hash for ERC20_MODE...");
    const pmHash = await getHash(publicClient, helpers.ERC20_MODE, userOp);
    console.log("Paymaster hash:", pmHash);

    // Sign the paymaster hash with authorized signer
    const pmSignature = await walletsClient.signMessageWithEOA(pmHash);
    console.log("Paymaster signature:", pmSignature);

    // Append signature to ERC20 paymaster data
    userOp.paymasterData = helpers.appendSignatureToPaymasterData(paymasterDataWithoutSig, pmSignature);
    console.log("Final ERC20 paymaster data length:", userOp.paymasterData.length, "bytes");

    console.log("\n=== VERIFICATION: Custom ERC20 Paymaster Configuration ===");
    console.log("Paymaster Address:", userOp.paymaster);
    console.log("Expected PAYMASTER_V3:", PAYMASTER_V3);
    console.log("Match:", userOp.paymaster === PAYMASTER_V3);
    console.log("Mode: ERC20_MODE (1)");
    console.log("Token: USDC", USDC_BASE_SEPOLIA);
    console.log("Treasury:", TREASURY);
    console.log("Exchange Rate:", exchangeRate.toString(), "USDC per ETH");
    console.log("==========================================================\n");

    const userOpSig = await simpleSmartAccout.signUserOperation(userOp);
    userOp.signature = userOpSig;

    console.log("Complete UserOp before sending:");
    console.log(JSON.stringify({
        sender: userOp.sender,
        nonce: userOp.nonce.toString(),
        paymaster: userOp.paymaster,
        paymasterDataLength: userOp.paymasterData.length,
        paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit?.toString(),
        paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit?.toString(),
    }, null, 2));

    console.log("\nSending UserOperation to bundler...");
    const userOperationHash = await sendUserOperation(smartAccountClient, userOp);
    console.log("UserOperation Hash:", userOperationHash);

    console.log("\nWaiting for UserOperation receipt...");
    const { receipt } = await waitForUserOperationReceipt(smartAccountClient, userOperationHash);
    console.log("\n✅ User operation receipt:", receipt);
    console.log("\n=== ERC20 Sponsorship Success! ===");
    console.log("Transaction hash:", receipt.transactionHash);
    console.log("Gas used:", receipt.gasUsed);
    console.log("USDC tokens were charged from sender to treasury");
}

main().catch((e) => {
    console.error("\n❌ Error:", e);
    exit(1);
});
