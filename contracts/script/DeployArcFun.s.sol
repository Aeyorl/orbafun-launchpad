// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DeployOrba
/// @notice Deploys all Orba contracts to Arc testnet in the correct order.
/// @dev Deploys a Safe-administered timelock, protocol contracts and the AMM router,
///      then wires the migrator/guardian and transfers privileged ownership to the timelock.
///      See DECISION_LOG D20 for economics parameters (compiled into contracts).
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Treasury} from "../src/Treasury.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {AMMFactory} from "../src/AMMFactory.sol";
import {LiquidityMigration} from "../src/LiquidityMigration.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";
import {AMMRouter} from "../src/AMMRouter.sol";

contract DeployOrba is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address adminMultisig = vm.envAddress("ADMIN_MULTISIG");
        uint64 timelockDelay = uint64(vm.envOr("TIMELOCK_DELAY_SECONDS", uint256(48 hours)));
        require(block.chainid == 5_042_002, "This script deploys to Arc testnet only");
        require(
            adminMultisig != address(0) && adminMultisig.code.length > 0,
            "ADMIN_MULTISIG must be a deployed Safe"
        );

        console.log("=== Orba Contract Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Block:", block.number);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        ProtocolTimelock timelock = new ProtocolTimelock(adminMultisig, timelockDelay);
        console.log("ProtocolTimelock deployed:", address(timelock));

        // 1. Treasury — receives creation fees + protocol fees.
        Treasury treasury = new Treasury();
        console.log("Treasury deployed:", address(treasury));

        // 2. AMMFactory — creates AMM pairs for graduated tokens.
        AMMFactory ammFactory = new AMMFactory();
        console.log("AMMFactory deployed:", address(ammFactory));

        AMMRouter ammRouter = new AMMRouter(address(ammFactory));
        console.log("AMMRouter deployed:", address(ammRouter));

        // 3. TokenFactory — creates tokens + bonding curves.
        //    Treasury is the protocol fee recipient.
        TokenFactory factory = new TokenFactory(address(treasury));
        console.log("TokenFactory deployed:", address(factory));

        // 4. LiquidityMigration — handles graduation to AMM.
        LiquidityMigration migrator = new LiquidityMigration(address(factory), address(ammFactory));
        console.log("LiquidityMigration deployed:", address(migrator));

        // 5. Wire migrator into factory (so new curves get the migrator address).
        ammFactory.setPairCreator(address(migrator), true);
        ammFactory.setPairCreator(deployer, false);
        factory.setMigrator(address(migrator));
        factory.setPauseGuardian(adminMultisig);
        console.log("Migrator wired into factory");

        // 6. Transfer every privileged contract to the protocol timelock.
        treasury.transferOwnership(address(timelock));
        ammFactory.transferOwnership(address(timelock));
        factory.transferOwnership(address(timelock));
        migrator.transferOwnership(address(timelock));
        console.log("Ownership transferred to timelock:", address(timelock));
        console.log("Emergency pause guardian:", adminMultisig);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Contract addresses to add to .env:");
        console.log("  ARC_TREASURY_ADDRESS=", address(treasury));
        console.log("  ARC_AMM_FACTORY_ADDRESS=", address(ammFactory));
        console.log("  ARC_TOKEN_FACTORY_ADDRESS=", address(factory));
        console.log("  ARC_MIGRATOR_ADDRESS=", address(migrator));
        console.log("  ARC_AMM_ROUTER_ADDRESS=", address(ammRouter));
        console.log("  ARC_TIMELOCK_ADDRESS=", address(timelock));
        console.log("");
        console.log("Verify on explorer: https://testnet.arcscan.app");

        // Log the addresses in a machine-readable format too.
        console.log("");
        console.log("ADDRESSES_JSON:");
        console.log("  treasury:", address(treasury));
        console.log("  ammFactory:", address(ammFactory));
        console.log("  tokenFactory:", address(factory));
        console.log("  migrator:", address(migrator));
        console.log("  ammRouter:", address(ammRouter));
        console.log("  timelock:", address(timelock));
    }
}
