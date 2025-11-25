import { Hex } from "viem";
import { KeyType } from "@/data/accountConstants";
import { PubKey } from "@/helpers/signaturesHelpers";

export interface IKey {
    pubKey: PubKey;
    eoaAddress: Hex;
    keyType: KeyType;
}

export interface ISpendLimitTokenInfo {
    token: Hex;
    limit: bigint;
}

export interface IKeyReg {
    validUntil: number;
    validAfter: number;
    limit: number;
    whitelisting: boolean;
    contractAddress: Hex;
    spendTokenInfo: ISpendLimitTokenInfo;
    allowedSelectors: Hex[];
    ethLimit: bigint;
}