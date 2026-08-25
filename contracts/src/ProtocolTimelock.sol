// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ProtocolTimelock
/// @notice Delays privileged protocol actions queued by the Orba admin Safe.
contract ProtocolTimelock {
    uint64 public constant MIN_DELAY = 24 hours;
    uint64 public constant MAX_DELAY = 30 days;

    address public admin;
    uint64 public delay;
    mapping(bytes32 => uint64) public readyAt;
    bool private executing;

    event OperationQueued(
        bytes32 indexed operationId,
        address indexed target,
        uint256 value,
        bytes data,
        bytes32 salt,
        uint64 readyAt
    );
    event OperationCancelled(bytes32 indexed operationId);
    event OperationExecuted(bytes32 indexed operationId, address indexed target, uint256 value);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event DelayUpdated(uint64 oldDelay, uint64 newDelay);

    error Unauthorized();
    error InvalidAddress();
    error InvalidDelay();
    error OperationAlreadyQueued();
    error OperationNotQueued();
    error OperationNotReady();
    error CallFailed(bytes reason);
    error ReentrantExecution();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    constructor(address admin_, uint64 delay_) {
        if (admin_ == address(0) || admin_.code.length == 0) revert InvalidAddress();
        if (delay_ < MIN_DELAY || delay_ > MAX_DELAY) revert InvalidDelay();
        admin = admin_;
        delay = delay_;
        emit AdminUpdated(address(0), admin_);
        emit DelayUpdated(0, delay_);
    }

    receive() external payable {}

    function hashOperation(address target, uint256 value, bytes calldata data, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), target, value, data, salt));
    }

    function queue(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        onlyAdmin
        returns (bytes32 operationId)
    {
        if (target == address(0) || target.code.length == 0) revert InvalidAddress();
        operationId = hashOperation(target, value, data, salt);
        if (readyAt[operationId] != 0) revert OperationAlreadyQueued();
        uint64 eta = uint64(block.timestamp) + delay;
        readyAt[operationId] = eta;
        emit OperationQueued(operationId, target, value, data, salt, eta);
    }

    function cancel(bytes32 operationId) external onlyAdmin {
        if (readyAt[operationId] == 0) revert OperationNotQueued();
        delete readyAt[operationId];
        emit OperationCancelled(operationId);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        payable
        returns (bytes memory result)
    {
        if (executing) revert ReentrantExecution();
        bytes32 operationId = hashOperation(target, value, data, salt);
        uint64 eta = readyAt[operationId];
        if (eta == 0) revert OperationNotQueued();
        // Validator timestamp tolerance is negligible relative to the 24-hour minimum delay.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < eta) revert OperationNotReady();
        delete readyAt[operationId];
        executing = true;
        (bool ok, bytes memory response) = target.call{value: value}(data);
        executing = false;
        if (!ok) revert CallFailed(response);
        emit OperationExecuted(operationId, target, value);
        return response;
    }

    function updateAdmin(address newAdmin) external onlySelf {
        if (newAdmin == address(0) || newAdmin.code.length == 0) revert InvalidAddress();
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    function updateDelay(uint64 newDelay) external onlySelf {
        if (newDelay < MIN_DELAY || newDelay > MAX_DELAY) revert InvalidDelay();
        emit DelayUpdated(delay, newDelay);
        delay = newDelay;
    }
}
