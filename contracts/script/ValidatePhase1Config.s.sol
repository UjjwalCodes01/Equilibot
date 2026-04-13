// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {SwapGuard} from "../src/SwapGuard.sol";
import {EquiliBotModule} from "../src/EquiliBotModule.sol";

interface ISafeModuleStatus {
    function isModuleEnabled(address module) external view returns (bool);
}

interface IOracleFeedRegistry {
    function feedByPair(bytes32 key) external view returns (address feed, bool inverse);
}

contract ValidatePhase1Config is Script {
    function run() external view {
        SwapGuard guard = SwapGuard(vm.envAddress("GUARD_ADDRESS"));
        EquiliBotModule module = EquiliBotModule(vm.envAddress("MODULE_ADDRESS"));
        ISafeModuleStatus safe = ISafeModuleStatus(vm.envAddress("SAFE_ADDRESS"));

        address[] memory routers = vm.envAddress("ALLOWED_ROUTERS", ",");
        uint256[] memory selectorsRaw = vm.envUint("ALLOWED_FUNCTION_SELECTORS", ",");
        address[] memory tokens = vm.envAddress("ALLOWED_TOKENS", ",");
        uint256[] memory minTradeAmounts = vm.envUint("MIN_TRADE_AMOUNTS", ",");
        uint256[] memory tokenMaxDailyVolumes = vm.envUint("TOKEN_MAX_DAILY_VOLUMES", ",");
        address[] memory feedTokenIns = vm.envAddress("ORACLE_FEED_TOKEN_INS", ",");
        address[] memory feedTokenOuts = vm.envAddress("ORACLE_FEED_TOKEN_OUTS", ",");
        address[] memory feedAddresses = vm.envAddress("ORACLE_FEED_ADDRESSES", ",");
        uint256[] memory feedInverseFlags = vm.envUint("ORACLE_FEED_INVERSE_FLAGS", ",");

        require(address(guard.oracle()) != address(0), "Oracle not configured");
        require(guard.requireExplicitTokenLimits(), "Explicit token limit mode disabled");
        require(module.strictTokenIsolation(), "Strict token isolation disabled");
        require(safe.isModuleEnabled(address(module)), "Module not enabled in Safe");

        require(tokens.length == minTradeAmounts.length, "Min trade config mismatch");
        require(tokens.length == tokenMaxDailyVolumes.length, "Daily volume config mismatch");
        require(feedTokenIns.length != 0, "Oracle feed config missing");
        require(feedTokenIns.length == feedTokenOuts.length, "Oracle feed token mismatch");
        require(feedTokenIns.length == feedAddresses.length, "Oracle feed address mismatch");
        require(feedTokenIns.length == feedInverseFlags.length, "Oracle feed inverse mismatch");

        IOracleFeedRegistry feedRegistry = IOracleFeedRegistry(address(guard.oracle()));
        for (uint256 i = 0; i < feedTokenIns.length; i++) {
            bytes32 pairKey = keccak256(abi.encode(feedTokenIns[i], feedTokenOuts[i]));
            (address configuredFeed, bool configuredInverse) = feedRegistry.feedByPair(pairKey);
            require(configuredFeed == feedAddresses[i], "Oracle feed not configured for pair");
            require(configuredInverse == (feedInverseFlags[i] == 1), "Oracle inverse flag mismatch");
        }

        for (uint256 i = 0; i < routers.length; i++) {
            require(guard.allowedRouters(routers[i]), "Router not allowlisted");
            for (uint256 j = 0; j < selectorsRaw.length; j++) {
                require(
                    module.allowedRouterSelectors(routers[i], bytes4(uint32(selectorsRaw[j]))),
                    "Selector not allowlisted"
                );
            }
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            require(guard.allowedTokens(tokens[i]), "Token not allowlisted");
            require(guard.minTradeAmount(tokens[i]) == minTradeAmounts[i], "Min trade amount mismatch");
            require(guard.maxDailyVolumeByToken(tokens[i]) == tokenMaxDailyVolumes[i], "Token daily limit mismatch");
            require(module.protectedTokens(tokens[i]), "Token not protected in module");
        }
    }
}
