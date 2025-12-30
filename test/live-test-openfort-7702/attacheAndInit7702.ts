import { privateKeyToAccount, SignAuthorizationReturnType } from "viem/accounts";
import { createOpenfortAccount } from "./openfort7702"
import { encodeFunctionData, Hex, keccak256, zeroAddress } from "viem";
import { http, createClient, publicActions, walletActions } from "viem";
import { OPEN_LOOT_CHAIN, OPEN_LOO_RPC_URL } from "./openfort7702/chainConstatnts";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { IKey, KEY_TYPE, IKeyReg, IPubKey, ISpendLimit } from "./openfort7702/interfaces";
import { getAddress } from "../../src/data/addressBook";

import "dotenv/config"
import dotenv from "dotenv";
import { ABI_7702_ACCOUNT } from "./openfort7702/abis";
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
    const { key: keyMaster, keyReg: keyRegMaster } = await getMasterKey();
    const { key: keySession, keyReg: keyRegSession } = await getSessionKey();

    const signature: Hex = "0x";
    const initialGuardian: Hex = keccak256("0x000000000000000000000000000000000000baBe");
    const callData: Hex = encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "initialize",
        args: [keyMaster, keyRegMaster, keySession, keyRegSession, signature, initialGuardian],
    });

    return callData;
}

async function getMasterKey(): Promise<{ key: IKey; keyReg: IKeyReg }> {
    const pubKey: IPubKey = {
        x: "0x62403793637231872a2b213600830613b6784ffc1e427a49139a9532b45fdd9b", // keccak256("x.masterKey")
        y: "0x617568695634f77c1f2536910bbe5ac5190fefd2ac1bc0ce449b60fc07aa832d" // keccak256("y.masterKey")
    };
    const key: IKey = { pubKey: pubKey, eoaAddress: zeroAddress, keyType: KEY_TYPE.WEBAUTHN };

    const spendLimit: ISpendLimit = { token: "0x", limit: 0n };

    const keyReg: IKeyReg = {
        validUntil: 281474976710655, // typy(uint48).max
        validAfter: 0,
        limit: 0,
        whitelisting: false,
        contractAddress: zeroAddress,
        spendTokenInfo: spendLimit,
        allowedSelectors: ["0x000000"],
        ethLimit: 0n
    }

    return { key, keyReg };
}

async function getSessionKey(): Promise<{ key: IKey; keyReg: IKeyReg }> {
    const pubKey: IPubKey = {
        x: "0xc56cdb80cb80d45f8fd7f4bc7f001166b62c55d643f59fc3e2505d1c9db7ecf2", // keccak256("x.sessionKey")
        y: "0x366cc743486c8c664cd49d799274322f79f9280d317399f7c3dc1edabbf0a999"  // keccak256("y.sessionKey")
    };
    const key: IKey = { pubKey: pubKey, eoaAddress: zeroAddress, keyType: KEY_TYPE.P256NONKEY };

    const spendLimit: ISpendLimit = { token: getAddress("usdcBaseSepolia"), limit: 10n ** 18n };

    const keyReg: IKeyReg = {
        validUntil: 1798627246, // Wed Dec 30 2026 10:40:46
        validAfter: 0,
        limit: 10,
        whitelisting: true,
        contractAddress: getAddress("usdcOpSepolia"),
        spendTokenInfo: spendLimit,
        allowedSelectors: ["0x000000"],
        ethLimit: 10n ** 18n
    }

    return { key, keyReg };
}

// Call it immediately
main().catch(console.error);
