import "dotenv/config"
import { createWalletClient, createClient, defineChain, http, publicActions, walletActions, Hex, Address, pad, toHex, concat, encodeAbiParameters, encodeFunctionData } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint08Abi,
  toPackedUserOperation,
} from 'viem/account-abstraction'
import { createOpenfortAccount } from "./openfort-simple";
import { ABI_PAYMASTER_V3 } from "./openfort-simple/abis";
import dotenv from "dotenv";

dotenv.config();

const PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;
const dummyPaymasterSig = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;
const sigLen = pad(toHex(dummyPaymasterSig.length), { size: 2 });
const paymasterAddress = "0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97";

const VERIFYING_MODE = 0n;
const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
const mode = (VERIFYING_MODE << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
const modeHex = pad(toHex(mode), { size: 1 });
const validUntilHex = pad(toHex(1796977534), { size: 6 });
const validAfterHex = pad(toHex(0), { size: 6 });
const paymasterStubData = concat([modeHex, validUntilHex, validAfterHex]) as Hex;

// NEW format: Gas limits are separate fields, NOT in paymasterData
const paymasterDataForEstamteGas = concat([
    paymasterStubData,      // 13 bytes: mode + validUntil + validAfter
    dummyPaymasterSig,      // 65 bytes
    pad(toHex(65), { size: 2 }),                 // 2 bytes
    PAYMASTER_SIG_MAGIC     // 8 bytes
]) as Hex;
// Total: 88 bytes

const chain = defineChain({
  id: 510531,
  name: "Open Loot Testnet",
  nativeCurrency: { name: "OpenLoot", symbol: "OL", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://open-loot.rpc.testnet.syndicate.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Open Loot Testnet Explorer",
      url: "https://open-loot.explorer.testnet.syndicate.io",
    },
  },
  testnet: true,
});



const paymasterClient = createPaymasterClient({
  transport: http(`https://api.openfort.io/rpc/510531`, {
    fetchOptions: {
      headers: {
        'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
      },
    },
  }),
})
// console.log(generatePrivateKey())

const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);
const paymasterSigner = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

console.log("Paymaster Signer:", paymasterSigner.address);

export const client = createClient({
  account: owner,
  chain: chain,
  transport: http()
})
  .extend(publicActions)
  .extend(walletActions)

const account = await createOpenfortAccount({
  client,
  owner,
})

// Sign EIP-7702 authorization (delegates EOA to Openfort implementation)
const authorization = await client.signAuthorization(account.authorization!)

// Create wallet client for direct EntryPoint transaction
const senderEOA = privateKeyToAccount(process.env.PAYMASTER_OWNER_PRIVATE_KEY! as Hex)
const senderWallet = createWalletClient({
  chain: chain,
  account: senderEOA,
  transport: http()
}).extend(publicActions)

console.log('Sender EOA for handleOps:', senderEOA.address)

const bundlerClient = createBundlerClient({
  account,
  paymaster: paymasterClient,
  client,
  paymasterContext: {
    policyId: process.env.POLICY_ID! as string,
  },
  transport: http(`https://api.openfort.io/rpc/510531`, {
    fetchOptions: {
      headers: {
        'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
      },
    },
  }),
})

// Define the calls for the UserOperation
const calls = [{
  to: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as const,
  value: 0n,
  data: "0x" as const,
}]

// Step 1: Build initial UserOperation
console.log('\n=== Step 1: Creating Initial UserOperation ===')

const sender = await account.getAddress()
const nonce = await account.getNonce()
const { factory, factoryData } = await account.getFactoryArgs()
const callData = await account.encodeCalls(calls)
const signature = await account.getStubSignature()

// Get gas prices
const gasPrice = await client.estimateFeesPerGas()
const maxFeePerGas = gasPrice.maxFeePerGas!
const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas!

let userOp = {
  sender,
  nonce,
  factory,
  factoryData,
  callData,
  callGasLimit: 0n,
  verificationGasLimit: 0n,
  preVerificationGas: 0n,
  maxFeePerGas,
  maxPriorityFeePerGas,
  signature,
}

console.log('Initial UserOp:', {
  sender: userOp.sender,
  nonce: userOp.nonce.toString(),
  factory: userOp.factory,
  factoryData: userOp.factoryData,
  callData: userOp.callData.slice(0, 66) + '...',
  maxFeePerGas: userOp.maxFeePerGas.toString(),
  maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
})

// Step 2: Get Paymaster Stub Data
console.log('\n=== Step 2: Getting Paymaster Stub Data ===')

const chainId = await client.getChainId()

