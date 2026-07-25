// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title SafeUSDC
/// @notice Safe transfer helpers for Arc's USDC, which has non-standard return
///         values: `transfer` returns `bool`, but `transferFrom` returns void
///         (no return data, just reverts on failure). This is the same behavior
///         as the original Ethereum USDC.
/// @dev Usage: `SafeUSDC.transfer(USDC, to, amount)` instead of
///      `IERC20(USDC).transfer(to, amount)`. Handles both standard (returns
///      bool) and non-standard (returns void) ERC-20s. See DECISION_LOG D23.
library SafeUSDC {
    address constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Safe transfer: succeeds if call succeeds AND (no return data OR
    ///         return data decodes to true).
    function transfer(address to, uint256 amount) internal returns (bool ok) {
        (bool success, bytes memory data) = USDC.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        ok = success && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @notice Safe transferFrom: same pattern as transfer.
    function transferFrom(address from, address to, uint256 amount) internal returns (bool ok) {
        (bool success, bytes memory data) = USDC.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        ok = success && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @notice Safe approve.
    function approve(address spender, uint256 amount) internal returns (bool ok) {
        (bool success, bytes memory data) = USDC.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        ok = success && (data.length == 0 || abi.decode(data, (bool)));
    }
}
