import { Hex, toHex, pad, Address, concat, size } from "viem";

export const PaymasterData = {
    // Sponsored ERC20
    ERC20_ADDRESS: '0x000e4C20CCC59A2221A5B2E41aD56F4F22eF2202' as Address,

    // Exchange Rate
    EXCHANGE_RATE: BigInt(30e18),

    // Treasury
    TREASURY: '0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1' as Address,

    // Suffix for async feature in the paymaster Data
    PAYMASTER_SIG_MAGIC: '0x22e325a297439656' as Hex,

    // Dummy signature for paymaster data in estimation phase
    DUMMY_PAYMASTER_SIGNATURE: '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex,

    // Signature length for async paymaster feature
    SIGNATURE_LENGTHS: pad(toHex(65), { size: 2 }) as Hex,

    // Paymaster address with async feature
    PAYMASTER_ADDRESS_V9_ASYNC: "0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97" as Address,

    // Paymaster mode 0 (Native token sponsoring)
    VERIFYING_MODE: 0n,

    // Bundler Allowance (1 = allow all bundlers EOAs)
    MODE: (() => {
        const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
        const BUILD_MODE = (0n << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
        return pad(toHex(BUILD_MODE), { size: 1 });
    })(),

    MODE_ERC20: (() => {
        const MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH = 1n;
        const BUILD_MODE = (1n << 1n) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH;
        return pad(toHex(BUILD_MODE), { size: 1 });
    })(),

    // ERC20 Modes
    // Basic ERC20 mode - no optional fields
    COMBINED_BYTE_BASIC: '0x00' as Hex,

    // Paymaster data timestamp validity windows
    VALID_UNTIL: pad(toHex(1796977534), { size: 6 }),
    VALID_AFTER: pad(toHex(0), { size: 6 }),

    // Stub Gas
    PAYMASTER_VALIDATION_GAS_LIMIT: 100_000n,
    VERIFICATION_GAS_LIMIT: 400_000n,
    POST_GAS_LIMIT: 50_000n,
} as const;
