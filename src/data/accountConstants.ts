import { Hex } from "viem";

export enum AccountTypes {
  EOA,
  WEBAUTHN,
  P256,
  P256_NONKEY
}

export const DUMMY_SIGNATURE: Hex = "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as Hex;
