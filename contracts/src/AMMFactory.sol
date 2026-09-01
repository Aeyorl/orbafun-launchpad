// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AMMFactory
/// @notice Minimal Uniswap-V2-style factory for creating AMM pairs.
/// @dev Adapted for Arc: no WETH wrapping, pairs use ERC-20 tokens directly.
///      Used as the graduation target for BondingCurve tokens. See DECISION_LOG
///      D6, D7 (own AMM, no WUSDC, use ERC-20 USDC directly).
///      This is a minimal fork — no protocol fee. The pair
///      contract (AMMPair) holds the actual liquidity and swap logic.
import {Ownable} from "solady/auth/Ownable.sol";
import {AMMPair} from "./AMMPair.sol";

contract AMMFactory is Ownable {
    /// @notice Contracts allowed to create canonical Orba pairs.
    /// @dev Restricting pair creation prevents an attacker from initializing a
    ///      launch token's canonical pair before graduation and retaining LP.
    mapping(address => bool) public pairCreators;

    /// @notice Routers allowed to perform swaps on canonical pairs.
    mapping(address => bool) public routers;

    /// @notice All pairs created by this factory.
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);
    event PairCreatorSet(address indexed account, bool allowed);
    event RouterSet(address indexed router, bool allowed);

    error IdenticalAddresses();
    error PairExists();
    error ZeroAddress();
    error UnauthorizedPairCreator();

    constructor() {
        _initializeOwner(msg.sender);
        pairCreators[msg.sender] = true;
    }

    /// @notice Create a new AMM pair for two tokens.
    /// @dev Token order is deterministic (token0 < token1 by address).
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (!pairCreators[msg.sender]) revert UnauthorizedPairCreator();
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

    /// @notice Authorize or revoke a canonical pair creator.
    /// @dev The graduation migrator should be authorized during deployment.
    function setPairCreator(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        pairCreators[account] = allowed;
        emit PairCreatorSet(account, allowed);
    }

    /// @notice Authorize or revoke an atomic swap router.
    function setRouter(address router, bool allowed) external onlyOwner {
        if (router == address(0) || (allowed && router.code.length == 0)) revert ZeroAddress();
        routers[router] = allowed;
        emit RouterSet(router, allowed);
    }

    /// @notice Total pairs created.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
