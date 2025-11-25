// --------------------------- ADDRESS BOOK --------------------------- //
// This file contains a simple address book for storing and retrieving
// contact information. It uses a Map to store names and their associated
// addresses.

import { Hex } from "viem";

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
    address: "0x43370900c8de573dB349BEd8DD53b4Ebd3Cce709",
    note: "ERC-4337 entry point",
  },
  opf7702ImplV1: {
    name: "Openfort 7702 Implementation",
    version: "v1",
    address: "0x770200013027B0B3d0151BDeb26757132C95C875",
    note: "Used for 7702 account deployments",
  },
  paymasterV9: {
    name: "Paymaster",
    version: "v3Epv9",
    address: "0x",
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
    address: "0x",
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
