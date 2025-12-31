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

// EIP‑712 type hash for the Initialize struct
const INIT_TYPEHASH = "0x82dc6262fca76342c646d126714aa4005dfcd866448478747905b2e7b9837183" as Hex;

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
//                                Attach and Initialize
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
        callData: await getInitCallData(openfortAccount, bundlerClient),
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

async function getInitCallData(openfortAccount: any, bundlerClient: any): Promise<Hex> {
    const { key: keyMaster, keyReg: keyRegMaster } = await getMasterKey();
    const { key: keySession, keyReg: keyRegSession } = await getSessionKey();

    const initialGuardian: Hex = keccak256("0x000000000000000000000000000000000000baBe");

    const signature: Hex = await signEIP712(keyMaster, keyRegMaster, keySession, keyRegSession, initialGuardian, openfortAccount, bundlerClient);

    const callData: Hex = encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "initialize",
        args: [keyMaster, keyRegMaster, keySession, keyRegSession, signature, initialGuardian],
    });

    return callData;
}

// ------------------------------------------------------------------------------------
//
//                                  Master Key Data
//
// ------------------------------------------------------------------------------------

async function getMasterKey(): Promise<{ key: IKey; keyReg: IKeyReg }> {
    const pubKey: IPubKey = {
        x: "0x62403793637231872a2b213600830613b6784ffc1e427a49139a9532b45fdd9b", // keccak256("x.masterKey")
        y: "0x617568695634f77c1f2536910bbe5ac5190fefd2ac1bc0ce449b60fc07aa832d" // keccak256("y.masterKey")
    };
    const key: IKey = { pubKey: pubKey, eoaAddress: zeroAddress, keyType: KEY_TYPE.WEBAUTHN };

    const spendLimit: ISpendLimit = { token: zeroAddress, limit: 0n };

    const keyReg: IKeyReg = {
        validUntil: 281474976710655, // typy(uint48).max
        validAfter: 0,
        limit: 0,
        whitelisting: false,
        contractAddress: zeroAddress,
        spendTokenInfo: spendLimit,
        allowedSelectors: ["0x00000000"],
        ethLimit: 0n
    }

    return { key, keyReg };
}

// ------------------------------------------------------------------------------------
//
//                                  Session Key Data
//
// ------------------------------------------------------------------------------------

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
        allowedSelectors: ["0x00000000"],
        ethLimit: 10n ** 18n
    }

    return { key, keyReg };
}

// ------------------------------------------------------------------------------------
//
//                        Create And Sign EIP712 for Initialize
//
// ------------------------------------------------------------------------------------

async function signEIP712(
    keyMaster: IKey,
    keyRegMaster: IKeyReg,
    keySession: IKey,
    keyRegSession: IKeyReg,
    initialGuardian: Hex,
    openfortAccount: any,
    bundlerClient: any,
): Promise<Hex> {

    // ------------------------------------------------------------------------------------
    //
    //                                  Concat Keys Data
    //
    // ------------------------------------------------------------------------------------

    // Encode master key
    const keyEncMaster: Hex = encodeAbiParameters(
        parseAbiParameters('bytes32, bytes32, address, uint8'),
        [
            keyMaster.pubKey.x,
            keyMaster.pubKey.y,
            keyMaster.eoaAddress,
            keyMaster.keyType
        ]
    );

    // Encode master key data
    const keyDataEncMaster: Hex = encodeAbiParameters(
        parseAbiParameters('uint48, uint48, uint48, bool, address, address, uint256, bytes4[], uint256'),
        [
            keyRegMaster.validUntil,
            keyRegMaster.validAfter,
            keyRegMaster.limit,
            keyRegMaster.whitelisting,
            keyRegMaster.contractAddress,
            keyRegMaster.spendTokenInfo.token,
            keyRegMaster.spendTokenInfo.limit,
            keyRegMaster.allowedSelectors,
            keyRegMaster.ethLimit,
        ]
    );

    // Encode session key
    const keyEncSession: Hex = encodeAbiParameters(
        parseAbiParameters('bytes32, bytes32, address, uint8'),
        [
            keySession.pubKey.x,
            keySession.pubKey.y,
            keySession.eoaAddress,
            keySession.keyType
        ]
    );

    // Encode session key data
    const keyDataEncSession: Hex = encodeAbiParameters(
        parseAbiParameters('uint48, uint48, uint48, bool, address, address, uint256, bytes4[]'),
        [
            keyRegSession.validUntil,
            keyRegSession.validAfter,
            keyRegSession.limit,
            keyRegSession.whitelisting,
            keyRegSession.contractAddress,
            keyRegSession.spendTokenInfo.token,
            keyRegSession.spendTokenInfo.limit,
            keyRegSession.allowedSelectors,
        ]
    );

    // ------------------------------------------------------------------------------------
    //
    //                                   Concat All
    //
    // ------------------------------------------------------------------------------------

    // Calculate struct hash
    const structHash = keccak256(
        encodeAbiParameters(
            parseAbiParameters('bytes32, bytes, bytes, bytes, bytes, bytes32'),
            [
                INIT_TYPEHASH,
                keyEncMaster,
                keyDataEncMaster,
                keyEncSession,
                keyDataEncSession,
                initialGuardian
            ]
        )
    );

    // ------------------------------------------------------------------------------------
    //
    //                                   Create Hash
    //
    // ------------------------------------------------------------------------------------

    // EIP-712 Domain Type Hash
    const TYPE_HASH = keccak256(
        toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    );

    // Calculate domain separator
    const domainSeparator = keccak256(
        encodeAbiParameters(
            parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
            [
                TYPE_HASH,
                keccak256(toHex("OPF7702Recoverable")),
                keccak256(toHex("1")),
                BigInt(bundlerClient.chain.id),
                openfortAccount.address
            ]
        )
    );

    // Calculate final digest (EIP-712)
    const digest = keccak256(
        concat([
            "0x1901" as Hex,
            domainSeparator,
            structHash
        ])
    );

    // Sign the digest using ownerAccount's EOA private key
    const signature: Hex = await ownerAccount.sign({ hash: digest });

    return signature
}

// Call it immediately
main().catch(console.error);
