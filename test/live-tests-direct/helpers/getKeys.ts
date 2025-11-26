import { IKeys } from "@/interfaces/iTypes";
import { PubKey } from "@/helpers/signaturesHelpers";
import { KeyType } from "@/data/accountConstants";

const pubKeyMK: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
};

const pubKeySK: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
};

const pubKeySK_2: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
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
    validUntil: 1700000000,
    validAfter: 0,
    limit: 10,
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
    validUntil: 1700000000,
    validAfter: 0,
    limit: 10,
    whitelisting: false,
    contractAddress: "0x0000000000000000000000000000000000000000",
    spendTokenInfo: {
        token: "0x0000000000000000000000000000000000000000",
        limit: BigInt(0),
    },
    allowedSelectors: ["0xdeadbeef"],
    ethLimit: BigInt(0),
};

const sessionKeyData_2: IKeys.IKeyReg = {
    validUntil: 1700000000,
    validAfter: 0,
    limit: 10,
    whitelisting: false,
    contractAddress: "0x0000000000000000000000000000000000000000",
    spendTokenInfo: {
        token: "0x0000000000000000000000000000000000000000",
        limit: BigInt(0),
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