// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DeployOrba
/// @notice Deploys all Orba contracts to Arc testnet in the correct order.
/// @dev Deployment order: Treasury → AMMFactory → TokenFactory → LiquidityMigration
///      Then wire: factory.setMigrator(migrator)
///      See DECISION_LOG D20 for economics parameters (compiled into contracts).
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Treasury} from "../src/Treasury.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {AMMFactory} from "../src/AMMFactory.sol";
import {LiquidityMigration} from "../src/LiquidityMigration.sol";

contract DeployOrba is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address adminMultisig = vm.envAddress("ADMIN_MULTISIG");
        require(adminMultisig != address(0), "ADMIN_MULTISIG is required");

        console.log("=== Orba Contract Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Block:", block.number);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Treasury — receives creation fees + protocol fees.
        Treasury treasury = new Treasury();
        console.log("Treasury deployed:", address(treasury));

        // 2. AMMFactory — creates AMM pairs for graduated tokens.
        AMMFactory ammFactory = new AMMFactory();
        console.log("AMMFactory deployed:", address(ammFactory));

        // 3. TokenFactory — creates tokens + bonding curves.
        //    Treasury is the protocol fee recipient.
        TokenFactory factory = new TokenFactory(address(treasury));
        console.log("TokenFactory deployed:", address(factory));

        // 4. LiquidityMigration — handles graduation to AMM.
        LiquidityMigration migrator = new LiquidityMigration(address(factory), address(ammFactory));
        console.log("LiquidityMigration deployed:", address(migrator));

        // 5. Wire migrator into factory (so new curves get the migrator address).
        factory.setMigrator(address(migrator));
        console.log("Migrator wired into factory");

        // 6. Transfer treasury ownership to deployer (for now — multisig later).
        //    Treasury constructor sets msg.sender as owner, which is deployer.
        //    Ownership is transferred below before broadcasting ends.
        treasury.transferOwnership(adminMultisig);
        ammFactory.transferOwnership(adminMultisig);
        factory.transferOwnership(adminMultisig);
        migrator.transferOwnership(adminMultisig);
        console.log("Ownership transferred to multisig:", adminMultisig);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Contract addresses to add to .env:");
        console.log("  ARC_TREASURY_ADDRESS=", address(treasury));
        console.log("  ARC_AMM_FACTORY_ADDRESS=", address(ammFactory));
        console.log("  ARC_TOKEN_FACTORY_ADDRESS=", address(factory));
        console.log("  ARC_MIGRATOR_ADDRESS=", address(migrator));
        console.log("");
        console.log("Verify on explorer: https://testnet.arcscan.app");

        // Log the addresses in a machine-readable format too.
        console.log("");
        console.log("ADDRESSES_JSON:");
        console.log("  treasury:", address(treasury));
        console.log("  ammFactory:", address(ammFactory));
        console.log("  tokenFactory:", address(factory));
        console.log("  migrator:", address(migrator));
    }
}
