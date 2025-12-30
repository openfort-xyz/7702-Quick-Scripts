import { Address, Hex } from "viem";

// Signer key type
enum KEY_TYPE {
    EOA,
    WEBAUTHN,
    P256,
    P256NONKEY
}

// Public key structure for P256 curve used in WebAuthn
interface PubKey {
    x: Hex;
    y: Hex;
}

// Key structure containing all necessary key information
interface Key {
    pubKey: PubKey;
    eoaAddress: Address;

}

// KeyReg data structure containing permissions and limits
interface KeyReg {
    validUntil: number;
    validAfter: number;
    limit: number;
    whitelisting: boolean;
    contractAddress: Address;
    spendTokenInfo: ISpendLimit;
    allowedSelectors: Hex[];
    ethLimit: bigint;
}

// Token spending limit information
interface ISpendLimit {
    token: Address;
    limit: bigint;
}

// Key data structure containing permissions and limits
interface KeyData {
    pubKey: PubKey;
    isActive: boolean;
    validUntil: number;
    validAfter: number;
    limit: number;
    masterKey: boolean;
    whitelisting: boolean;
    whitelist: Record<Address, boolean>;
    spendTokenInfo: ISpendLimit;
    allowedSelectors: Hex[];
    ethLimit: bigint;
}

export { KEY_TYPE, PubKey, Key, KeyReg, ISpendLimit, KeyData };
