import "dotenv/config"
import { createClient, defineChain, http, publicActions, walletActions, Hex, Address, pad, toHex, concat } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  createBundlerClient,
  createPaymasterClient,
} from 'viem/account-abstraction'
import { createOpenfortAccount } from "./openfort-simple";
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

const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex)
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
  to: '0xcb98643b8786950F0461f3B0edf99D88F274574D' as const,
  value: 0n,
  data: "0x1234" as const,
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
  authorization, // EIP-7702 signed authorization
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

// Format UserOp for Paymaster RPC (NEW format, NO eip7702Auth)
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

  // NO eip7702Auth for paymaster calls!

  return formatted
}

// Format UserOp for Bundler RPC (NEW format, NO eip7702Auth - same as paymaster!)
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

  // NO eip7702Auth - Openfort doesn't want it in the UserOp!

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
  paymasterVerificationGasLimit: BigInt(estimateResult.paymasterVerificationGasLimit || 0),
  paymasterPostOpGasLimit: BigInt(estimateResult.paymasterPostOpGasLimit || 0),
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

// // Step 4: Get Final Paymaster Data with Signature
// console.log('\n=== Step 4: Getting Final Paymaster Data ===')

// const paymasterDataResult = await paymasterClient.request({
//   method: 'pm_getPaymasterData',
//   params: [
//     formatUserOpForPaymaster(userOp),
//     account.entryPoint.address,
//     `0x${chainId.toString(16)}`,
//     { policyId: process.env.POLICY_ID! }
//   ],
// })

// console.log('Final Paymaster Data:', {
//   paymaster: paymasterDataResult.paymaster,
//   paymasterData: paymasterDataResult.paymasterData?.slice(0, 66) + '...',
//   paymasterVerificationGasLimit: paymasterDataResult.paymasterVerificationGasLimit,
//   paymasterPostOpGasLimit: paymasterDataResult.paymasterPostOpGasLimit,
// })

// // Update UserOp with final paymaster data (includes signature)
// userOp = {
//   ...userOp,
//   paymaster: paymasterDataResult.paymaster,
//   paymasterData: paymasterDataResult.paymasterData,
// }

// // Step 5: Sign UserOperation
// console.log('\n=== Step 5: Signing UserOperation ===')

// const userOpSignature = await account.signUserOperation(userOp)

// console.log('UserOp Signature:', userOpSignature.slice(0, 66) + '...')

// // Update UserOp with real signature
// userOp = {
//   ...userOp,
//   signature: userOpSignature,
// }

// // Step 6: Send UserOperation
// console.log('\n=== Step 6: Sending UserOperation ===')

// const userOpHash = await bundlerClient.request({
//   method: 'eth_sendUserOperation',
//   params: [
//     formatUserOpForBundler(userOp),
//     account.entryPoint.address
//   ],
// })

// console.log('\n=== UserOperation Sent Successfully ===')
// console.log('UserOp Hash:', userOpHash)

// // Optional: Wait for receipt (commented out)
// const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
// console.log('UserOperationReceipt:', receipt)

// Dont touch this code below

// const authorization = await client.signAuthorization(account.authorization!)

// const hash = await bundlerClient.sendUserOperation({
// 	account,
// 	// authorization,
// 	calls: [
// 		{
// 			to: '0xcb98643b8786950F0461f3B0edf99D88F274574D',
// 			value: 0n,
// 			data: "0x1234",
// 		},

// 	],
// })

// const receipt = await bundlerClient.waitForUserOperationReceipt({ hash })
// console.log('UserOperationReceipt:', receipt)
