import { optimism } from "viem/chains";
import { buildPublicClient } from "../src/clients/publicClient";
import { getDigestToInitCallData, getDigestToInitOffchain } from "../src/helpers/initializeAccount";
import { getAddress } from "../src/data/addressBook";
import { IKeys } from "../src/interfaces/iTypes";
import { PubKey } from "../src/helpers/signaturesHelpers";
import { KeyType } from "../src/data/accountConstants";
import { assert } from "console";

const publicClientOptimism = buildPublicClient(optimism);
const pubKey: PubKey = {
    x: "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb",
    y: "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b"
};
const key: IKeys.IKey = ({
    pubKey,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.WEBAUTHN,
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

const sessionKey: IKeys.IKey = ({
    pubKey,
    eoaAddress: "0x0000000000000000000000000000000000000000",
    keyType: KeyType.P256_NONKEY,
});

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

const initialGuardian = "0x0000000000000000000000000000000000000000000000000000000000000000";

const digestOnChainPromise = publicClientOptimism.call({
    to: getAddress("opf7702ImplV1"),
    data: getDigestToInitCallData(
        key,
        keyData,
        sessionKey,
        sessionKeyData,
        initialGuardian
    ),
});

digestOnChainPromise.then((digestOnChain) => {
    console.log("Digest to initialize account 7702 on Optimism:", digestOnChain);
});

const run = async () => {
    const { data: digestOnChain } = await digestOnChainPromise;
    const digestOffchain = await getDigestToInitOffchain(
        publicClientOptimism,
        getAddress("opf7702ImplV1"),
        key,
        keyData,
        sessionKey,
        sessionKeyData,
        initialGuardian
    );

    console.log("Digest to initialize account 7702 offchain:", digestOffchain);

    assert(
        digestOnChain === digestOffchain,
        "Digests do not match!"
    );
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
