// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DeployUncappedFactory
/// @notice Deploys only the contracts that must change for uncapped new tokens.
/// @dev Reuses the existing Treasury, AMMFactory, Safe guardian and protocol
///      timelock. Existing tokens and their original factory remain immutable.
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {LiquidityMigration} from "../src/LiquidityMigration.sol";

contract DeployUncappedFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("ARC_TREASURY_ADDRESS");
        address ammFactory = vm.envAddress("ARC_AMM_FACTORY_ADDRESS");
        address adminMultisig = vm.envAddress("ADMIN_MULTISIG");
        address protocolTimelock = vm.envAddress("ARC_TIMELOCK_ADDRESS");

        require(block.chainid == 5_042_002, "This script deploys to Arc testnet only");
        require(treasury.code.length > 0, "ARC_TREASURY_ADDRESS must be a contract");
        require(ammFactory.code.length > 0, "ARC_AMM_FACTORY_ADDRESS must be a contract");
        require(adminMultisig.code.length > 0, "ADMIN_MULTISIG must be a deployed Safe");
        require(protocolTimelock.code.length > 0, "ARC_TIMELOCK_ADDRESS must be a contract");

        vm.startBroadcast(deployerPrivateKey);

        TokenFactory factory = new TokenFactory(treasury);
        LiquidityMigration migrator = new LiquidityMigration(address(factory), ammFactory);

        factory.setMigrator(address(migrator));
        factory.setPauseGuardian(adminMultisig);
        factory.transferOwnership(protocolTimelock);
        migrator.transferOwnership(protocolTimelock);

        vm.stopBroadcast();

        console.log("Uncapped TokenFactory:", address(factory));
        console.log("Factory deployment block:", block.number);
        console.log("Factory-specific LiquidityMigration:", address(migrator));
        console.log("Owner timelock:", protocolTimelock);
        console.log("Pause guardian:", adminMultisig);
        console.log("Add the new factory to TOKEN_FACTORY_ADDRESSES and UNCAPPED_TOKEN_FACTORY_ADDRESSES.");
        console.log("Set ARC_POLLER_REPLAY_FROM_BLOCK to the printed deployment block for the cutover release.");
    }
}
