// SPDX-License-Identifier: MIT

pragma solidity 0.8.29;

import {console2 as console} from "lib/forge-std/src/console2.sol";
import {DeployAndEtch} from "test/paymasterV3EPv9/fork/DeployAndEtch.t.sol";
import {PackedUserOperation} from "lib/account-abstraction-v9/contracts/interfaces/PackedUserOperation.sol";
import {UserOperationLib as UserOperationLibV9} from "lib/account-abstraction-v9/contracts/core/UserOperationLib.sol";

struct Call {
    address target;
    uint256 value;
    bytes data;
}

contract AsyncSignature is DeployAndEtch {
    bytes32 internal constant mode_1 = bytes32(uint256(0x01000000000000000000) << (22 * 8));

    function test_AsyncSiganture_VERIFYING_MODE_Deployed() external {
        Call[] memory calls = new Call[](1);
        calls[0] = Call({target: address(0xbAbE), value: 0, data: hex""});
        bytes memory executionData = abi.encode(calls);
        bytes memory callData =abi.encodeWithSelector(bytes4(keccak256("execute(bytes32,bytes)")), mode_1, executionData);

        PackedUserOperation memory userOp = _getFreshUserOp(__OWNER_7702_ADDRESS);

        userOp = _populateUserOp(
            userOp, callData, _packAccountGasLimits(400_000, 600_000), 800_000, _packGasFees(15 gwei, 80 gwei), hex""
        );

        uint128 verificationGasLimit = uint128(uint256(bytes32(userOp.accountGasLimits)) >> 128);
        _validWindow();

        userOp.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postGas,
            (VERIFYING_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH,
            validUntil,
            validAfter,
            UserOperationLibV9.PAYMASTER_SIG_MAGIC
        );

        bytes32 userOpHash = _getUserOpHash(userOp);

        bytes memory signature = _signUserOp(userOpHash, __OWNER_7702_PRIVATE_KEY);
        userOp.signature = _encodeEOASignature(signature);

        userOp.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postGas,
            (VERIFYING_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH,
            validUntil,
            validAfter,
            uint16(0),
            UserOperationLibV9.PAYMASTER_SIG_MAGIC
        );
        bytes memory paymasterSignature = this._signPaymasterData(VERIFYING_MODE, userOp, 0);

        userOp.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postGas,
            (VERIFYING_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH,
            validUntil,
            validAfter,
            paymasterSignature,
            uint16(paymasterSignature.length),
            UserOperationLibV9.PAYMASTER_SIG_MAGIC
        );

        console.log("\n=== PackedUserOperation ===");
        console.log("sender:              ", userOp.sender);
        console.log("nonce:               ", userOp.nonce);
        console.log("initCode:            ", vm.toString(userOp.initCode));
        console.log("callData:            ", vm.toString(userOp.callData));
        console.log("accountGasLimits:    ", vm.toString(userOp.accountGasLimits));
        console.log("preVerificationGas:  ", userOp.preVerificationGas);
        console.log("gasFees:             ", vm.toString(userOp.gasFees));
        console.log("paymasterAndData:    ", vm.toString(userOp.paymasterAndData));
        console.log("signature:           ", vm.toString(userOp.signature));
        console.log("===========================\n");

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        _etch7702();

        vm.prank(__BUNDLER_ADDRESS, __BUNDLER_ADDRESS);
        entryPoint.handleOps(ops, payable(__BUNDLER_ADDRESS));
    }

    function test_AsyncSiganture_ERC20_MODE_combinedByteBasic_Deployed() external {
        _mintAndApprove(__OWNER_7702_ADDRESS, 30 ether);

        Call[] memory calls = new Call[](1);
        calls[0] = Call({target: address(0xbAbE), value: 0, data: hex""});
        bytes memory executionData = abi.encode(calls);
        bytes memory callData =abi.encodeWithSelector(bytes4(keccak256("execute(bytes32,bytes)")), mode_1, executionData);

        PackedUserOperation memory userOp = _getFreshUserOp(__OWNER_7702_ADDRESS);
        userOp = _populateUserOp(
            userOp, callData, _packAccountGasLimits(400_000, 600_000), 800_000, _packGasFees(15 gwei, 80 gwei), hex""
        );

        uint128 verificationGasLimit = uint128(uint256(bytes32(userOp.accountGasLimits)) >> 128);
        _validWindow();

        bytes memory dummySignature = new bytes(65);
        userOp.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postGas,
            (ERC20_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH,
            uint8(combinedByteBasic),
            validUntil,
            validAfter,
            address(mockERC20),
            postGas,
            exchangeRate,
            paymasterValidationGasLimit,
            treasury,
            dummySignature,
            uint16(65),
            UserOperationLibV9.PAYMASTER_SIG_MAGIC
        );

        bytes32 userOpHash = _getUserOpHash(userOp);

        bytes memory signature = _signUserOp(userOpHash, __OWNER_7702_PRIVATE_KEY);
        userOp.signature = _encodeEOASignature(signature);

        bytes memory paymasterSignature = this._signPaymasterData(ERC20_MODE, userOp, 1);

        userOp.paymasterAndData = abi.encodePacked(
            address(paymaster),
            verificationGasLimit,
            postGas,
            (ERC20_MODE << 1) | MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH,
            uint8(combinedByteBasic),
            validUntil,
            validAfter,
            address(mockERC20),
            postGas,
            exchangeRate,
            paymasterValidationGasLimit,
            treasury,
            paymasterSignature,
            uint16(paymasterSignature.length),
            UserOperationLibV9.PAYMASTER_SIG_MAGIC
        );

        console.log("\n=== PackedUserOperation (ERC20 Mode) ===");
        console.log("sender:              ", userOp.sender);
        console.log("nonce:               ", userOp.nonce);
        console.log("initCode:            ", vm.toString(userOp.initCode));
        console.log("callData:            ", vm.toString(userOp.callData));
        console.log("accountGasLimits:    ", vm.toString(userOp.accountGasLimits));
        console.log("preVerificationGas:  ", userOp.preVerificationGas);
        console.log("gasFees:             ", vm.toString(userOp.gasFees));
        console.log("paymasterAndData:    ", vm.toString(userOp.paymasterAndData));
        console.log("signature:           ", vm.toString(userOp.signature));
        console.log("===========================\n");

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        _etch7702();

        vm.prank(__BUNDLER_ADDRESS, __BUNDLER_ADDRESS);
        entryPoint.handleOps(ops, payable(__BUNDLER_ADDRESS));
    }

    function test_SyncSiganture_VERIFYING_MODE_Deployed() external {
        Call[] memory calls = new Call[](1);
        calls[0] = Call({target: address(0xbAbE), value: 0, data: hex""});
        bytes memory executionData = abi.encode(calls);
        bytes memory callData =abi.encodeWithSelector(bytes4(keccak256("execute(bytes32,bytes)")), mode_1, executionData);

        PackedUserOperation memory userOp = _getFreshUserOp(__OWNER_7702_ADDRESS);

        userOp = _populateUserOp(
            userOp, callData, _packAccountGasLimits(400_000, 600_000), 800_000, _packGasFees(15 gwei, 80 gwei), hex""
        );

        userOp.paymasterAndData = _createPaymasterDataMode(userOp, VERIFYING_MODE, 0);

        bytes memory paymasterSignature = this._signPaymasterData(VERIFYING_MODE, userOp, 0);

        userOp.paymasterAndData = abi.encodePacked(userOp.paymasterAndData, paymasterSignature);

        bytes32 userOpHash = _getUserOpHash(userOp);

        bytes memory signature = _signUserOp(userOpHash, __OWNER_7702_PRIVATE_KEY);
        userOp.signature = _encodeEOASignature(signature);

        console.log("\n=== PackedUserOperation ===");
        console.log("sender:              ", userOp.sender);
        console.log("nonce:               ", userOp.nonce);
        console.log("initCode:            ", vm.toString(userOp.initCode));
        console.log("callData:            ", vm.toString(userOp.callData));
        console.log("accountGasLimits:    ", vm.toString(userOp.accountGasLimits));
        console.log("preVerificationGas:  ", userOp.preVerificationGas);
        console.log("gasFees:             ", vm.toString(userOp.gasFees));
        console.log("paymasterAndData:    ", vm.toString(userOp.paymasterAndData));
        console.log("signature:           ", vm.toString(userOp.signature));
        console.log("===========================\n");

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        _etch7702();

        vm.prank(__BUNDLER_ADDRESS, __BUNDLER_ADDRESS);
        entryPoint.handleOps(ops, payable(__BUNDLER_ADDRESS));
    }

    function test_SyncSiganture_ERC20_MODE_combinedByteBasic_Deployed() external {
        _mintAndApprove(__OWNER_7702_ADDRESS, 30 ether);

        Call[] memory calls = new Call[](1);
        calls[0] = Call({target: address(0xbAbE), value: 0, data: hex""});
        bytes memory executionData = abi.encode(calls);
        bytes memory callData =abi.encodeWithSelector(bytes4(keccak256("execute(bytes32,bytes)")), mode_1, executionData);

        PackedUserOperation memory userOp = _getFreshUserOp(__OWNER_7702_ADDRESS);

        userOp = _populateUserOp(
            userOp, callData, _packAccountGasLimits(400_000, 600_000), 800_000, _packGasFees(15 gwei, 80 gwei), hex""
        );

        userOp.paymasterAndData = _createPaymasterDataMode(userOp, ERC20_MODE, combinedByteBasic);

        bytes memory paymasterSignature = this._signPaymasterData(ERC20_MODE, userOp, 1);

        userOp.paymasterAndData = abi.encodePacked(userOp.paymasterAndData, paymasterSignature);

        bytes32 userOpHash = _getUserOpHash(userOp);

        bytes memory signature = _signUserOp(userOpHash, __OWNER_7702_PRIVATE_KEY);
        userOp.signature = _encodeEOASignature(signature);

        console.log("\n=== PackedUserOperation (ERC20 Mode) ===");
        console.log("sender:              ", userOp.sender);
        console.log("nonce:               ", userOp.nonce);
        console.log("initCode:            ", vm.toString(userOp.initCode));
        console.log("callData:            ", vm.toString(userOp.callData));
        console.log("accountGasLimits:    ", vm.toString(userOp.accountGasLimits));
        console.log("preVerificationGas:  ", userOp.preVerificationGas);
        console.log("gasFees:             ", vm.toString(userOp.gasFees));
        console.log("paymasterAndData:    ", vm.toString(userOp.paymasterAndData));
        console.log("signature:           ", vm.toString(userOp.signature));
        console.log("===========================\n");

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        _etch7702();

        vm.prank(__BUNDLER_ADDRESS, __BUNDLER_ADDRESS);
        entryPoint.handleOps(ops, payable(__BUNDLER_ADDRESS));
    }
}
