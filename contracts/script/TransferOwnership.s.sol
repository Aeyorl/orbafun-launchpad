// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Treasury} from "../src/Treasury.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {AMMFactory} from "../src/AMMFactory.sol";
import {LiquidityMigration} from "../src/LiquidityMigration.sol";

/// @notice One-time ownership migration for contracts deployed before multisig
/// ownership became mandatory. Run this only from the current owner wallet.
contract TransferOrbaOwnership is Script {
    function run() external {
        uint256 ownerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address newOwner = vm.envAddress("ADMIN_MULTISIG");
        require(newOwner != address(0), "ADMIN_MULTISIG is required");

        Treasury treasury = Treasury(vm.envAddress("ARC_TREASURY_ADDRESS"));
        AMMFactory ammFactory = AMMFactory(vm.envAddress("ARC_AMM_FACTORY_ADDRESS"));
        TokenFactory factory = TokenFactory(vm.envAddress("ARC_TOKEN_FACTORY_ADDRESS"));
        LiquidityMigration migrator =
            LiquidityMigration(vm.envAddress("ARC_MIGRATOR_ADDRESS"));

        vm.startBroadcast(ownerPrivateKey);
        treasury.transferOwnership(newOwner);
        ammFactory.transferOwnership(newOwner);
        factory.transferOwnership(newOwner);
        migrator.transferOwnership(newOwner);
        vm.stopBroadcast();

        require(treasury.owner() == newOwner, "Treasury ownership transfer failed");
        require(ammFactory.owner() == newOwner, "AMMFactory ownership transfer failed");
        require(factory.owner() == newOwner, "TokenFactory ownership transfer failed");
        require(migrator.owner() == newOwner, "Migrator ownership transfer failed");

        console.log("All Orba privileged ownership transferred to:", newOwner);
    }
}
