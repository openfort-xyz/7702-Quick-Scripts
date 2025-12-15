// SPDX-Lincese-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "lib/forge-std/src/Test.sol";
import {Data} from "test/paymasterV3EPv9/fork/data/Data.t.sol";

contract Constants is Test, Data {
    string internal __FORK_RPC_URL = vm.envString("OP_SEPOLIA_RPC");

    uint256 constant signersLength = 3;

    uint256 internal __OWNER_7702_PRIVATE_KEY = vm.envUint("OWNER_7702_PRIVATE_KEY");
    address  internal __OWNER_7702_ADDRESS = vm.addr(__OWNER_7702_PRIVATE_KEY);

    uint256 internal __PAYMASTER_SIGNER_PRIVATE_KEY = vm.envUint("PAYMASTER_SIGNER_PRIVATE_KEY");
    address internal __PAYMASTER_SIGNER_ADDRESS = vm.addr(__PAYMASTER_SIGNER_PRIVATE_KEY);

    uint256 internal __PAYMASTER_ADMIN_PRIVATE_KEY = vm.envUint("PAYMASTER_ADMIN_PRIVATE_KEY");
    address internal __PAYMASTER_ADMIN_ADDRESS = vm.addr(__PAYMASTER_ADMIN_PRIVATE_KEY);

    address internal constant __ENTRYPOINT_ADDRESS_V9 = 0x433709009B8330FDa32311DF1C2AFA402eD8D009;
    address internal constant __PAYMASTER_V3_EP_V9_ADDRESS = 0xDeAD9fee9D14BDe85D4A52e9D2a85E366d607a97;
    address internal constant __IMPLEMENTATION_ADDRESS_7702 = 0x77020901f40BE88Df754E810dA9868933787652B;
    address internal constant __BUNDLER_ADDRESS = 0x0047E22c52DEEe45ED3ab87D4E27DaD61Db81E78;
}
