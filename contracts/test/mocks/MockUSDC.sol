// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockUSDC
/// @notice Test-only USDC mock with 6 decimals (matches Arc's ERC-20 USDC).
/// @dev For forge tests only. Tier 2 integration tests use this mock at the
///      real USDC address (0x3600...) via vm.etch, because the real Arc USDC
///      uses system precompiles that don't exist in anvil fork mode.
///      Includes optional blocklist simulation (blockAddress/unblockAddress)
///      to test contract revert behavior when USDC transfers are blocked.
///      See DECISION_LOG D2, D23.
import {ERC20} from "solady/tokens/ERC20.sol";

contract MockUSDC is ERC20 {
    uint8 private constant DECIMALS = 6;

    /// @notice Blocklisted addresses (simulates Arc's runtime blocklist).
    mapping(address => bool) public isBlocked;

    function name() public pure override returns (string memory) {
        return "USD Coin";
    }

    function symbol() public pure override returns (string memory) {
        return "USDC";
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint tokens to an address (test only — real USDC has no public mint).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Burn tokens from an address.
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    /// @notice Block an address (simulates Arc blocklist).
    function blockAddress(address account) external {
        isBlocked[account] = true;
    }

    /// @notice Unblock an address.
    function unblockAddress(address account) external {
        isBlocked[account] = false;
    }

    /// @dev Override transfer to check blocklist.
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (isBlocked[msg.sender] || isBlocked[to]) {
            revert("MockUSDC: blocklisted");
        }
        return super.transfer(to, amount);
    }

    /// @dev Override transferFrom to check blocklist.
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (isBlocked[from] || isBlocked[to]) {
            revert("MockUSDC: blocklisted");
        }
        return super.transferFrom(from, to, amount);
    }
}
