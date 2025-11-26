import { optimism } from "viem/chains";
import { getAddress } from "../src/data/addressBook";
import { buildPublicClient } from "../src/clients/publicClient";
import {getEntryPointCallData, getWebAuthnVerifierCallData, getGasPolicyCallData} from "../src/helpers/setAddresses";

const publicClientOptimism = buildPublicClient(optimism);

const entryPointAddress = publicClientOptimism.call({
    to: getAddress("opf7702ImplV1"),
    data: getEntryPointCallData(),
});

const webAuthnVerifierAddress = publicClientOptimism.call({
    to: getAddress("opf7702ImplV1"),
    data: getWebAuthnVerifierCallData(),
});

const gasPolicyAddress = publicClientOptimism.call({
    to: getAddress("opf7702ImplV1"),
    data: getGasPolicyCallData(),
});

entryPointAddress.then((address) => {
    console.log("Entry Point Address:", address);
});

webAuthnVerifierAddress.then((address) => {
    console.log("WebAuthn Verifier Address:", address);
});

gasPolicyAddress.then((address) => {
    console.log("Gas Policy Address:", address);
});
