import { privateKeyToAccount } from "viem/accounts";
import { ABI_PAYMASTER_V3 } from "./openfort-simple/abis";
// import { createOpenfortAccount } from "./openfort-simple";
import { Hex, Address, concat, createClient, http, pad, toHex, decodeErrorResult, keccak256 } from "viem";
import { OPEN_LOOT_CHAIN, OPEN_LOO_RPC_URL } from "./openfort-simple/chainConstatnts";
import { createCaliburAccount } from "../simple-calibur-v9/calibur-simple";
import { publicActions, walletActions, encodeAbiParameters, parseAbiParameters, createWalletClient, encodeFunctionData } from "viem";
import { createBundlerClient, type UserOperation, formatUserOperationRequest, formatUserOperationGas, toPackedUserOperation, entryPoint08Abi } from "viem/account-abstraction";
import {
    PAYMASTER_ADDRESS_V9_ASYNC, MODE, VALID_UNTIL, VALID_AFTER,
    DUMMY_PAYMASTER_SIGNATURE, VERIFYING_MODE, SIGNATURE_LENGTHS, PAYMASTER_SIG_MAGIC
} from "./openfort-simple/paymasterConstants";

import dotenv from "dotenv";
dotenv.config();

// Create Accounts
const ownerAccount = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);
const paymasterSignerAccount = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);
const senderEOA = privateKeyToAccount(process.env.PAYMASTER_OWNER_PRIVATE_KEY! as Hex)

// Create Client
export const client = createClient({
    account: ownerAccount,
    chain: OPEN_LOOT_CHAIN,
    transport: http()
})
    .extend(publicActions)
    .extend(walletActions);

// Create Openfort Account
const account = await createCaliburAccount({
    client,
    owner: ownerAccount,
});

// EOA Relayer
const senderWallet = createWalletClient({
  chain: OPEN_LOOT_CHAIN,
  account: senderEOA,
  transport: http()
}).extend(publicActions)

// Create Bundler Client
const BUNDLER_API_URL = "http://0.0.0.0:3000";
const bundlerClient = createBundlerClient({
    account,
    client,
    transport: http(BUNDLER_API_URL, {
        fetchOptions: {
            headers: {
                'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
            },
        },
    }),
});

// Call for userOp
const calls = [{
    to: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as const,
    value: 0n,
    data: "0x" as const,
}]

// ------------------------------------------------------------------------------------
//
//                               Create UserOperation
//
// ------------------------------------------------------------------------------------

// CRITICAL: Sign EIP-7702 authorization (delegates EOA to Calibur implementation)
// This is required for Alto bundler to apply state overrides during signature validation
const authorization = await client.signAuthorization(account.authorization!)

// CRITICAL: For EIP-7702, we need to ensure factory is NOT included in the initial UserOp
// because toPackedUserOperation will create initCode from it, but for existing accounts
// we need initCode to be exactly "0x7702" (set manually after packing)
const gasPrice = await client.estimateFeesPerGas()

let userOp: UserOperation<'0.8'> = {
    sender: await account.getAddress(),
    nonce: await account.getNonce(),
    // DO NOT include factory/factoryData here - will be handled during packing
    callData: await account.encodeCalls(calls),
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    signature: await account.getStubSignature(),
    eip7702Auth: authorization as any,
}

// ------------------------------------------------------------------------------------
//
//                           Create Paymaster Stub Data
//
// ------------------------------------------------------------------------------------

const paymasterStubData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
    DUMMY_PAYMASTER_SIGNATURE,
    SIGNATURE_LENGTHS,
    PAYMASTER_SIG_MAGIC,
]);

userOp = {
    ...userOp,
    paymaster: PAYMASTER_ADDRESS_V9_ASYNC,
    paymasterData: paymasterStubData,
}

// ------------------------------------------------------------------------------------
//
//                              Estimate User Operation
//
// ------------------------------------------------------------------------------------

const estimateResult = await bundlerClient.request({
    method: 'eth_estimateUserOperationGas',
    params: [
        formatUserOperationRequest(userOp),
        account.entryPoint.address
    ],
});

console.log("estimateResult", estimateResult);
userOp = {
    ...userOp,
    ...formatUserOperationGas(estimateResult),
}

// ------------------------------------------------------------------------------------
//
//                           Get UserOp Hash and Sign
//
// ------------------------------------------------------------------------------------

// CRITICAL: Must include factory="0x7702" for EIP-7702 accounts when signing
// This ensures viem packs with correct initCode when computing hash
// CRITICAL: Must EXCLUDE eip7702Auth field - viem uses it to override initCode with implementation address!
let userOpForAccount = { ...userOp };
userOpForAccount.factory = "0x7702" as Address;
userOpForAccount.factoryData = "0x" as Hex;
userOpForAccount.paymasterData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
    PAYMASTER_SIG_MAGIC,
]);
delete userOpForAccount.eip7702Auth; // CRITICAL: Remove to prevent initCode override!

console.log("\n=== Account Signature Phase ===")
console.log("userOpForAccount:", JSON.stringify(userOpForAccount, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))
console.log("Has eip7702Auth?", 'eip7702Auth' in userOpForAccount)

// DEBUG: Compute and log the hash that will be signed
const { getUserOperationHash } = await import('viem/account-abstraction')
console.log("\n=== Client Hash Computation ===")
console.log("userOpForAccount.signature:", userOpForAccount.signature)
console.log("userOpForAccount.factory:", userOpForAccount.factory)
console.log("userOpForAccount.factoryData:", userOpForAccount.factoryData)
console.log("userOpForAccount.paymasterData:", userOpForAccount.paymasterData)
console.log("userOpForAccount.nonce:", userOpForAccount.nonce)
const accountHash = getUserOperationHash({
    chainId: OPEN_LOOT_CHAIN.id,
    entryPointAddress: account.entryPoint.address,
    entryPointVersion: "0.8",
    userOperation: userOpForAccount
})
console.log("Account signing hash:", accountHash)
console.log("=== End Client Hash Computation ===\n")

