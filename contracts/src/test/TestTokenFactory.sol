// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestTokenFactory
/// @notice Copy of TokenFactory that deploys TestBondingCurve (low graduation
///         threshold) instead of BondingCurve. Used for budget-constrained
///         graduation testing on testnet. The ONLY change from TokenFactory.sol
///         is the BondingCurve import → TestBondingCurve.
import {Ownable} from "solady/auth/Ownable.sol";
import {MemeToken} from "../MemeToken.sol";
import {TestBondingCurve} from "./TestBondingCurve.sol";

contract TestTokenFactory is Ownable {
    /// @notice Creation fee in USDC (6-dec). [CONFIRM] — doc suggested 5 USDC.
    /// @dev Set to 5 USDC for v1. Adjustable by owner. Charged on createToken().
    uint256 public creationFee = 5 * 10 ** 6;

    /// @notice Protocol treasury address (receives creation fees + protocol fees).
    address public treasury;

    /// @notice USDC contract address on Arc (6-dec ERC-20).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice LiquidityMigration contract address (set by owner, applied to new curves).
    address public migrator;

    /// @notice Whether the factory is paused (no new token launches).
    bool public paused;

    struct LaunchToken {
        address token;
        address curve;
        address creator;
        string name;
        string symbol;
        string image; // IPFS URI
        uint256 createdAt;
        bool graduated;
    }

    /// @notice All launched tokens, indexed by address.
    mapping(address => LaunchToken) public tokens;
    /// @notice All token addresses (for enumeration).
    address[] public allTokens;
    /// @notice Token addresses by creator (for getCreatorTokens pagination).
    mapping(address => address[]) public creatorTokens;

    /// @notice Emitted when a token is launched.
    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol,
        string image,
        uint256 createdAt
    );
    /// @notice Emitted when a token graduates.
    event TokenGraduated(address indexed token, address indexed ammPair);
    /// @notice Emitted when creation fee is updated.
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    /// @notice Emitted when factory is paused/unpaused.
    event PauseStateChanged(bool paused);

    error FactoryPaused();
    error NotPaused();
    error OnlyCurve();
    error OnlyToken();
    error TokenNotFound();
    error TransferFailed();
    error NameTooShort();
    error NameTooLong();
    error SymbolTooShort();
    error SymbolTooLong();

    constructor(address treasury_) {
        _initializeOwner(msg.sender);
        treasury = treasury_;
    }

    /// @notice Launch a new token. Deploys token + bonding curve atomically.
    /// @param name Token name (e.g. "Arc Doge")
    /// @param symbol Token symbol (e.g. "ADOGE")
    /// @param imageURI IPFS URI for token logo
    /// @param description Token description (stored off-chain by indexer)
    /// @return tokenAddress Address of the deployed MemeToken
    /// @return curveAddress Address of the deployed BondingCurve
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description // stored off-chain by indexer, not on-chain (gas)
    ) external returns (address tokenAddress, address curveAddress) {
        if (paused) revert FactoryPaused();

        // Validate name and symbol lengths (on-chain enforcement — can't be
        // bypassed by calling the contract directly without the frontend).
        if (bytes(name).length == 0 || bytes(name).length > 50) {
            if (bytes(name).length == 0) revert NameTooShort();
            revert NameTooLong();
        }
        if (bytes(symbol).length == 0 || bytes(symbol).length > 10) {
            if (bytes(symbol).length == 0) revert SymbolTooShort();
            revert SymbolTooLong();
        }

        // Deploy bonding curve first (token needs curve address in constructor).
        TestBondingCurve curve = new TestBondingCurve(address(0), msg.sender, treasury);
        // Deploy token with curve address.
        MemeToken token = new MemeToken(name, symbol, msg.sender, address(curve));
        // Wire the token address into the curve (was address(0) at construction).
        curve.setToken(address(token));
        // Wire the migrator into the curve (if set).
        if (migrator != address(0)) {
            curve.setMigrator(migrator);
        }

        tokenAddress = address(token);
        curveAddress = address(curve);

        // Register the token.
        tokens[tokenAddress] = LaunchToken({
            token: tokenAddress,
            curve: curveAddress,
            creator: msg.sender,
            name: name,
            symbol: symbol,
            image: imageURI,
            createdAt: block.timestamp,
            graduated: false
        });
        allTokens.push(tokenAddress);
        creatorTokens[msg.sender].push(tokenAddress);

        // Charge creation fee (USDC transferFrom to treasury).
        if (creationFee > 0) {
            (bool ok, bytes memory data) = USDC.call(
                abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, treasury, creationFee)
            );
            if (!ok || data.length > 0 && !abi.decode(data, (bool))) revert TransferFailed();
        }

        emit TokenCreated(tokenAddress, curveAddress, msg.sender, name, symbol, imageURI, block.timestamp);
    }

    /// @notice Marks a token as graduated. Only callable by the token's curve.
    /// @dev Called by LiquidityMigration via the curve's graduateToAmm().
    function markGraduated(address tokenAddress, address ammPair) external {
        LaunchToken storage lt = tokens[tokenAddress];
        if (lt.curve == address(0)) revert TokenNotFound();
        if (msg.sender != lt.curve) revert OnlyCurve();
        lt.graduated = true;
        emit TokenGraduated(tokenAddress, ammPair);
    }

    // ─── Views ──────────────────────────────────────────────────────────────
    /// @notice Get token info by address.
    function getToken(address tokenAddress) external view returns (LaunchToken memory) {
        return tokens[tokenAddress];
    }

    /// @notice Get creator's tokens (paginated — see DECISION_LOG plan revision).
    /// @param creator Creator address
    /// @param offset Starting index
    /// @param limit Max tokens to return
    function getCreatorTokens(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        address[] storage all = creatorTokens[creator];
        uint256 total = all.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = all[i];
        }
        return result;
    }

    /// @notice Total number of tokens launched.
    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    // ─── Admin ──────────────────────────────────────────────────────────────
    /// @notice Set the creation fee (USDC, 6-dec).
    function setCreationFee(uint256 newFee) external onlyOwner {
        emit CreationFeeUpdated(creationFee, newFee);
        creationFee = newFee;
    }

    /// @notice Set the treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }

    /// @notice Set the LiquidityMigration contract address.
    /// @dev Applied to all new curves created after this call. Existing curves
    ///      need manual setMigrator() calls (or were set at creation).
    function setMigrator(address newMigrator) external onlyOwner {
        migrator = newMigrator;
    }

    /// @notice Pause new token launches (existing tokens keep trading).
    function pause() external onlyOwner {
        paused = true;
        emit PauseStateChanged(true);
    }

    /// @notice Unpause the factory.
    function unpause() external onlyOwner {
        paused = false;
        emit PauseStateChanged(false);
    }
}
