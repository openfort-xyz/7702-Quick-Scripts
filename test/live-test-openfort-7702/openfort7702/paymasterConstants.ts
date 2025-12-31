import { Hex, toHex, pad, Address } from "viem";

export const PaymasterData = {
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

    // Paymaster data timestamp validity windows
    VALID_UNTIL: pad(toHex(1796977534), { size: 6 }),
    VALID_AFTER: pad(toHex(0), { size: 6 }),

    // Stub Gas
    VERIFICATION_GAS_LIMIT: 400_000n,
    POST_GAS_LIMIT: 50_000n,
} as const;
