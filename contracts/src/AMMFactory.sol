// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AMMFactory
/// @notice Minimal Uniswap-V2-style factory for creating AMM pairs.
/// @dev Adapted for Arc: no WETH wrapping, pairs use ERC-20 tokens directly.
///      Used as the graduation target for BondingCurve tokens. See DECISION_LOG
///      D6, D7 (own AMM, no WUSDC, use ERC-20 USDC directly).
///      This is a minimal fork — no fee-on-switch, no protocol fee. The pair
///      contract (AMMPair) holds the actual liquidity and swap logic.
import {Ownable} from "solady/auth/Ownable.sol";
import {AMMPair} from "./AMMPair.sol";

contract AMMFactory is Ownable {
    /// @notice Fee setter (v1: no swap fee on the AMM itself — fees are captured
    ///         on the bonding curve only. This is reserved for future use.)
    address public feeSetter;

    /// @notice All pairs created by this factory.
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

    error IdenticalAddresses();
    error PairExists();
    error ZeroAddress();

    constructor() {
        _initializeOwner(msg.sender);
        feeSetter = msg.sender;
    }

    /// @notice Create a new AMM pair for two tokens.
    /// @dev Token order is deterministic (token0 < token1 by address).
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        // Deploy pair with this factory as the deployer.
        AMMPair newPair = new AMMPair(token0, token1);
        pair = address(newPair);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /// @notice Total pairs created.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