// Format UserOp for Paymaster RPC
const formatUserOpForPaymaster = (op: any) => {
  const formatted: any = {
    sender: op.sender,
    nonce: `0x${op.nonce.toString(16)}`,
    callData: op.callData,
    callGasLimit: `0x${op.callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${op.verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${op.preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${op.maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${op.maxPriorityFeePerGas.toString(16)}`,
    signature: op.signature,
  }

  // Add optional NEW format fields
  if (op.factory) formatted.factory = op.factory
  if (op.factoryData) formatted.factoryData = op.factoryData
  if (op.paymaster) formatted.paymaster = op.paymaster
  if (op.paymasterData) formatted.paymasterData = op.paymasterData
  if (op.paymasterVerificationGasLimit) {
    formatted.paymasterVerificationGasLimit = `0x${op.paymasterVerificationGasLimit.toString(16)}`
  }
  if (op.paymasterPostOpGasLimit) {
    formatted.paymasterPostOpGasLimit = `0x${op.paymasterPostOpGasLimit.toString(16)}`
  }
  return formatted
}

// Format UserOp for Bundler RPC
const formatUserOpForBundler = (op: any) => {
  const formatted: any = {
    sender: op.sender,
    nonce: `0x${op.nonce.toString(16)}`,
    callData: op.callData,
    callGasLimit: `0x${op.callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${op.verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${op.preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${op.maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${op.maxPriorityFeePerGas.toString(16)}`,
    signature: op.signature,
  }

  // Add optional NEW format fields
  if (op.factory) formatted.factory = op.factory
  if (op.factoryData) formatted.factoryData = op.factoryData
  if (op.paymaster) formatted.paymaster = op.paymaster
  if (op.paymasterData) formatted.paymasterData = op.paymasterData
  if (op.paymasterVerificationGasLimit) {
    formatted.paymasterVerificationGasLimit = `0x${op.paymasterVerificationGasLimit.toString(16)}`
  }
  if (op.paymasterPostOpGasLimit) {
    formatted.paymasterPostOpGasLimit = `0x${op.paymasterPostOpGasLimit.toString(16)}`
  }

  return formatted
}

// Manual stub data construction (no API call)
console.log('Paymaster Stub Data:', {
  paymaster: paymasterAddress,
  paymasterData: paymasterDataForEstamteGas.slice(0, 66) + '...',
  paymasterVerificationGasLimit: '400000',
  paymasterPostOpGasLimit: '50000',
})

// Add paymaster fields to UserOp
userOp = {
  ...userOp,
  paymaster: paymasterAddress as Address,
  paymasterData: paymasterDataForEstamteGas,
  paymasterVerificationGasLimit: 400000n,
  paymasterPostOpGasLimit: 50000n,
}

// Step 3: Estimate UserOperation Gas
console.log('\n=== Step 3: Estimating UserOperation Gas ===')

const estimateResult = await bundlerClient.request({
  method: 'eth_estimateUserOperationGas',
  params: [
    formatUserOpForBundler(userOp),
    account.entryPoint.address
  ],
})

console.log('Gas Estimation Result:', {
  callGasLimit: estimateResult.callGasLimit,
  verificationGasLimit: estimateResult.verificationGasLimit,
  preVerificationGas: estimateResult.preVerificationGas,
  paymasterVerificationGasLimit: estimateResult.paymasterVerificationGasLimit,
  paymasterPostOpGasLimit: estimateResult.paymasterPostOpGasLimit,
})

// Update UserOp with estimated gas values
userOp = {
  ...userOp,
  callGasLimit: BigInt(estimateResult.callGasLimit),
  verificationGasLimit: BigInt(estimateResult.verificationGasLimit),
  preVerificationGas: BigInt(estimateResult.preVerificationGas),
  paymasterVerificationGasLimit: BigInt(estimateResult.verificationGasLimit),  // Use verificationGasLimit, not paymasterVerificationGasLimit
  paymasterPostOpGasLimit: 50000n,
}

console.log('\n=== Final UserOp (with gas estimates) ===')
console.log({
  sender: userOp.sender,
  nonce: userOp.nonce.toString(),
  callGasLimit: userOp.callGasLimit.toString(),
  verificationGasLimit: userOp.verificationGasLimit.toString(),
  preVerificationGas: userOp.preVerificationGas.toString(),
  maxFeePerGas: userOp.maxFeePerGas.toString(),
  maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
  paymaster: userOp.paymaster,
  paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit?.toString(),
  paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit?.toString(),
})

// Step 4: Sign UserOperation Hash
console.log('\n=== Step 4: Signing UserOperation Hash ===')

// Phase 1 PaymasterData: mode + magic (21 bytes)
userOp = {
  ...userOp,
  paymasterData: concat([
    paymasterStubData,      // 13 bytes (reuse existing constant)
    PAYMASTER_SIG_MAGIC     // 8 bytes
  ]) as Hex,
}

