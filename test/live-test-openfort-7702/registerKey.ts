import { privateKeyToAccount, SignAuthorizationReturnType } from "viem/accounts";
import { createOpenfortAccount } from "./openfort7702"
import { concat, encodeFunctionData, Hex, keccak256, toHex, zeroAddress, Address, pad } from "viem";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { http, createClient, publicActions, walletActions } from "viem";
import { OPEN_LOOT_CHAIN, OPEN_LOO_RPC_URL } from "./openfort7702/chainConstatnts";
import { createBundlerClient, UserOperation } from "viem/account-abstraction";
import { formatUserOperationRequest, formatUserOperationGas, toPackedUserOperation } from "viem/account-abstraction";
import { IKey, KEY_TYPE, IKeyReg, IPubKey, ISpendLimit } from "./openfort7702/interfaces";
import { getAddress } from "../../src/data/addressBook";
import { PaymasterData } from "./openfort7702/paymasterConstants";
import { ABI_7702_ACCOUNT, ABI_PAYMASTER_V3 } from "./openfort7702/abis";

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

// ------------------------------------------------------------------------------------
//
//                                  Register Key
//
// ------------------------------------------------------------------------------------

const main = async () => {
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
        callData: await getRegisterKeyallData(),
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        signature: await openfortAccount.getStubSignature(),
        authorization,
    }

    // ------------------------------------------------------------------------------------
    //
    //                           Create Paymaster Stub Data
    //
    // ------------------------------------------------------------------------------------

    const paymasterStubData = concat([
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.DUMMY_PAYMASTER_SIGNATURE,
        PaymasterData.SIGNATURE_LENGTHS,
        PaymasterData.PAYMASTER_SIG_MAGIC,
    ]);

    userOp = {
        ...userOp,
        paymaster: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
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
            openfortAccount.entryPoint.address
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
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        PaymasterData.PAYMASTER_SIG_MAGIC,
    ]);

    // Use account's built-in signing which correctly handles EIP-7702
    const accountPackedSignature = await openfortAccount.signUserOperation(userOpForAccount);

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
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
        pad(toHex(0), { size: 2 }),
        PaymasterData.PAYMASTER_SIG_MAGIC,
    ]);


    // Get paymaster hash using readContract (no state override needed for paymaster)
    const paymasterHash = await client.readContract({
        address: PaymasterData.PAYMASTER_ADDRESS_V9_ASYNC,
        abi: ABI_PAYMASTER_V3,
        functionName: 'getHash',
        args: [Number(PaymasterData.VERIFYING_MODE), toPackedUserOperation(userOpForPaymaster)]
    });

    const paymasterRawSignature = await paymasterSignerAccount.signMessage({
        message: { raw: paymasterHash }
    });

    const paymasterData = concat([
        PaymasterData.MODE,
        PaymasterData.VALID_UNTIL,
        PaymasterData.VALID_AFTER,
    ]);


    userOp = {
        ...userOp,
        paymasterData: concat([
            paymasterData,
            paymasterRawSignature,
            PaymasterData.SIGNATURE_LENGTHS,
            PaymasterData.PAYMASTER_SIG_MAGIC
        ]),
    }

    // ------------------------------------------------------------------------------------
    //
    //                                Send User Operation
    //
    // ------------------------------------------------------------------------------------

    const finalUserOpHash = await bundlerClient.request({
        method: 'eth_sendUserOperation',
        params: [
            formatUserOperationRequest(userOp),
            openfortAccount.entryPoint.address
        ],
    });

    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: finalUserOpHash })
    console.log('UserOperationReceipt:', receipt)
    console.log('Transaction hash:', receipt.receipt.transactionHash)
}


// ------------------------------------------------------------------------------------
//
//                                  Session Key Data
//
// ------------------------------------------------------------------------------------

async function getRegisterKeyallData(): Promise<Hex> {
    const { key, keyReg }  = await getSessionKey();

    const callData = encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: 'registerKey',
        args: [key, keyReg],
    });

    return callData;
}

async function getSessionKey(): Promise<{ key: IKey; keyReg: IKeyReg }> {
    const pubKey: IPubKey = {
        x: "0x59a45ca91b663b12470eb5f47d058ed2094d4555f9cf82219eff5cff728df98b", // keccak256("x.sessionKey2")
        y: "0x8625e30dd993fe65d43999d80a2a828b1e33101887a5bac67fb92bb2242cfbc3"  // keccak256("y.sessionKey2")
    };
    const key: IKey = { pubKey: pubKey, eoaAddress: zeroAddress, keyType: KEY_TYPE.P256 };

    const spendLimit: ISpendLimit = { token: getAddress("usdcBaseSepolia"), limit: 10n ** 18n };

    const keyReg: IKeyReg = {
        validUntil: 1798627246, // Wed Dec 30 2026 10:40:46
        validAfter: 0,
        limit: 10,
        whitelisting: true,
        contractAddress: getAddress("usdcOpSepolia"),
        spendTokenInfo: spendLimit,
        allowedSelectors: ["0x00000000"],
        ethLimit: 10n ** 18n
    }

    return { key, keyReg };
}

// Call it immediately
main().catch(console.error);
