// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {SwapGuard} from "../src/SwapGuard.sol";
import {EquiliBotModule} from "../src/EquiliBotModule.sol";
import {ChainlinkPriceOracleAdapter} from "../src/oracles/ChainlinkPriceOracleAdapter.sol";

contract DeployPhase1 is Script {
    struct CoreConfig {
        address owner;
        address safeAddress;
        address agentAddress;
        uint256 maxDailyVolume;
        uint64 cooldownSeconds;
        uint64 maxDeadlineDelay;
        uint64 maxOracleStaleness;
        uint16 maxOracleDeviationBps;
    }

    function run()
        external
        returns (SwapGuard guard, EquiliBotModule module, ChainlinkPriceOracleAdapter oracleAdapter)
    {
        CoreConfig memory cfg = _readCoreConfig();

        vm.startBroadcast();

        address oracleAddress;
        (oracleAddress, oracleAdapter) = _resolveOracle(cfg.owner);

        guard = new SwapGuard(cfg.owner, cfg.maxDailyVolume, cfg.cooldownSeconds, cfg.maxDeadlineDelay);
        module = new EquiliBotModule(cfg.owner, cfg.safeAddress, address(guard), cfg.agentAddress);

        guard.setAuthorizedExecutor(address(module), true);
        module.setStrictTokenIsolation(true);
        guard.setOracleConfig(oracleAddress, cfg.maxOracleStaleness, cfg.maxOracleDeviationBps);
        guard.setRequireExplicitTokenLimits(true);

        _configureRoutersAndSelectors(guard, module);
        _configureTokens(guard);
        _configureProtectedTokens(module);

        vm.stopBroadcast();
    }

    function _readCoreConfig() internal view returns (CoreConfig memory cfg) {
        cfg.owner = vm.envAddress("OWNER_ADDRESS");
        cfg.safeAddress = vm.envAddress("SAFE_ADDRESS");
        cfg.agentAddress = vm.envAddress("AGENT_ADDRESS");
        cfg.maxDailyVolume = vm.envUint("MAX_DAILY_VOLUME");
        cfg.cooldownSeconds = uint64(vm.envUint("COOLDOWN_SECONDS"));
        cfg.maxDeadlineDelay = uint64(vm.envUint("MAX_DEADLINE_DELAY_SECONDS"));
        cfg.maxOracleStaleness = uint64(vm.envUint("MAX_ORACLE_STALENESS_SECONDS"));
        cfg.maxOracleDeviationBps = uint16(vm.envUint("MAX_ORACLE_DEVIATION_BPS"));
    }

    function _resolveOracle(address owner)
        internal
        returns (address oracleAddress, ChainlinkPriceOracleAdapter oracleAdapter)
    {
        bool deployOracleAdapter = vm.envBool("DEPLOY_ORACLE_ADAPTER");
        if (!deployOracleAdapter) {
            return (vm.envAddress("ORACLE_ADDRESS"), oracleAdapter);
        }

        uint8 nativeTokenDecimals = uint8(vm.envUint("NATIVE_TOKEN_DECIMALS"));
        oracleAdapter = new ChainlinkPriceOracleAdapter(owner, nativeTokenDecimals);

        address[] memory feedTokenIns = vm.envAddress("ORACLE_FEED_TOKEN_INS", ",");
        address[] memory feedTokenOuts = vm.envAddress("ORACLE_FEED_TOKEN_OUTS", ",");
        address[] memory feeds = vm.envAddress("ORACLE_FEED_ADDRESSES", ",");
        uint256[] memory feedInverseRaw = vm.envUint("ORACLE_FEED_INVERSE_FLAGS", ",");

        if (
            feedTokenIns.length != feedTokenOuts.length || feedTokenIns.length != feeds.length
                || feedTokenIns.length != feedInverseRaw.length
        ) {
            revert("Oracle feed config mismatch");
        }

        for (uint256 i = 0; i < feedTokenIns.length; i++) {
            oracleAdapter.setFeed(feedTokenIns[i], feedTokenOuts[i], feeds[i], feedInverseRaw[i] == 1);
        }

        return (address(oracleAdapter), oracleAdapter);
    }

    function _configureRoutersAndSelectors(SwapGuard guard, EquiliBotModule module) internal {
        address[] memory routers = vm.envAddress("ALLOWED_ROUTERS", ",");
        uint256[] memory selectorsRaw = vm.envUint("ALLOWED_FUNCTION_SELECTORS", ",");

        for (uint256 i = 0; i < routers.length; i++) {
            guard.setRouterAllowed(routers[i], true);
            for (uint256 j = 0; j < selectorsRaw.length; j++) {
                module.setRouterSelectorAllowed(routers[i], bytes4(uint32(selectorsRaw[j])), true);
            }
        }
    }

    function _configureTokens(SwapGuard guard) internal {
        address[] memory tokens = vm.envAddress("ALLOWED_TOKENS", ",");
        uint256[] memory minTradeAmounts = vm.envUint("MIN_TRADE_AMOUNTS", ",");
        uint256[] memory tokenMaxDailyVolumes = vm.envUint("TOKEN_MAX_DAILY_VOLUMES", ",");

        if (tokens.length != minTradeAmounts.length || tokens.length != tokenMaxDailyVolumes.length) {
            revert("Config length mismatch");
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            guard.setTokenAllowed(tokens[i], true);
            guard.setMinTradeAmount(tokens[i], minTradeAmounts[i]);
            guard.setMaxDailyVolumeForToken(tokens[i], tokenMaxDailyVolumes[i]);
        }
    }

    function _configureProtectedTokens(EquiliBotModule module) internal {
        address[] memory tokens = vm.envAddress("ALLOWED_TOKENS", ",");
        for (uint256 i = 0; i < tokens.length; i++) {
            module.setProtectedToken(tokens[i], true);
        }
    }
}
