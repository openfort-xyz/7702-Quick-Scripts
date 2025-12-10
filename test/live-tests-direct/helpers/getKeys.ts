import { IKeys } from "@/interfaces/iTypes";
import { PubKey } from "@/helpers/signaturesHelpers";
import { KeyType } from "@/data/accountConstants";
import { getAddress } from "../../../src/data/addressBook";

const pubKeyMK: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
};

const pubKeySK: PubKey = {
    x: "0xa30c88256fd263a8ec589f8197eaa467cbbd860acd7fe8c13d69c4d9c2af095d",
    y: "0xbf2bffb0de07e732704ab92f9e1181377468a3beb4d6000b8876b0c81cfa9991"
};

const pubKeySK_2: PubKey = {
    x: "0xb4a7e6d1234567890abcdef1234567890abcdef1234567890abcdef123456789",
    y: "0xc778a9b2345678901bcdef23456789012cdef3456789012def45678901234567"
};

const keyMK: IKeys.IKey = ({
    pubKey: pubKeyMK,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.WEBAUTHN,
});

const keySK: IKeys.IKey = ({
    pubKey: pubKeySK,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.P256_NONKEY,
});

const keySK_2: IKeys.IKey = ({
    pubKey: pubKeySK_2,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.P256_NONKEY,
});

const keyData: IKeys.IKeyReg = {
    validUntil: 281474976710655,
    validAfter: 0,
    limit: 0,
    whitelisting: false,
    contractAddress: "0x0000000000000000000000000000000000000000",
    spendTokenInfo: {
        token: "0x0000000000000000000000000000000000000000",
        limit: BigInt(0),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(0),
};

const sessionKeyData: IKeys.IKeyReg = {
    validUntil: 1795706982,
    validAfter: 0,
    limit: 10,
    whitelisting: true,
    contractAddress: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
    spendTokenInfo: {
        token: getAddress("usdcBaseSepolia"),
        limit: BigInt(0),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(100 * 1e18),
};

const sessionKeyData_2: IKeys.IKeyReg = {
    validUntil: 1795706982,
    validAfter: 0,
    limit: 10,
    whitelisting: true,
    contractAddress: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
    spendTokenInfo: {
        token: getAddress("usdcBaseSepolia"),
        limit: BigInt(100 * 1e18),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(0),
};

export const keys = () => ({
    keyMK,
    keySK,
    keyData,
    sessionKeyData,
    keySK_2,
    sessionKeyData_2
});
