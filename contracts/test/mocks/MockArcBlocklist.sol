// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockArcBlocklist
/// @notice Mock for Arc's blocklist precompile at 0x1800...0001.
/// @dev The real precompile checks if an address is USDC-blocklisted. In anvil
///      fork mode, the precompile doesn't exist (StackUnderflow). This mock
///      returns true only for the known blocklisted test address, false for
///      all others. See DECISION_LOG D5, D23.
contract MockArcBlocklist {
    address constant BLOCKLISTED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    /// @notice Returns true if the address is blocklisted, false otherwise.
    /// @dev Matches the signature of Arc's isBlocklisted(address).
    function isBlocklisted(address account) external pure returns (bool) {
        return account == BLOCKLISTED;
    }
}
