import { privateKeyToAccount, SignAuthorizationReturnType } from "viem/accounts";
import { createOpenfortAccount } from "./openfort7702"
import { Hex } from "viem";
import { http, createClient, publicActions, walletActions } from "viem";
import { OPEN_LOOT_CHAIN, OPEN_LOO_RPC_URL } from "./openfort7702/chainConstatnts";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { KeyReg } from "./openfort7702/interfaces";
import "dotenv/config"
import dotenv from "dotenv";
dotenv.config();

// ------------------------------------------------------------------------------------
//
//                                  Constant and Clients
//
// ------------------------------------------------------------------------------------

// 7702 owner account
const ownerAccount = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex);

// Paymaster signer owner account
const paymasterSignerAccount = privateKeyToAccount(process.env.PAYMASTER_SIGNER_PRIVATE_KEY! as Hex);

// Create Client
const client = createClient({
    account: ownerAccount,
    chain: OPEN_LOOT_CHAIN,
    transport: http()
})
    .extend(publicActions)
    .extend(walletActions);

// Create Openfort Account
const openfortAccount = await createOpenfortAccount({
    client,
    owner: ownerAccount,
});

// Create Bundler Client
const BUNDLER_API_URL = "http://0.0.0.0:3000";
const bundlerClient = createBundlerClient({
    account: openfortAccount,
    client,
    transport: http(BUNDLER_API_URL, {
        fetchOptions: {
            headers: {
                'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
            },
        },
    }),
});

// ------------------------------------------------------------------------------------
//
//                                Attach and Initialize
//
// ------------------------------------------------------------------------------------

const main = async () => {
    // ------------------------------------------------------------------------------------
    //
    //                               Create UserOperation
    //
    // ------------------------------------------------------------------------------------

    // This is required for Alto bundler to apply state overrides during signature validation
    const authorization: SignAuthorizationReturnType = await client.signAuthorization(openfortAccount.authorization!);

    // Get gas price from bundler
    const gasPrice = await client.estimateFeesPerGas()

    let userOp: UserOperation<'0.8'> = {
        sender: await openfortAccount.getAddress(),
        nonce: await openfortAccount.getNonce(),
        callData: "0x",
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        signature: await openfortAccount.getStubSignature(),
        authorization,
    }
}

async function getInitCallData(): Promise<Hex> {
    const callData: Hex = "0x";

    return callData;
}

async function getMasterKey(): Promise<KeyReg> {}

// Call it immediately
main().catch(console.error);
