import { defineChain } from "viem";

// RPC URL
export const OPEN_LOO_RPC_URL = "https://open-loot.rpc.testnet.syndicate.io";

// Openloot Chain Object
export const OPEN_LOOT_CHAIN = defineChain({
  id: 510531,
  name: "Open Loot Testnet",
  nativeCurrency: { name: "OpenLoot", symbol: "OL", decimals: 18 },
  rpcUrls: {
    default: {
      http: [OPEN_LOO_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Open Loot Testnet Explorer",
      url: "https://open-loot.explorer.testnet.syndicate.io",
    },
  },
  testnet: true,
});