const userOpForHashing = {
  sender: userOp.sender,
  nonce: userOp.nonce,
  factory: userOp.factory,
  factoryData: userOp.factoryData,
  callData: userOp.callData,
  callGasLimit: userOp.callGasLimit,
  verificationGasLimit: userOp.verificationGasLimit,
  preVerificationGas: userOp.preVerificationGas,
  maxFeePerGas: userOp.maxFeePerGas,
  maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
  signature: userOp.signature,
  paymaster: (userOp as any).paymaster,
  paymasterData: (userOp as any).paymasterData,
  paymasterVerificationGasLimit: (userOp as any).paymasterVerificationGasLimit,
  paymasterPostOpGasLimit: (userOp as any).paymasterPostOpGasLimit,
}

// Convert to PackedUserOperation for EntryPoint
let packedUserOp = toPackedUserOperation(userOpForHashing)

packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex }

// DEBUG: Log packed structure to verify correctness
console.log('\n--- DEBUG: Packed UserOp Structure (Phase 1) ---')
console.log('initCode:', packedUserOp.initCode, '(should be exactly 0x7702)')
console.log('accountGasLimits:', packedUserOp.accountGasLimits)
console.log('gasFees:', packedUserOp.gasFees)
console.log('paymasterAndData length:', (packedUserOp.paymasterAndData.length - 2) / 2, 'bytes')
console.log('paymasterAndData (first 66 chars):', packedUserOp.paymasterAndData.slice(0, 66) + '...')
console.log('--- END DEBUG ---\n')

console.log('Getting UserOpHash from EntryPoint with state override...')

const implementationAddress = "0x77020901f40BE88Df754E810dA9868933787652B"
const userOpHash = await client.request({
  method: "eth_call",
  params: [
    {
      to: account.entryPoint.address,
      data: encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: "getUserOpHash",
        args: [packedUserOp]
      })
    },
    "latest",
    {
      [owner.address]: {
        code: `0xef0100${implementationAddress.toLowerCase().substring(2)}`
      }
    }
  ]
}) as Hex

console.log('UserOpHash:', userOpHash)
console.log('Owner address:', owner.address)

// Sign with owner account
console.log('Signing with owner account...')
const rawUserOpSignature = await owner.sign({
  hash: userOpHash
})

console.log('Raw signature:', rawUserOpSignature)

// DEBUG: Verify signature by recovering signer
const { recoverAddress } = await import('viem')
const recoveredAddress = await recoverAddress({
  hash: userOpHash,
  signature: rawUserOpSignature
})
console.log('Recovered signer address:', recoveredAddress)
console.log('Signature verification:', recoveredAddress.toLowerCase() === owner.address.toLowerCase() ? '✓ MATCH' : '✗ MISMATCH')

// Pack signature (mode 0 = ECDSA)
const packedUserOpSignature = encodeAbiParameters(
  [
    { type: 'uint256' },
    { type: 'bytes' }
  ],
  [0n, rawUserOpSignature]
)

console.log('Packed signature:', packedUserOpSignature.slice(0, 66) + '...')

// Update UserOp with real signature
userOp = {
  ...userOp,
  signature: packedUserOpSignature,
}

// Step 5: Sign Paymaster Hash
console.log('\n=== Step 5: Signing Paymaster Hash ===')

// Phase 2 PaymasterData: mode + 0-marker + magic (23 bytes)
userOp = {
  ...userOp,
  paymasterData: concat([
    paymasterStubData,              // 13 bytes
    pad(toHex(0), { size: 2 }),     // 2 bytes (0-length signature marker)
    PAYMASTER_SIG_MAGIC             // 8 bytes
  ]) as Hex,
}

const userOpForPaymasterHash = {
  sender: userOp.sender,
  nonce: userOp.nonce,
  factory: userOp.factory,
  factoryData: userOp.factoryData,
  callData: userOp.callData,
  callGasLimit: userOp.callGasLimit,
  verificationGasLimit: userOp.verificationGasLimit,
  preVerificationGas: userOp.preVerificationGas,
  maxFeePerGas: userOp.maxFeePerGas,
  maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
  signature: userOp.signature,
  paymaster: (userOp as any).paymaster,
  paymasterData: (userOp as any).paymasterData,
  paymasterVerificationGasLimit: (userOp as any).paymasterVerificationGasLimit,
  paymasterPostOpGasLimit: (userOp as any).paymasterPostOpGasLimit,
}

// Convert to PackedUserOperation for Paymaster
packedUserOp = toPackedUserOperation(userOpForPaymasterHash)

// CRITICAL: Fix initCode to exactly '0x7702' again!
packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex }

console.log('Getting paymaster hash...')

