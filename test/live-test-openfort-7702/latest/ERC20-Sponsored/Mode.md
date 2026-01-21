# ERC20 Paymaster Modes Guide

## Overview

The ERC20 Paymaster supports 8 different modes controlled by the `combinedByte` field in the paymasterData. Each mode enables different combinations of three optional features:

| Bit | Flag | Feature | Description |
|-----|------|---------|-------------|
| 0 | 0x01 | `constantFeePresent` | Adds a fixed fee to the gas cost |
| 1 | 0x02 | `recipientPresent` | Specifies an address to receive excess tokens |
| 2 | 0x04 | `preFundPresent` | Charges tokens upfront during validation |

---

## Mode Reference Table

| Mode | Hex | Binary | preFund | constantFee | recipient | File |
|------|-----|--------|---------|-------------|-----------|------|
| Basic | 0x00 | 000 | - | - | - | `executeCall.ERC20Mode1.ts` |
| ConstantFee | 0x01 | 001 | - | ✓ | - | `executeCall.ERC20.ConstantFee.ts` |
| Recipient | 0x02 | 010 | - | - | ✓ | `executeCall.ERC20.Recipient.ts` |
| ConstantFee+Recipient | 0x03 | 011 | - | ✓ | ✓ | `executeCall.ERC20.ConstantFeeRecipient.ts` |
| PreFund | 0x04 | 100 | ✓ | - | - | `executeCall.ERC20.PreFund.ts` |
| PreFund+ConstantFee | 0x05 | 101 | ✓ | ✓ | - | `executeCall.ERC20.PreFundConstantFee.ts` |
| PreFund+Recipient | 0x06 | 110 | ✓ | - | ✓ | `executeCall.ERC20.PreFundRecipient.ts` |
| ALL | 0x07 | 111 | ✓ | ✓ | ✓ | `executeCall.ERC20.All.ts` |

---

## Mode Details

### Mode 0x00 - Basic

**Description:** Simple ERC20 gas payment without any optional features.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x00
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: Signature verified
EXECUTION:  UserOp executes
POSTOP:     User pays actualGasCost in tokens to treasury
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Simple Gas Payment | User pays gas in ERC20 tokens instead of ETH |
| Stablecoin Payments | Pay gas in USDC, USDT, DAI, etc. |

**Example:**
```
Gas used: 0.80 USDC
User pays: 0.80 USDC → treasury
```

---

### Mode 0x01 - ConstantFee

