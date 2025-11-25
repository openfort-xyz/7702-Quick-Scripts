import { encodeAbiParameters, Hex } from "viem";
import { AccountTypes, DUMMY_SIGNATURE } from "@/data/accountConstants";

export type PubKey = {
    x: Hex;
    y: Hex;
};

export type WebAuthnSignature = {
    requireUserVerification: boolean;
    authenticatorData: Hex;
    clientDataJSON: string;
    challengeIndex: bigint | number;
    typeIndex: bigint | number;
    r: Hex;
    s: Hex;
    pubKey: PubKey;
};

export type P256Signature = {
    r: Hex;
    s: Hex;
    pubKey: PubKey;
    keyType: AccountTypes.P256 | AccountTypes.P256_NONKEY;
};

const OUTER_WRAP_ABI = [
    { type: "uint256" }, 
    { type: "bytes" },
] as const;

const STUB_SIGNATURE_ABI = OUTER_WRAP_ABI;

const WEB_AUTHN_INNER_ABI = [
    { type: "bool" },
    { type: "bytes" },
    { type: "string" },
    { type: "uint256" },
    { type: "uint256" },
    { type: "bytes32" },
    { type: "bytes32" },
    { type: "tuple", components: [{ type: "bytes32" }, { type: "bytes32" }] },
] as const;

const P256_INNER_ABI = [
    { type: "bytes32" },
    { type: "bytes32" },
    { type: "tuple", components: [{ type: "bytes32" }, { type: "bytes32" }] },
] as const;

export const encodeEOASignature = (signature: Hex): Hex =>
    encodeAbiParameters(OUTER_WRAP_ABI, [BigInt(AccountTypes.EOA), signature]);

export const encodeWebAuthnSignature = (params: WebAuthnSignature): Hex => {
    const inner = encodeAbiParameters(WEB_AUTHN_INNER_ABI, [
        params.requireUserVerification,
        params.authenticatorData,
        params.clientDataJSON,
        BigInt(params.challengeIndex),
        BigInt(params.typeIndex),
        params.r,
        params.s,
        [params.pubKey.x, params.pubKey.y],
    ]);

    return encodeAbiParameters(OUTER_WRAP_ABI, [
        BigInt(AccountTypes.WEBAUTHN),
        inner,
    ]);
};

export const encodeP256Signature = (params: P256Signature): Hex => {
    const inner = encodeAbiParameters(P256_INNER_ABI, [
        params.r,
        params.s,
        [params.pubKey.x, params.pubKey.y],
    ]);

    return encodeAbiParameters(OUTER_WRAP_ABI, [BigInt(params.keyType), inner]);
};

export const getStubSignature = (keyType: AccountTypes): Hex =>
    encodeAbiParameters(STUB_SIGNATURE_ABI, [BigInt(keyType), DUMMY_SIGNATURE]);