// Get hash from paymaster (mode 0 = verifying)
const paymasterHash = await client.readContract({
  address: paymasterAddress as Address,
  abi: ABI_PAYMASTER_V3,
  functionName: 'getHash',
  args: [0, packedUserOp],  // mode 0 = VERIFYING_MODE
}) as Hex

console.log('Paymaster hash:', paymasterHash)

// Sign with paymaster signer using signMessage (for raw hash)
console.log('Signing with paymaster signer...')
const paymasterRawSignature = await paymasterSigner.signMessage({
  message: { raw: paymasterHash }
})

console.log('Paymaster signature:', paymasterRawSignature)

// Step 6: Assemble Final PaymasterData
console.log('\n=== Step 6: Assembling Final PaymasterData ===')

// Phase 3 PaymasterData: mode + signature + sigLen + magic (88 bytes)
userOp = {
  ...userOp,
  paymasterData: concat([
    paymasterStubData,                    // 13 bytes
    paymasterRawSignature,                // 65 bytes
    pad(toHex(65), { size: 2 }),          // 2 bytes (signature length)
    PAYMASTER_SIG_MAGIC                   // 8 bytes
  ]) as Hex,
}

console.log('Final paymasterData:', (userOp as any).paymasterData.slice(0, 66) + '...')
console.log('PaymasterData length:', ((userOp as any).paymasterData.length - 2) / 2, 'bytes')  // Should be 88

// CRITICAL FIX: Remove authorization field before calling toPackedUserOperation
const userOpForFinal = {
  sender: userOp.sender,
  nonce: userOp.nonce,
  factory: userOp.factory,
  factoryData: userOp.factoryData,
  callData: userOp.callData,
  callGasLimit: userOp.callGasLimit,
  verificationGasLimit: userOp.verificationGasLimit,
  preVerificationGas: userOp.preVerificationGas,
  maxFeePerGas: userOp.maxFeePerGas,
  maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
  signature: userOp.signature,
  paymaster: (userOp as any).paymaster,
  paymasterData: (userOp as any).paymasterData,
  paymasterVerificationGasLimit: (userOp as any).paymasterVerificationGasLimit,
  paymasterPostOpGasLimit: (userOp as any).paymasterPostOpGasLimit,
  // NO authorization field!
}

// Convert to PackedUserOperation final time
packedUserOp = toPackedUserOperation(userOpForFinal)

// CRITICAL: Fix initCode one last time!
packedUserOp = { ...packedUserOp, initCode: '0x7702' as Hex }


console.log(packedUserOp)

// Step 7: Send UserOperation via direct handleOps call
console.log('\n=== Step 7: Sending UserOperation via handleOps ===')

// // Check if sender has enough balance for gas
// const senderBalance = await client.getBalance({
//   address: senderEOA.address
// })
// console.log('Sender balance:', senderBalance.toString(), 'wei')

// if (senderBalance === 0n) {
//   throw new Error('Sender EOA has no balance. Please fund it first.')
// }

// const txHash = await senderWallet.sendTransaction({
//   to: account.entryPoint.address,
//   data: encodeFunctionData({
//     abi: entryPoint08Abi,
//     functionName: "handleOps",
//     args: [
//       [packedUserOp],
//       senderEOA.address  // beneficiary address
//     ]
//   }),
//   chain
// })

// console.log('Transaction sent! Hash:', txHash)

// // Wait for transaction receipt
// console.log('\nWaiting for transaction to be mined...')
// const receipt = await senderWallet.waitForTransactionReceipt({ hash: txHash })
// console.log('Transaction Status:', receipt.status === 'success' ? 'SUCCESS' : 'FAILED')
// console.log('Gas Used:', receipt.gasUsed.toString())

// if (receipt.status === 'success') {
//   console.log('\n=== UserOperation Executed Successfully ===')
//   console.log('Transaction hash:', receipt.transactionHash)
// } else {
//   console.log('\n=== Transaction Failed ===')
//   console.log('Receipt:', receipt)
// }

console.log('\n=== Step 7: Sending UserOperation ===')
// console.log(account.entryPoint.address);

// console.log(userOp);
// console.log(formatUserOpForBundler(userOp));

userOp.factory = '0x7702';

const finalUserOpHash = await bundlerClient.request({
  method: 'eth_sendUserOperation',
  params: [
    formatUserOpForBundler(userOp),
    account.entryPoint.address
  ],
})

console.log('\n=== UserOperation Sent Successfully ===')
console.log('UserOp Hash:', finalUserOpHash)

// Wait for receipt
console.log('\nWaiting for receipt...')
const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash })
console.log('UserOperationReceipt:', receipt)
console.log('Transaction hash:', receipt.receipt.transactionHash)
