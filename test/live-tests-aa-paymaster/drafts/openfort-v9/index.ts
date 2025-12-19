import "dotenv/config"
import { createClient, defineChain, http, publicActions, walletActions, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
	createBundlerClient,
	createPaymasterClient,
} from 'viem/account-abstraction'
import { createOpenfortAccount } from "./openfort-simple";
import dotenv from "dotenv";

dotenv.config();

const chain = defineChain({
	id: 510531,
	name: "Open Loot Testnet",
	nativeCurrency: { name: "OpenLoot", symbol: "OL", decimals: 18 },
	rpcUrls: {
		default: {
			http: ["https://open-loot.rpc.testnet.syndicate.io"],
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



const paymasterClient = createPaymasterClient({
	transport: http(`https://api.openfort.io/rpc/510531`, {
		fetchOptions: {
			headers: {
				'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
			},
		},
	}),
})
// console.log(generatePrivateKey())

const owner = privateKeyToAccount(process.env.OWNER_7702_PRIVATE_KEY! as Hex)
export const client = createClient({
	account: owner,
	chain: chain,
	transport: http()
})
	.extend(publicActions)
	.extend(walletActions)

const account = await createOpenfortAccount({
	client,
	owner,
})

const bundlerClient = createBundlerClient({
	account,
	paymaster: paymasterClient,
	client,
	paymasterContext: {
		policyId: process.env.POLICY_ID! as string,
	},
	transport: http(`https://api.openfort.io/rpc/510531`, {
		fetchOptions: {
			headers: {
				'Authorization': `Bearer ${process.env.OPENFORT_API_KEY! as string}`,
			},
		},
	}),
})
const authorization = await client.signAuthorization(account.authorization!)

const hash = await bundlerClient.sendUserOperation({
	account,
	// authorization,
	calls: [
		{
			to: '0xcb98643b8786950F0461f3B0edf99D88F274574D',
			value: 0n,
			data: "0x1234",
		},

	],
})

const receipt = await bundlerClient.waitForUserOperationReceipt({ hash })
console.log('UserOperationReceipt:', receipt)
