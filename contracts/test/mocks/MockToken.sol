// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockToken
/// @notice Plain ERC-20 with public mint, for AMM router tests. No cooldown,
///         no max-wallet — those are bonding-curve-phase restrictions on
///         MemeToken, not relevant to AMM (post-graduation) swap testing.
import {ERC20} from "solady/tokens/ERC20.sol";

contract MockToken is ERC20 {
    uint8 private constant DECIMALS = 18;

    function name() public pure override returns (string memory) {
        return "Mock Token";
    }

    function symbol() public pure override returns (string memory) {
        return "MOCK";
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
