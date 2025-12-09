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
    console.log("=== ERC20 Token Sponsorship with Constant Fee (10%) ===\n");

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

    // Exchange rate: 4000 USDC per 1 ETH (USDC has 6 decimals)
    // 4000 * 1e6 = 4_000_000_000
    const exchangeRate = 4_000_000_000n;
    const constantFeePercentage = 10; // 10% constant fee
    const dummyValidUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
    const dummyValidAfter = 0;

    console.log("\nERC20 Paymaster Configuration:");
    console.log("  Token:", USDC_BASE_SEPOLIA, "(USDC)");
    console.log("  Treasury:", TREASURY);
    console.log("  Exchange Rate:", exchangeRate.toString(), "(4000 USDC per ETH)");
    console.log("  Mode: ERC20_MODE (1) - Constant Fee (combinedByte: 0x01)");
    console.log("  Constant Fee:", constantFeePercentage + "% of gas cost");

    // Calculate estimated constant fee for dummy data
    // Use approximate gas values for initial estimation
    const estimatedTotalGas = 300000n; // Approximate total gas
    const estimatedGasCostWei = estimatedTotalGas * gasFees.maxFeePerGas;
    const estimatedGasCostUSDC = (estimatedGasCostWei * exchangeRate) / 10n**18n;
    const estimatedConstantFee = (estimatedGasCostUSDC * BigInt(constantFeePercentage)) / 100n;

    console.log("\n=== Initial Constant Fee Estimation ===");
    console.log("  Estimated Total Gas:", estimatedTotalGas.toString());
    console.log("  Estimated Gas Cost (wei):", estimatedGasCostWei.toString());
    console.log("  Estimated Gas Cost (USDC units):", estimatedGasCostUSDC.toString());
    console.log("  Estimated Constant Fee (10%):", estimatedConstantFee.toString(), "USDC units");
    console.log("  Estimated Constant Fee (human):", Number(estimatedConstantFee) / 1e6, "USDC");
    console.log("=====================================\n");

    const dummyPaymasterData = helpers.getDummyPaymasterDataERC20(
        dummyValidUntil,
        dummyValidAfter,
        exchangeRate,
        50000n,  // postOpGas
        150000n, // paymasterValidationGasLimit
        estimatedConstantFee // constantFee for dummy
    );

    // Set custom PAYMASTER_V3 with dummy ERC20 data for gas estimation
    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = dummyPaymasterData;
    // Set high initial gas limits for ERC20 paymaster - estimation will refine these
    userOp.paymasterVerificationGasLimit = 150000n;
    userOp.paymasterPostOpGasLimit = 50000n;

    console.log("Estimating gas with dummy ERC20 paymaster data (with constant fee)...");
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

    // Calculate actual constant fee based on gas estimates
    const totalGas = userOp.preVerificationGas +
                     userOp.verificationGasLimit +
                     userOp.callGasLimit +
                     (userOp.paymasterVerificationGasLimit || 0n) +
                     (userOp.paymasterPostOpGasLimit || 0n);

    const gasCostWei = totalGas * gasFees.maxFeePerGas;
    const gasCostUSDC = (gasCostWei * exchangeRate) / 10n**18n;
    const constantFee = (gasCostUSDC * BigInt(constantFeePercentage)) / 100n;
    const totalCostUSDC = gasCostUSDC + constantFee;

    console.log("\n=== Final Constant Fee Calculation ===");
    console.log("  Total Gas:", totalGas.toString());
    console.log("  Gas Cost (wei):", gasCostWei.toString());
    console.log("  Gas Cost (USDC units):", gasCostUSDC.toString());
    console.log("  Gas Cost (human):", Number(gasCostUSDC) / 1e6, "USDC");
    console.log("  Constant Fee (10%):", constantFee.toString(), "USDC units");
    console.log("  Constant Fee (human):", Number(constantFee) / 1e6, "USDC");
    console.log("  Total Cost (USDC units):", totalCostUSDC.toString());
    console.log("  Total Cost (human):", Number(totalCostUSDC) / 1e6, "USDC");
    console.log("======================================\n");

    // Now create real ERC20 paymaster data with actual timestamps and calculated constant fee
    const validUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const validAfter = 0;

    const paymasterDataWithoutSig = helpers.createVerifyingModePaymasterDataERC20({
        combinedByte: 0x01, // Constant fee mode
        validUntil,
        validAfter,
        token: USDC_BASE_SEPOLIA,
        postOpGas: userOp.paymasterPostOpGasLimit || 50000n,
        exchangeRate: exchangeRate,
        paymasterValidationGasLimit: userOp.paymasterVerificationGasLimit || 150000n,
        treasury: TREASURY,
        constantFee: constantFee, // 10% of gas cost
        allowAllBundlers: false
    });

    userOp.paymaster = PAYMASTER_V3;
    userOp.paymasterData = paymasterDataWithoutSig;

    // Get hash from custom paymaster with ERC20_MODE
    console.log("Getting paymaster hash for ERC20_MODE with constant fee...");
    const pmHash = await getHash(publicClient, helpers.ERC20_MODE, userOp);
    console.log("Paymaster hash:", pmHash);

    // Sign the paymaster hash with authorized signer
    const pmSignature = await walletsClient.signMessageWithEOA(pmHash);
    console.log("Paymaster signature:", pmSignature);

    // Append signature to ERC20 paymaster data
    userOp.paymasterData = helpers.appendSignatureToPaymasterData(paymasterDataWithoutSig, pmSignature);
    console.log("Final ERC20 paymaster data length:", userOp.paymasterData.length, "bytes");

    console.log("\n=== VERIFICATION: Custom ERC20 Paymaster with Constant Fee ===");
    console.log("Paymaster Address:", userOp.paymaster);
    console.log("Expected PAYMASTER_V3:", PAYMASTER_V3);
    console.log("Match:", userOp.paymaster === PAYMASTER_V3);
    console.log("Mode: ERC20_MODE (1)");
    console.log("Combined Byte: 0x01 (constantFeePresent)");
    console.log("Token: USDC", USDC_BASE_SEPOLIA);
    console.log("Treasury:", TREASURY);
    console.log("Exchange Rate:", exchangeRate.toString(), "USDC per ETH (4000 USDC/ETH)");
    console.log("Constant Fee:", constantFee.toString(), "USDC units (" + Number(constantFee) / 1e6 + " USDC)");
    console.log("Fee Percentage:", constantFeePercentage + "%");
    console.log("===============================================================\n");

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
        constantFee: constantFee.toString() + " USDC units",
        totalCostUSDC: totalCostUSDC.toString() + " USDC units"
    }, null, 2));

    console.log("\nSending UserOperation to bundler...");
    const userOperationHash = await sendUserOperation(smartAccountClient, userOp);
    console.log("UserOperation Hash:", userOperationHash);

    console.log("\nWaiting for UserOperation receipt...");
    const { receipt } = await waitForUserOperationReceipt(smartAccountClient, userOperationHash);
    console.log("\n✅ User operation receipt:", receipt);
    console.log("\n=== ERC20 Sponsorship with Constant Fee Success! ===");
    console.log("Transaction hash:", receipt.transactionHash);
    console.log("Gas used:", receipt.gasUsed);
    console.log("USDC tokens charged: Gas cost + 10% constant fee");
    console.log("Total USDC charged:", Number(totalCostUSDC) / 1e6, "USDC");
}

main().catch((e) => {
    console.error("\n❌ Error:", e);
    exit(1);
});
