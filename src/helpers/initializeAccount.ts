import { IKeys } from "@/interfaces/iTypes";
import { INIT_TYPEHASH } from "@/data/accountConstants";
import { ABI_7702_ACCOUNT, ABI_INITIALIZE_ACCOUNT } from "@/data/abis";
import {
    encodeAbiParameters,
    encodeFunctionData,
    hashDomain,
    keccak256,
    concatHex,
    getTypesForEIP712Domain,
    type Hex,
    type PublicClient,
} from "viem";

// =============================================================
//                 PUBLIC / EXTERNAL FUNCTIONS
// =============================================================
export const initializeCallData = (
    key: IKeys.IKey,
    keyDat: IKeys.IKeyReg,
    sessionKey: IKeys.IKey,
    sessionKeyData: IKeys.IKeyReg,
    signature: Hex,
    initialGuardian: Hex
): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "initialize",
        args: [
            key,
            keyDat,
            sessionKey,
            sessionKeyData,
            signature,
            initialGuardian,
        ],
    });

// =============================================================
//                   PUBLIC / EXTERNAL GETTERS
// =============================================================
export const getDigestToInitCallData = (
    key: IKeys.IKey,
    keyDat: IKeys.IKeyReg,
    sessionKey: IKeys.IKey,
    sessionKeyData: IKeys.IKeyReg,
    initialGuardian: Hex
): Hex =>
    encodeFunctionData({
        abi: ABI_7702_ACCOUNT,
        functionName: "getDigestToInit",
        args: [key, keyDat, sessionKey, sessionKeyData, initialGuardian],
    });

// =============================================================
//                       OFFCHAIN HELPERS
// =============================================================
const KEY_REG_TUPLE = ABI_INITIALIZE_ACCOUNT[0];
const KEY_TUPLE = ABI_INITIALIZE_ACCOUNT[1];

const encodeKey = (key: IKeys.IKey): Hex =>
    encodeAbiParameters(KEY_TUPLE.components as any, [
        key.pubKey.x,
        key.pubKey.y,
        key.eoaAddress,
        key.keyType,
    ]);

const encodeKeyData = (keyData: IKeys.IKeyReg): Hex =>
    encodeAbiParameters(KEY_REG_TUPLE.components as any, [
        Number(keyData.validUntil),
        Number(keyData.validAfter),
        Number(keyData.limit),
        keyData.whitelisting,
        keyData.contractAddress,
        keyData.spendTokenInfo.token,
        BigInt(keyData.spendTokenInfo.limit),
        keyData.allowedSelectors,
        BigInt(keyData.ethLimit),
    ]);

// NOTE: Matches your current schema (no `ethLimit` for sessionKeyData here).
const encodeSessionKeyData = (sessionKeyData: IKeys.IKeyReg): Hex =>
    encodeAbiParameters(KEY_REG_TUPLE.components.slice(0, -1) as any, [
        Number(sessionKeyData.validUntil),
        Number(sessionKeyData.validAfter),
        Number(sessionKeyData.limit),
        sessionKeyData.whitelisting,
        sessionKeyData.contractAddress,
        sessionKeyData.spendTokenInfo.token,
        BigInt(sessionKeyData.spendTokenInfo.limit),
        sessionKeyData.allowedSelectors,
    ]);

const buildDomain = async (
    client: PublicClient,
    contractAddress: Hex
): Promise<{
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: Hex;
    salt: Hex;
}> => {
    const domain = await client.readContract({
        address: contractAddress,
        abi: ABI_7702_ACCOUNT,
        functionName: "eip712Domain",
    });

    const [, name, version, chainId, verifyingContract, salt] = domain as [
        unknown,
        string,
        string,
        bigint,
        Hex,
        Hex,
        unknown
    ];

    return { name, version, chainId, verifyingContract, salt };
};

export const getDigestToInitOffchain = async (
    client: PublicClient,
    contractAddress: Hex,
    key: IKeys.IKey,
    keyData: IKeys.IKeyReg,
    sessionKey: IKeys.IKey,
    sessionKeyData: IKeys.IKeyReg,
    initialGuardian: Hex
): Promise<Hex> => {
    const domain = await buildDomain(client, contractAddress);

    const domainSimple = {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract,
    } as const;

    const keyEnc = encodeKey(key);
    const keyDataEnc = encodeKeyData(keyData);
    const skEnc = encodeKey(sessionKey);
    const skDataEnc = encodeSessionKeyData(sessionKeyData);

    const structHash = keccak256(
        encodeAbiParameters(
            [
                { type: "bytes32" },
                { type: "bytes" },
                { type: "bytes" },
                { type: "bytes" },
                { type: "bytes" },
                { type: "bytes32" },
            ],
            [INIT_TYPEHASH, keyEnc, keyDataEnc, skEnc, skDataEnc, initialGuardian]
        )
    );

    const domainSeparator = hashDomain({
        domain: domainSimple as any,
        types: {
            EIP712Domain: getTypesForEIP712Domain({ domain: domainSimple }),
        } as any,
    });

    return keccak256(concatHex(["0x1901", domainSeparator, structHash]));
};
