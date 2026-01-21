import { getAddress } from "../../data/addressBook";
import { UserOperation } from "viem/account-abstraction";
import { SignAuthorizationReturnType } from "viem/accounts";
import { Address, EncodeFunctionDataReturnType, Hex, PublicClient, encodeFunctionData, parseEther, type Call, WalletClient, Account, toHex, SignedAuthorization, concat, pad } from "viem";
import type { Abi } from "viem";

export type gasFees = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

class Helpres {
  readonly DUMMY_SIG = '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex;
  readonly RECIVER = '0x25B10f9CAdF3f9F7d3d57921fab6Fdf64cC8C7f4' as Hex;
  readonly VERIFYING_MODE = 0;
  readonly ERC20_MODE = 1;
  readonly MAX_UINT256 = (1n << 256n) - 1n;
  readonly PAYMASTER_SIG_MAGIC = '0x22e325a297439656' as Hex;
  readonly ERC20_APPROVE_ABI = [
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" }
      ],
      outputs: [{ name: "", type: "bool" }]
    }
  ] as const satisfies Abi;

  /**
   * Creates paymasterData for VERIFYING_MODE without signature
   * Structure: modeByte (1 byte) + validUntil (6 bytes) + validAfter (6 bytes)
   * Mode byte for VERIFYING_MODE: (0 << 1) | 0 = 0x00
   */
  createVerifyingModePaymasterData(validUntil: number, validAfter: number): Hex {
    const modeByte = '0x00'; // VERIFYING_MODE: (0 << 1) | allowAllBundlers(0) = 0
    const validUntilHex = pad(toHex(validUntil), { size: 6 });
    const validAfterHex = pad(toHex(validAfter), { size: 6 });

    return concat([modeByte, validUntilHex, validAfterHex]) as Hex;
  }

  createVerifyingModePaymasterDataERC20({
    combinedByte,
    validUntil,
    validAfter,
    token,
    postOpGas,
    exchangeRate,
    paymasterValidationGasLimit,
    treasury,
    preFundInToken,
    constantFee,
    recipient,
    allowAllBundlers = true
  }: {
    combinedByte: number;
    validUntil: bigint | number;
    validAfter: bigint | number;
    token: Hex;
    postOpGas: bigint | number;
    exchangeRate: bigint | number;
    paymasterValidationGasLimit: bigint | number;
    treasury: Hex;
    preFundInToken?: bigint | number;
    constantFee?: bigint | number;
    recipient?: Hex;
    allowAllBundlers?: boolean;
  }): Hex {
    const toBigInt = (value: bigint | number) => typeof value === 'bigint' ? value : BigInt(value);
    const modeValue = (this.ERC20_MODE << 1) | (allowAllBundlers ? 0x01 : 0x00);
    const modeByte = toHex(modeValue, { size: 1 });
    const combinedByteValue = combinedByte & 0xff;
    const combinedByteHex = toHex(BigInt(combinedByteValue), { size: 1 });

    const segments: Hex[] = [
      modeByte,
      combinedByteHex,
      pad(toHex(toBigInt(validUntil)), { size: 6 }),
      pad(toHex(toBigInt(validAfter)), { size: 6 }),
      pad(token, { size: 20 }),
      pad(toHex(toBigInt(postOpGas)), { size: 16 }),
      pad(toHex(toBigInt(exchangeRate)), { size: 32 }),
      pad(toHex(toBigInt(paymasterValidationGasLimit)), { size: 16 }),
      pad(treasury, { size: 20 })
    ];

    const constantFeePresent = (combinedByteValue & 0x01) !== 0;
    const recipientPresent = (combinedByteValue & 0x02) !== 0;
    const preFundPresent = (combinedByteValue & 0x04) !== 0;

    if (preFundPresent) {
      if (preFundInToken === undefined) {
        throw new Error('preFundInToken is required when preFund bit is set');
      }
      segments.push(pad(toHex(toBigInt(preFundInToken)), { size: 16 }));
    } else if (preFundInToken !== undefined) {
      throw new Error('preFundInToken provided but preFund bit not set');
    }

    if (constantFeePresent) {
      if (constantFee === undefined) {
        throw new Error('constantFee is required when constant fee bit is set');
      }
      segments.push(pad(toHex(toBigInt(constantFee)), { size: 16 }));
    } else if (constantFee !== undefined) {
      throw new Error('constantFee provided but constant fee bit not set');
    }

    if (recipientPresent) {
      if (!recipient) {
        throw new Error('recipient is required when recipient bit is set');
      }
      segments.push(pad(recipient, { size: 20 }));
    } else if (recipient) {
      throw new Error('recipient provided but recipient bit not set');
    }

    return concat(segments) as Hex;
  }

  /**
   * Creates dummy ERC20 paymaster data for gas estimation
   * This is much longer than native sponsorship dummy data
   * @param validUntil - Unix timestamp when sponsorship expires
   * @param validAfter - Unix timestamp when sponsorship becomes valid
   * @param exchangeRate - USDC/ETH exchange rate (e.g., 3_000_000_000 for 3000 USDC per ETH)
   * @param postOpGas - Gas for postOp execution (default: 50000)
   * @param paymasterValidationGasLimit - Gas for paymaster validation (default: 150000)
   * @param constantFee - Optional constant fee in USDC units (6 decimals). If provided, combinedByte will include constantFee bit (0x01)
   * @returns Dummy ERC20 paymaster data with signature
   */
  getDummyPaymasterDataERC20(
    validUntil: number,
    validAfter: number,
    exchangeRate: bigint,
    postOpGas: bigint = 50000n,
    paymasterValidationGasLimit: bigint = 150000n,
    constantFee?: bigint
  ): Hex {
    // Determine combinedByte based on optional fields
    const combinedByte = constantFee !== undefined ? 0x01 : 0x00;

    // Create ERC20 paymaster data
    const paymasterData = this.createVerifyingModePaymasterDataERC20({
      combinedByte,
      validUntil,
      validAfter,
      token: getAddress("usdcOpSepolia"),
      postOpGas,
      exchangeRate,
      paymasterValidationGasLimit,
      treasury: getAddress("treasure"), // Address where USDC tokens will be sent
      constantFee, // Only included if combinedByte has 0x01 bit set
      allowAllBundlers: false // Set to false for stricter bundler validation
    });

    // Append dummy signature (65 bytes)
    return this.appendSignatureToPaymasterData(paymasterData, this.DUMMY_SIG);
  }

  /**
   * Appends signature to verifying mode paymaster data
   */
  appendSignatureToPaymasterData(paymasterData: Hex, signature: Hex): Hex {
    // Remove 0x from signature before concatenating
    return `${paymasterData}${signature.slice(2)}` as Hex;
  }

  createVerifyingModePaymasterDataAsync(validUntil: number, validAfter: number): Hex {
    const modeByte = '0x00';
    const validUntilHex = pad(toHex(validUntil), { size: 6 });
    const validAfterHex = pad(toHex(validAfter), { size: 6 });

    return concat([modeByte, validUntilHex, validAfterHex, this.PAYMASTER_SIG_MAGIC]) as Hex;
  }

  createVerifyingModePaymasterDataAsyncWithPlaceholder(validUntil: number, validAfter: number): Hex {
    const modeByte = '0x00';
    const validUntilHex = pad(toHex(validUntil), { size: 6 });
    const validAfterHex = pad(toHex(validAfter), { size: 6 });
    const placeholderLength = pad(toHex(0), { size: 2 });

    return concat([modeByte, validUntilHex, validAfterHex, placeholderLength, this.PAYMASTER_SIG_MAGIC]) as Hex;
  }

  appendAsyncSignatureToPaymasterData(paymasterDataBase: Hex, signature: Hex): Hex {
    const sigLength = (signature.length - 2) / 2;
    const sigLengthHex = pad(toHex(sigLength), { size: 2 });

    return concat([paymasterDataBase, signature, sigLengthHex, this.PAYMASTER_SIG_MAGIC]) as Hex;
  }
}

export const helpers = new Helpres();
