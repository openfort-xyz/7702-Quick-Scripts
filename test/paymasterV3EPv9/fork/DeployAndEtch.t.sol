// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {OPFMain as OPF7702} from "src/7702AccV1/core/OPFMain.sol";
import {MockERC20} from "test/paymasterV3EPv9/mocks/MockERC20.sol";
import {OPFPaymasterV3} from "src/PaymasterV3EPv9Async/OPFPaymasterV3.sol";
import {EntryPoint} from "lib/account-abstraction-v9/contracts/core/EntryPoint.sol";
import {PaymasterHelper} from "test/paymasterV3EPv9/fork/helpers/PaymasterHelper.t.sol";

contract DeployAndEtch is PaymasterHelper {
    uint256 private forkId;

    function setUp() public {
        forkId = vm.createSelectFork(__FORK_RPC_URL);
        vm.selectFork(forkId);

        // Attach to the live contracts on the OP Sepolia fork.
        opf7702 = OPF7702(payable(__IMPLEMENTATION_ADDRESS_7702));
        entryPoint = EntryPoint(payable(__ENTRYPOINT_ADDRESS_V9));
        paymaster = OPFPaymasterV3(payable(__PAYMASTER_V3_EP_V9_ADDRESS));
        mockERC20 = new MockERC20();

        // Label the addresses for easier debugging.
        vm.label(__IMPLEMENTATION_ADDRESS_7702, "OP_Sepolia_OPFMain_7702");
        vm.label(__ENTRYPOINT_ADDRESS_V9, "OP_Sepolia_EntryPoint_V9");
        vm.label(__PAYMASTER_V3_EP_V9_ADDRESS, "OP_Sepolia_PaymasterV3");

        _etch7702();
        deal(__PAYMASTER_ADMIN_ADDRESS, 20 ether);
        deal(__OWNER_7702_ADDRESS, 0.01 ether);
        _depositToEP();
        treasury = __PAYMASTER_ADMIN_ADDRESS;
    }

    function test_UsesLiveContractsOnFork() public view {
        assertGt(address(entryPoint).code.length, 0, "entry point code missing on fork");
        assertGt(address(paymaster).code.length, 0, "paymaster code missing on fork");

        // Sanity-check that we are reading the deployed state, not a freshly deployed instance.
        assertTrue(paymaster.OWNER() == address(0xA84E4F9D72cb37A8276090D3FC50895BD8E5Aaf1), "owner not set on forked paymaster");
        assertTrue(paymaster.MANAGER() == address(0xd0c4637b0Fac10cba161907D9b6A1135241DeC91), "manager not set on forked paymaster");

        assertGt(address(opf7702).code.length, 0, "7702 account code missing on fork");
        assertTrue(address(account7702.entryPoint()) == address(__ENTRYPOINT_ADDRESS_V9), "entry point mismatch on forked 7702 account");
    }

    function _etch7702() internal {
        vm.etch(__OWNER_7702_ADDRESS, abi.encodePacked(bytes3(0xef0100), address(__IMPLEMENTATION_ADDRESS_7702)));
        account7702 = OPF7702(payable(__OWNER_7702_ADDRESS));
    }

    function _mintAndApprove(address _owner, uint256 _value) internal {
        vm.startPrank(_owner);
        mockERC20.mint(_owner, _value);
        mockERC20.approve(address(paymaster), type(uint256).max);
        vm.stopPrank();
    }
}
