import { privateKeyToAccount } from "viem/accounts";
import { ABI_PAYMASTER_V3 } from "./openfort-simple/abis";
// import { createOpenfortAccount } from "./openfort-simple";
import { Hex, Address, concat, createClient, http, pad, toHex, decodeErrorResult } from "viem";
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

// Sign EIP-7702 authorization (delegates EOA to Openfort implementation)
// const authorization = await client.signAuthorization(account.authorization!)

const { factory, factoryData } = await account.getFactoryArgs();
const gasPrice = await client.estimateFeesPerGas()

let userOp: UserOperation<'0.8'> = {
    sender: await account.getAddress(),
    nonce: await account.getNonce(),
    factory,
    factoryData,
    callData: await account.encodeCalls(calls),
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    signature: await account.getStubSignature(),
    // authorization
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

let userOpForAccount = { ...userOp };
userOpForAccount.paymasterData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
    PAYMASTER_SIG_MAGIC,
]);

// const userOpHash = await client.readContract({
//     address: account.entryPoint.address,
//     abi: entryPoint08Abi,
//     functionName: 'getUserOpHash',
//     args: [toPackedUserOperation(userOpForAccount)]
// });

// const accountRawSignature = await paymasterSignerAccount.signMessage({
//     message: { raw: userOpHash }
// })

// const ROOT_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

// const accountPackedSignature = encodeAbiParameters(
//     parseAbiParameters("bytes32,bytes,bytes"),
//     [ROOT_KEY, accountRawSignature, "0x"],
// );

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
userOpForPaymaster.paymasterData = concat([
    MODE,
    VALID_UNTIL,
    VALID_AFTER,
    pad(toHex(0), { size: 2 }),
    PAYMASTER_SIG_MAGIC,
]);
delete userOpForPaymaster.authorization;

// console.log(userOpForPaymaster)
// console.log(toPackedUserOperation(userOpForPaymaster))
// const packedUserOpForPaymaster = toPackedUserOperation(userOpForPaymaster);
// packedUserOpForPaymaster.initCode = '0x7702';

const paymasterHash = await client.readContract({
    address: PAYMASTER_ADDRESS_V9_ASYNC,
    abi: ABI_PAYMASTER_V3,
    functionName: 'getHash',
    args: [Number(VERIFYING_MODE), toPackedUserOperation(userOpForPaymaster)]
});

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


// console.log("userOp:", userOp);

// const packedUserOp = toPackedUserOperation(userOp);
// console.log("packedUserOp", packedUserOp);

// console.log("formatUserOperationRequest(userOp)", formatUserOperationRequest(userOp));

// const finalUserOpHash = await bundlerClient.request({
//     method: 'eth_sendUserOperation',
//     params: [
//         formatUserOperationRequest(userOp),
//         account.entryPoint.address
//     ],
// })

// console.log('UserOp Hash:', finalUserOpHash)
// const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash })
// console.log('UserOperationReceipt:', receipt)
// console.log('Transaction hash:', receipt.receipt.transactionHash)

const packedUserOp = toPackedUserOperation(userOp);

// console.log("packedUserOp", packedUserOp);

const txHash = await senderWallet.sendTransaction({
    to: account.entryPoint.address,
    data: encodeFunctionData({
        abi: entryPoint08Abi,
        functionName: 'handleOps',
        args: [[packedUserOp], senderEOA.address]
    }),
    // authorizationList: [authorization],
    chain: OPEN_LOOT_CHAIN
});

console.log("TX Hash:", txHash);

const receipt = await senderWallet.waitForTransactionReceipt({hash: txHash});

if (receipt.status === 'success') {
  console.log('\n=== UserOperation Executed Successfully ===')
  console.log('Transaction hash:', receipt.transactionHash)
} else {
  console.log('\n=== Transaction Failed ===')
  console.log('Receipt:', receipt)
}
