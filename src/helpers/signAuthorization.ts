import "dotenv/config";
import type { Hex, SignAuthorizationReturnType } from "viem";
import { getAddress } from "../data/addressBook";
import type { WalletsClient } from "../clients/walletClient";

export async function signAuthorization(
    wallets: WalletsClient,
    contractAddress: Hex = getAddress("opf7702ImplV1")
): Promise<SignAuthorizationReturnType> {
    const owner = wallets.walletClientOwner7702;
    if (!owner) {
        throw new Error("walletClientOwner7702 is not configured");
    }
    if (!owner.account) {
        throw new Error("walletClientOwner7702 is missing an account");
    }

    return owner.signAuthorization({
        account: owner.account,
        contractAddress,
        chainId: wallets.chain.id,
    });
}
