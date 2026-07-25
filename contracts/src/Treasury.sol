// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Treasury
/// @notice Minimal fee collection point for the protocol.
/// @dev Receives creation fees (from TokenFactory) and protocol fees
///      (from BondingCurve.claimProtocolFees() — owner calls it, USDC goes
///      here). v1: just a USDC holder with owner-only withdraw. No claim/
///      distribute logic for features that don't exist yet (referrals, creator
///      rewards) — see DECISION_LOG D19, plan revision (Treasury.claim removed).
import {Ownable} from "solady/auth/Ownable.sol";
import {SafeUSDC} from "./SafeUSDC.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract Treasury is Ownable {
    /// @notice USDC contract address on Arc (6-dec ERC-20).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Emitted when USDC is withdrawn.
    event Withdrawn(address indexed to, uint256 amount);

    error TransferFailed();

    constructor() {
        _initializeOwner(msg.sender);
    }

    /// @notice Withdraw USDC to a recipient. Only owner.
    /// @param to Recipient address
    /// @param amount USDC amount (6-dec)
    function withdraw(address to, uint256 amount) external onlyOwner {
        if (!SafeUSDC.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice Withdraw any ERC-20 token (in case someone sends non-USDC).
    /// @dev Uses a low-level call to handle non-standard ERC-20s (like Arc USDC
    ///      whose transferFrom returns void). For USDC, prefer withdraw() which
    ///      uses SafeUSDC.
    /// @param token Token address
    /// @param to Recipient address
    /// @param amount Token amount
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice USDC balance of this treasury.
    function usdcBalance() external view returns (uint256) {
        return IERC20Minimal(USDC).balanceOf(address(this));
    }
}
