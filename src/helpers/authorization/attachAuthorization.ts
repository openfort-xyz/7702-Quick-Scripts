import type { WalletClient, Hex } from "viem";
import type { SignAuthorizationReturnType } from "viem";

/**
 * Attaches an EIP-7702 authorization to an EOA by sending a transaction
 * with the authorization list.
 */
export async function attachAuthorization(
    walletClient: WalletClient,
    signedAuthorization: SignAuthorizationReturnType
): Promise<Hex> {
    if (!walletClient.account) {
        throw new Error("Wallet client must have an account");
    }

    const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        authorizationList: [signedAuthorization],
        to: walletClient.account.address,
        chain: null,
    });

    return txHash;
}
