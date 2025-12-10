// --------------------------- ADDRESS BOOK --------------------------- //
// This file contains a simple address book for storing and retrieving
// contact information. It uses a Map to store names and their associated
// addresses.

import { Hex } from "viem";
import { treasure } from "viem/chains";

type AddressBook = {
  name: string;
  version: string;
  address: Hex;
  note?: string;
};

export const addressBook = {
  entryPointV9: {
    name: "EntryPoint",
    version: "v0.9",
    address: "0x433709009b8330fda32311df1c2afa402ed8d009", // "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
    note: "ERC-4337 entry point",
  },
  opf7702ImplV1: {
    name: "Openfort 7702 Implementation",
    version: "v1",
    address: "0x77020901f40BE88Df754E810dA9868933787652B", // "0x770201093028dff97683df845D6cDF731D01Ff15",
    note: "Used for 7702 account deployments",
  },
  paymasterV9: {
    name: "Paymaster",
    version: "v3Epv9",
    address: "0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97", // Paymaster V3 EPv9 with Async feature (old)0xDeaD9FeEc687b3785ce66124b15C40b00d69dbd1
    note: "Used for gas sponsorship",
  },
  treasure: {
    name: "EOA Treasury",
    version: "0.1",
    address: "0x6E10F8bEfC4069Faa560bF3DdFe441820BbE37d0", // Paymaster V3 EPv9 with Async feature
    note: "Used for gas sponsorship",
  },
  erc20: {
    name: "ERC20 Token",
    version: "v1",
    address: "0x",
    note: "ERC20 token for transfers",
  },
  usdcBaseSepolia: {
    name: "USDC Token",
    version: "base-sepolia",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    note: "USDC stablecoin",
  },
  usdcOpSepolia: {
    name: "USDC Token",
    version: "op-sepolia",
    address: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    note: "USDC stablecoin",
  },
  erc721: {
    name: "NFT Token",
    version: "v1",
    address: "0x",
    note: "NFT collection",
  },
} as const satisfies Record<string, AddressBook>;

export type AddressKey = keyof typeof addressBook;

export const getAddress = (key: AddressKey): Hex => addressBook[key].address;

export const getAddressBook = (key: AddressKey): AddressBook =>
  addressBook[key];
