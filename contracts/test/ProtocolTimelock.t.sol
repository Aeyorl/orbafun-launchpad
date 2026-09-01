// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {Treasury} from "../src/Treasury.sol";

contract TimelockTarget {
    uint256 public value;

    function setValue(uint256 newValue) external payable {
        value = newValue;
    }
}

contract PauseGuardianMock {
    function pause(TokenFactory factory) external {
        factory.pause();
    }
}

contract ProtocolTimelockTest is Test {
    ProtocolTimelock timelock;
    TimelockTarget target;
    PauseGuardianMock guardian;
    Treasury treasury;
    TokenFactory factory;

    uint64 constant DELAY = 48 hours;
    bytes32 constant SALT = keccak256("orba-test-operation");

    function setUp() public {
        timelock = new ProtocolTimelock(address(this), DELAY);
        target = new TimelockTarget();
        guardian = new PauseGuardianMock();
        treasury = new Treasury();
        factory = new TokenFactory(address(treasury));
        factory.setPauseGuardian(address(guardian));
        factory.transferOwnership(address(timelock));
    }

    function test_QueuedOperationCannotExecuteEarly() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (42));
        timelock.queue(address(target), 0, data, SALT);

        vm.expectRevert(ProtocolTimelock.OperationNotReady.selector);
        timelock.execute(address(target), 0, data, SALT);

        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(target), 0, data, SALT);
        assertEq(target.value(), 42);
    }

    function test_OnlyAdminCanQueueOrCancel() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (7));
        vm.prank(address(0xBEEF));
        vm.expectRevert(ProtocolTimelock.Unauthorized.selector);
        timelock.queue(address(target), 0, data, SALT);

        bytes32 operationId = timelock.queue(address(target), 0, data, SALT);
        vm.prank(address(0xBEEF));
        vm.expectRevert(ProtocolTimelock.Unauthorized.selector);
        timelock.cancel(operationId);
    }

    function test_CancelledOperationCannotExecute() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (9));
        bytes32 operationId = timelock.queue(address(target), 0, data, SALT);
        timelock.cancel(operationId);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(ProtocolTimelock.OperationNotQueued.selector);
        timelock.execute(address(target), 0, data, SALT);
    }

    function test_ExpiredOperationCannotExecuteAndCanBeCleanedUp() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (11));
        bytes32 operationId = timelock.queue(address(target), 0, data, SALT);
        vm.warp(block.timestamp + DELAY + timelock.GRACE_PERIOD() + 1);

        vm.expectRevert(ProtocolTimelock.OperationExpiredError.selector);
        timelock.execute(address(target), 0, data, SALT);

        vm.prank(address(0xBEEF));
        timelock.expire(operationId);
        assertEq(timelock.readyAt(operationId), 0);
    }

    function test_OperationCannotBeExpiredDuringGracePeriod() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (12));
        bytes32 operationId = timelock.queue(address(target), 0, data, SALT);
        vm.warp(block.timestamp + DELAY + timelock.GRACE_PERIOD());
        vm.expectRevert(ProtocolTimelock.OperationNotReady.selector);
        timelock.expire(operationId);
    }

    function test_AdminAndDelayChangesMustUseTimelock() public {
        vm.expectRevert(ProtocolTimelock.Unauthorized.selector);
        timelock.updateDelay(72 hours);

        bytes memory data = abi.encodeCall(ProtocolTimelock.updateDelay, (uint64(72 hours)));
        timelock.queue(address(timelock), 0, data, SALT);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(timelock), 0, data, SALT);
        assertEq(timelock.delay(), 72 hours);
    }

    function test_GuardianCanPauseButCannotUnpauseOrConfigure() public {
        guardian.pause(factory);
        assertTrue(factory.paused());

        vm.prank(address(guardian));
        vm.expectRevert();
        factory.unpause();

        vm.prank(address(guardian));
        vm.expectRevert();
        factory.setCreationFee(1);
    }

    function test_TimelockCanUnpauseFactoryAfterDelay() public {
        guardian.pause(factory);
        bytes memory data = abi.encodeCall(TokenFactory.unpause, ());
        timelock.queue(address(factory), 0, data, SALT);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(factory), 0, data, SALT);
        assertFalse(factory.paused());
    }

    function test_InvalidDelayAndAdminRejected() public {
        vm.expectRevert(ProtocolTimelock.InvalidDelay.selector);
        new ProtocolTimelock(address(this), 1 hours);
        vm.expectRevert(ProtocolTimelock.InvalidAddress.selector);
        new ProtocolTimelock(address(0xBEEF), DELAY);
    }
}
