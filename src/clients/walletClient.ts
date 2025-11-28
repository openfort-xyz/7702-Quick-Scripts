import "dotenv/config";
import { createWalletClient, http } from "viem";
import type { Chain, Hex, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type MaybeAccount = ReturnType<typeof privateKeyToAccount> | undefined;

const env = process.env as Record<string, string | undefined>;

export const OWNER_7702_PRIVATE_KEY =
    env["7702_OWNER_PRIVATE_KEY"] ?? env.OWNER_7702_PRIVATE_KEY;
const PAYMASTER_OWNER_PRIVATE_KEY = env.PAYMASTER_OWNER_PRIVATE_KEY;
const PAYMASTER_ADMIN_PRIVATE_KEY = env.PAYMASTER_ADMIN_PRIVATE_KEY;
const PAYMASTER_SIGNER_PRIVATE_KEY = env.PAYMASTER_SIGNER_PRIVATE_KEY;

const toAccount = (pk?: string | null): MaybeAccount =>
    pk ? privateKeyToAccount(pk as Hex) : undefined;

class WalletsClient {
    readonly chain: Chain;
    readonly rpcUrl: string;
    readonly walletClientOwner7702?: WalletClient;
    readonly walletClientPaymasterOwner?: WalletClient;
    readonly walletClientPaymasterAdmin?: WalletClient;
    readonly walletClientPaymasterSigner?: WalletClient;

    constructor(chain: Chain, rpcUrl?: string | null) {
        const url = rpcUrl?.trim() || chain.rpcUrls.default.http[0];
        if (!url) {
            throw new Error(`No RPC URL provided for chain ${chain.name}`);
        }

        this.chain = chain;
        this.rpcUrl = url;

        const transport = http(this.rpcUrl);

        this.walletClientOwner7702 = this.createClient(
            toAccount(OWNER_7702_PRIVATE_KEY),
            transport
        );
        this.walletClientPaymasterOwner = this.createClient(
            toAccount(PAYMASTER_OWNER_PRIVATE_KEY),
            transport
        );
        this.walletClientPaymasterAdmin = this.createClient(
            toAccount(PAYMASTER_ADMIN_PRIVATE_KEY),
            transport
        );
        this.walletClientPaymasterSigner = this.createClient(
            toAccount(PAYMASTER_SIGNER_PRIVATE_KEY),
            transport
        );

        if (
            !this.walletClientOwner7702 &&
            !this.walletClientPaymasterOwner &&
            !this.walletClientPaymasterAdmin &&
            !this.walletClientPaymasterSigner
        ) {
            throw new Error("No wallet clients could be created from env keys");
        }
    }

    private createClient(
        account: MaybeAccount,
        transport: ReturnType<typeof http>
    ): WalletClient | undefined {
        if (!account) return undefined;
        return createWalletClient({
            account,
            chain: this.chain,
            transport,
        });
    }
}

export const walletsClient = (
    chain: Chain,
    rpcUrl?: string | null
): WalletsClient => new WalletsClient(chain, rpcUrl);

export { WalletsClient };