// Use account's built-in signing which correctly handles EIP-7702
const accountPackedSignature = await account.signUserOperation(userOpForAccount);

userOp = {
    ...userOp,
    signature: accountPackedSignature
}

// ------------------------------------------------------------------------------------
//
//                           Get Paymaster Hash and Sign
//
// ------------------------------------------------------------------------------------

let userOpForPaymaster = { ...userOp };
userOpForPaymaster.factory = "0x7702" as Address;
userOpForPaymaster.factoryData = "0x" as Hex;
userOpForPaymaster.paymasterData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
    pad(toHex(0), { size: 2 }),
    PAYMASTER_SIG_MAGIC,
]);
delete userOpForPaymaster.eip7702Auth; // CRITICAL: Remove to prevent initCode override!

console.log("\n=== Paymaster Signature Phase ===")
console.log("userOpForPaymaster:", JSON.stringify(userOpForPaymaster, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))
console.log("Has eip7702Auth?", 'eip7702Auth' in userOpForPaymaster)

// Get paymaster hash using readContract (no state override needed for paymaster)
const paymasterHash = await client.readContract({
    address: PAYMASTER_ADDRESS_V9_ASYNC,
    abi: ABI_PAYMASTER_V3,
    functionName: 'getHash',
    args: [Number(VERIFYING_MODE), toPackedUserOperation(userOpForPaymaster)]
});

console.log("Paymaster hash:", paymasterHash)

const paymasterRawSignature = await paymasterSignerAccount.signMessage({
    message: { raw: paymasterHash }
})

const paymasterData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
]);


userOp = {
    ...userOp,
    paymasterData: concat([
        paymasterData,
        paymasterRawSignature,
        SIGNATURE_LENGTHS,
        PAYMASTER_SIG_MAGIC
    ]),
}

// CRITICAL FIX: Remove authorization field before sending to bundler
// The bundler will convert it to eip7702Auth which changes initCode, causing hash mismatch
// delete userOp.authorization;

// CRITICAL: Set factory to '0x7702' to match what was signed
// The signed hash used initCode='0x7702', so the final UserOp must pack to the same initCode
// userOp.factory = '0x7702000000000000000000000000000000000000' as Address;
// userOp.factoryData = '0x' as Hex;

// ------------------------------------------------------------------------------------
//
//                                Send User Operation
//
// ------------------------------------------------------------------------------------

// const decoded = decodeErrorResult({
//   abi: ABI_PAYMASTER_V3,
//   data: '0x69766c36',
// })
// console.log(decoded)


// NOTE: We do NOT set factory/factoryData when using eip7702Auth
// Alto will handle factory logic internally based on the eip7702Auth field

console.log("\n=== Sending to Bundler ===")
console.log("Final userOp:", JSON.stringify(userOp, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))
console.log("Has eip7702Auth?", 'eip7702Auth' in userOp)
const finalPacked = toPackedUserOperation(userOp)
console.log("Final packed initCode:", finalPacked.initCode)
console.log("Formatted for RPC:", JSON.stringify(formatUserOperationRequest(userOp), (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))

// CRITICAL: formatUserOperationRequest strips eip7702Auth
const formattedUserOp = formatUserOperationRequest(userOp)

// CRITICAL: For EIP-7702 with Alto bundler, we need BOTH:
// 1. factory="0x7702" + factoryData="0x" to create correct initCode
// 2. eip7702Auth to tell Alto to apply state override during validation
const userOpWithAuth = {
    ...formattedUserOp,
    factory: '0x7702' as Address,
    factoryData: '0x' as Hex,
    eip7702Auth: {
        chainId: userOp.eip7702Auth!.chainId,
        address: userOp.eip7702Auth!.address,
        nonce: userOp.eip7702Auth!.nonce,
        r: userOp.eip7702Auth!.r,
        s: userOp.eip7702Auth!.s,
        v: toHex(Number(userOp.eip7702Auth!.v)), // Convert to hex
        yParity: userOp.eip7702Auth!.yParity
    }
}
console.log("Final UserOp being sent (factory=0x7702 + eip7702Auth):", JSON.stringify(userOpWithAuth, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))

const finalUserOpHash = await bundlerClient.request({
    method: 'eth_sendUserOperation',
    params: [
        userOpWithAuth,
        account.entryPoint.address
    ],
})

console.log('UserOp Hash:', finalUserOpHash)
const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash })
console.log('UserOperationReceipt:', receipt)
console.log('Transaction hash:', receipt.receipt.transactionHash)

// const packedUserOp = toPackedUserOperation(userOp);

// console.log("packedUserOp", packedUserOp);

// const txHash = await senderWallet.sendTransaction({
//     to: account.entryPoint.address,
//     data: encodeFunctionData({
//         abi: entryPoint08Abi,
//         functionName: 'handleOps',
//         args: [[packedUserOp], senderEOA.address]
//     }),
//     // authorizationList: [authorization],
//     chain: OPEN_LOOT_CHAIN
// });

// console.log("TX Hash:", txHash);

// const receipt = await senderWallet.waitForTransactionReceipt({hash: txHash});

// if (receipt.status === 'success') {
//   console.log('\n=== UserOperation Executed Successfully ===')
//   console.log('Transaction hash:', receipt.transactionHash)
// } else {
//   console.log('\n=== Transaction Failed ===')
//   console.log('Receipt:', receipt)
// }
