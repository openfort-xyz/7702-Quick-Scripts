import { Chain, walletActions, publicActions } from "viem";
import createFreeBundler, { getFreeBundlerUrl } from "@etherspot/free-bundler";

export function buildBundlerClient(
    chain: Chain,
) {

    const bundlerUrl = process.env.BUNDLER_URL || getFreeBundlerUrl(chain.id);

    return createFreeBundler({
        chain,
        bundlerUrl
    }).extend(publicActions).extend(walletActions);
}
