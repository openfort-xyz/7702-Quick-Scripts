// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IKey} from "src/7702AccV1/interfaces/IKey.sol";
import {OPFMain as OPF7702} from "src/7702AccV1/core/OPFMain.sol";
import {MockERC20} from "test/paymasterV3EPv9/mocks/MockERC20.sol";
import {OPFPaymasterV3} from "src/PaymasterV3EPv9Async/OPFPaymasterV3.sol";
import {EntryPoint} from "lib/account-abstraction-v9/contracts/core/EntryPoint.sol";

abstract contract Data is IKey {
    MockERC20 mockERC20;
    OPF7702 internal opf7702;
    OPF7702 internal account7702;
    EntryPoint internal entryPoint;
    OPFPaymasterV3 internal paymaster;
}