**Description:** Adds a fixed protocol fee on top of the gas cost.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x01
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
constantFee              (16 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: Signature verified
EXECUTION:  UserOp executes
POSTOP:     User pays (actualGasCost + constantFee) to treasury
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Protocol Service Fee | Charge a fixed fee for using the paymaster service |
| Subscription Model | Fixed fee per transaction as part of subscription |
| Revenue Generation | Protocol earns fixed amount per sponsored tx |

**Example:**
```
Gas used: 0.80 USDC
Constant fee: 0.10 USDC
User pays: 0.80 + 0.10 = 0.90 USDC → treasury
```

---

### Mode 0x02 - Recipient

**Description:** Specifies an address that receives excess tokens when preFund > actualCost.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x02
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
recipient                (20 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: Signature verified
EXECUTION:  UserOp executes
POSTOP:     User pays actualGasCost
            If preFundInToken > actualCost:
              Excess → recipient (not back to user)
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Referral System | dApp earns from gas overestimation |
| Fee Sharing | Protocol captures excess as service fee |
| Gas Arbitrage | Third party profits from estimate vs actual difference |
| Donation | Excess automatically goes to charity address |

**Example:**
```
Reserved (preFund): 1.50 USDC
Gas used: 0.90 USDC
Excess: 0.60 USDC → recipient address (e.g., dApp wallet)
```

---

### Mode 0x03 - ConstantFee + Recipient

**Description:** Combines fixed protocol fee with recipient for excess tokens.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x03
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
constantFee              (16 bytes) ← ADDED
recipient                (20 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: Signature verified
EXECUTION:  UserOp executes
POSTOP:     User pays (actualGasCost + constantFee)
            Excess → recipient
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Protocol + Referral | Fixed fee to protocol, excess to referrer |
| Tiered Revenue | Base fee + variable earnings from excess |

**Example:**
```
Reserved (preFund): 1.50 USDC
Gas used: 0.80 USDC
Constant fee: 0.10 USDC
Total cost: 0.90 USDC
Excess: 0.60 USDC → recipient
```

---

### Mode 0x04 - PreFund

**Description:** Charges tokens upfront during validation, reconciles in postOp.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x04
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
preFundInToken           (16 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: preFundInToken transferred from user → treasury
EXECUTION:  UserOp executes
POSTOP:     Calculate actualCost
            If actualCost > preFund: user pays difference
            If actualCost < preFund: treasury refunds difference to user
```

**Important:** Requires higher `paymasterVerificationGasLimit` (200,000+) due to `safeTransferFrom` during validation.

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Escrow Pattern | Lock tokens upfront, refund unused portion |
| Budget Control | User caps maximum spend with preFund amount |
| Trust Building | Show users exact upfront cost, refund automatically |
| Prepaid Gas | Enterprise accounts pre-fund for batch operations |

**Example:**
```
VALIDATION: User deposits 2.00 USDC → treasury

Case A - Under budget:
  Gas used: 0.80 USDC
  Refund: 1.20 USDC → back to user

Case B - Over budget:
  Gas used: 2.50 USDC
  User pays additional: 0.50 USDC → treasury
```

---

### Mode 0x05 - PreFund + ConstantFee

**Description:** Upfront deposit with fixed protocol fee.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x05
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
preFundInToken           (16 bytes) ← ADDED
constantFee              (16 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: preFundInToken transferred from user → treasury
EXECUTION:  UserOp executes
POSTOP:     totalCost = actualGasCost + constantFee
            Reconcile preFund vs totalCost
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Prepaid + Service Fee | Enterprise deposits + per-tx service charge |
| Subscription + Usage | Fixed subscription fee + variable gas |

**Example:**
```
VALIDATION: User deposits 2.00 USDC → treasury

Gas used: 0.80 USDC
Constant fee: 0.10 USDC
Total cost: 0.90 USDC
Refund: 1.10 USDC → back to user
```

---

### Mode 0x06 - PreFund + Recipient

**Description:** Upfront deposit with excess going to recipient instead of refund.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x06
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
preFundInToken           (16 bytes) ← ADDED
recipient                (20 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: preFundInToken transferred from user → treasury
EXECUTION:  UserOp executes
POSTOP:     If actualCost < preFund:
              Excess → recipient (NOT back to user)
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Referral + Escrow | User deposits upfront, dApp earns excess |
| Protocol Revenue | Protocol captures gas overestimation as revenue |
| Donation Mode | User pre-funds, excess donated to charity |

**Example:**
```
VALIDATION: User deposits 2.00 USDC → treasury

Gas used: 0.80 USDC
Excess: 1.20 USDC → recipient (dApp/protocol wallet)
```

---

### Mode 0x07 - ALL (PreFund + ConstantFee + Recipient)

**Description:** Full feature mode with all three optional fields enabled.

**paymasterData Structure:**
```
MODE_ERC20               (1 byte)
COMBINED_BYTE            (1 byte)  - 0x07
validUntil               (6 bytes)
validAfter               (6 bytes)
token                    (20 bytes)
postOpGas                (16 bytes)
exchangeRate             (32 bytes)
paymasterValidationGasLimit (16 bytes)
treasury                 (20 bytes)
preFundInToken           (16 bytes) ← ADDED
constantFee              (16 bytes) ← ADDED
recipient                (20 bytes) ← ADDED
signature                (65 bytes) + async suffix
```

**Flow:**
```
VALIDATION: preFundInToken transferred from user → treasury
EXECUTION:  UserOp executes
POSTOP:     totalCost = actualGasCost + constantFee
            If preFund > totalCost:
              Excess → recipient
```

**Use Cases:**
| Use Case | Description |
|----------|-------------|
| Full Revenue Model | Protocol charges fee + captures excess |
| Subscription + Tip | Fixed fee = subscription, excess = tip to provider |
| Enterprise Billing | Pre-fund account, fixed service fee, excess to ops wallet |
| Complex dApp Economics | Multiple revenue streams from single transaction |

**Example:**
```
VALIDATION: User deposits 3.00 USDC → treasury

Gas used: 0.80 USDC
Constant fee: 0.10 USDC
Total cost: 0.90 USDC
Excess: 2.10 USDC → recipient
```

---

## Gas Considerations

### Standard Modes (0x00, 0x01, 0x02, 0x03)
- Use `PAYMASTER_VALIDATION_GAS_LIMIT: 100_000n`
- No token transfer during validation

### PreFund Modes (0x04, 0x05, 0x06, 0x07)
- Use `PAYMASTER_VALIDATION_GAS_LIMIT_PREFUND: 200_000n`
- Requires `safeTransferFrom` during validation
- Must override `paymasterVerificationGasLimit: 200_000n` after gas estimation

---

## Order of Optional Fields

When multiple optional fields are present, they MUST appear in this order in the paymasterData:

```
1. preFundInToken   (16 bytes) - if preFundPresent (bit 2)
2. constantFee      (16 bytes) - if constantFeePresent (bit 0)
3. recipient        (20 bytes) - if recipientPresent (bit 1)
```

This order is enforced by the Solidity parsing logic in `_parseErc20Config()`.

---

## Quick Reference

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         ERC20 PAYMASTER MODES                              │
├────────┬───────────────────────────────────────────────────────────────────┤
│  0x00  │ Basic - Simple ERC20 gas payment                                  │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x01  │ ConstantFee - Gas + fixed protocol fee                            │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x02  │ Recipient - Excess tokens go to specified address                 │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x03  │ ConstantFee + Recipient - Fee + excess to recipient               │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x04  │ PreFund - Upfront deposit, reconcile in postOp                    │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x05  │ PreFund + ConstantFee - Deposit + fee                             │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x06  │ PreFund + Recipient - Deposit, excess to recipient                │
├────────┼───────────────────────────────────────────────────────────────────┤
│  0x07  │ ALL - Deposit + fee + excess to recipient                         │
└────────┴───────────────────────────────────────────────────────────────────┘
```
