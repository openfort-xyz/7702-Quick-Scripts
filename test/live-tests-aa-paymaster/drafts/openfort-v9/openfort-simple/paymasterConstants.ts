import { Hex, toHex, pad, Address } from "viem";

// Suffix for async feature in the paymaster Data
export const PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;

// Dummy signature for paymaster data in estimation phase
export const DUMMY_PAYMASTER_SIGNATURE = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;

// Signature length for async paymaster feature
export const SIGNATURE_LENGTHS = pad(toHex(65), { size: 2 }) as Hex;

// Paymaster address with asyn feature
export const PAYMASTER_ADDRESS_V9_ASYNC = "0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97" as Address;
// export const PAYMASTER_ADDRESS_V9_ASYNC = "0x9999feeE50Fc515023F207b1c61aB3eA419e27d0" as Address;

// Paymaster mode 0 (Naitve token sponsoring)
export const VERIFYING_MODE = 0n;

// Bundler Allowence (1 = allow all bundlers EOAs)
const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
const BUILD_MODE = (VERIFYING_MODE << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
export const MODE = pad(toHex(BUILD_MODE), { size: 1 });

// Paymaster data timestamp validity windows
export const VALID_UNTIL = pad(toHex(1796977534), { size: 6 });
export const VALID_AFTER = pad(toHex(0), { size: 6 });


// Stub Gas
export const VERIFICATION_GAS_LIMIT = 400_000n;
export const POST_GAS_LIMIT = 50_000n;
