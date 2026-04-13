// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ISwapGuard} from "../src/interfaces/ISwapGuard.sol";
import {SwapGuard} from "../src/SwapGuard.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

contract MockTokenWithDecimalsForGuard {
    uint8 public immutable decimals;

    constructor(uint8 tokenDecimals) {
        decimals = tokenDecimals;
    }
}

contract SwapGuardTest is Test {
    SwapGuard internal guard;
    MockPriceOracle internal oracle;
    uint8 internal constant SWAP_TYPE_EXACT_INPUT = 0;
    uint8 internal constant SWAP_TYPE_EXACT_OUTPUT = 1;

    address internal owner = address(this);
    address internal executor = address(0x1001);
    address internal agent = address(0x1002);

    address internal router = address(0x2001);
    address internal tokenIn;
    address internal tokenOut;
    address internal newOwner = address(0x9001);

    function setUp() public {
        guard = new SwapGuard(owner, 1_000 ether, 0, 30 minutes);
        oracle = new MockPriceOracle();
        tokenIn = address(new MockTokenWithDecimalsForGuard(18));
        tokenOut = address(new MockTokenWithDecimalsForGuard(18));

        guard.setAuthorizedExecutor(executor, true);
        guard.setRouterAllowed(router, true);
        guard.setTokenAllowed(tokenIn, true);
        guard.setTokenAllowed(tokenOut, true);
        guard.setMinTradeAmount(tokenIn, 1 ether);
        guard.setMaxDailyVolumeForToken(tokenIn, 1_000 ether);
        guard.setOracleConfig(address(oracle), 5 minutes, 300);

        _setOracleQuote(tokenIn, tokenOut, 1 ether, 500);
        _setOracleQuote(tokenIn, tokenOut, 2 ether, 1_000);
        _setOracleQuote(tokenIn, tokenOut, 5 ether, 2_500);
        _setOracleQuote(address(0), tokenOut, 2 ether, 1_000);
    }

    function test_ValidateAndConsume_UpdatesState() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        uint256 dayKey = block.timestamp / 1 days;
        assertEq(guard.lastExecutionAt(agent), block.timestamp);
        assertEq(guard.dailyVolumeByAgentToken(agent, tokenIn, dayKey), request.amountIn);
    }

    function test_RevertWhen_UnauthorizedExecutor() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        vm.expectRevert(SwapGuard.Unauthorized.selector);
        guard.validateAndConsume(request, agent);
    }

    function test_RevertWhen_GuardPaused() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        guard.setPaused(true);

        vm.expectRevert(SwapGuard.GuardPaused.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_RouterNotAllowed() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(0x9999);

        vm.expectRevert(SwapGuard.RouterNotAllowed.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_TokenNotAllowed() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenOut = address(0x4444);

        vm.expectRevert(SwapGuard.TokenNotAllowed.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_SameToken() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenOut = tokenIn;

        vm.expectRevert(SwapGuard.SameToken.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_DustSwap() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 0.5 ether;

        vm.expectRevert(SwapGuard.DustSwap.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_TradeAmountExceedsPerTradeCap() public {
        guard.setMaxTradeAmountForToken(tokenIn, 1.5 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 2 ether;

        vm.expectRevert(SwapGuard.TradeAmountExceeded.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_InvalidQuote_ExpectedZero() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.expectedAmountOut = 0;

        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_InvalidQuote_MinGreaterThanExpected() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.minAmountOut = request.expectedAmountOut + 1;

        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_SlippageTooHigh() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.expectedAmountOut = 1000;
        request.minAmountOut = 969;

        vm.expectRevert(SwapGuard.SlippageTooHigh.selector);
        guard.checkSwap(request, agent);
    }

    function test_DynamicSlippageBound_AllowsHigherVolatilityWindow() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.expectedAmountOut = 1000;
        request.minAmountOut = 950; // 5% slippage

        vm.expectRevert(SwapGuard.SlippageTooHigh.selector);
        guard.checkSwap(request, agent);

        guard.setMaxSlippageBps(600);
        assertTrue(guard.checkSwap(request, agent));
    }

    function test_RevertWhen_ExpiredDeadline() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.deadline = block.timestamp - 1;

        vm.expectRevert(SwapGuard.ExpiredDeadline.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_DeadlineTooFar() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.deadline = block.timestamp + 31 minutes;

        vm.expectRevert(SwapGuard.DeadlineTooFar.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_CooldownActive() public {
        guard.setCooldownSeconds(1 hours);
        guard.setOracleConfig(address(oracle), 2 hours, 300);
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.deadline = block.timestamp + 25 minutes;

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        vm.warp(block.timestamp + 20 minutes);

        vm.expectRevert(SwapGuard.CooldownActive.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_CooldownActiveOnSameInputTokenAcrossPairs() public {
        guard.setCooldownSeconds(1 hours);
        guard.setOracleConfig(address(oracle), 2 hours, 300);

        ISwapGuard.SwapRequest memory first = _baseRequest();
        vm.prank(executor);
        guard.validateAndConsume(first, agent);

        address altOut = address(new MockTokenWithDecimalsForGuard(18));
        guard.setTokenAllowed(altOut, true);
        _setOracleQuote(tokenIn, altOut, first.amountIn, first.expectedAmountOut);

        ISwapGuard.SwapRequest memory second = _baseRequest();
        second.tokenOut = altOut;

        vm.expectRevert(SwapGuard.CooldownActive.selector);
        guard.checkSwap(second, agent);
    }

    function test_Cooldown_IsPerToken_NotGlobalAcrossDifferentInputTokens() public {
        guard.setCooldownSeconds(1 hours);
        guard.setOracleConfig(address(oracle), 2 hours, 300);

        ISwapGuard.SwapRequest memory first = _baseRequest();
        vm.prank(executor);
        guard.validateAndConsume(first, agent);

        address altIn = address(new MockTokenWithDecimalsForGuard(18));
        guard.setTokenAllowed(altIn, true);
        guard.setMinTradeAmount(altIn, 1 ether);
        guard.setMaxDailyVolumeForToken(altIn, 1_000 ether);

        ISwapGuard.SwapRequest memory second = _baseRequest();
        second.tokenIn = altIn;
        second.amountIn = 2 ether;
        second.expectedAmountOut = 1_000;
        second.minAmountOut = 990;
        _setOracleQuote(altIn, second.tokenOut, second.amountIn, second.expectedAmountOut);

        assertTrue(guard.checkSwap(second, agent));
    }

    function test_RevertWhen_DailyLimitExceeded() public {
        guard.setMaxDailyVolumeForToken(tokenIn, 2 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 2 ether;

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        request.amountIn = 1 ether;
        vm.expectRevert(SwapGuard.DailyLimitExceeded.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_MidnightBoundaryBypassAttempted() public {
        guard.setMaxDailyVolumeForToken(tokenIn, 100 ether);

        uint256 dayEnd = ((block.timestamp / 1 days) * 1 days) + 1 days;
        vm.warp(dayEnd - 1);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 100 ether;
        request.expectedAmountOut = 50_000;
        request.minAmountOut = 49_000;
        request.deadline = block.timestamp + 60;
        _setOracleQuote(tokenIn, tokenOut, request.amountIn, request.expectedAmountOut);

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        vm.warp(dayEnd + 1);
        request.deadline = block.timestamp + 60;

        vm.expectRevert(SwapGuard.DailyLimitExceeded.selector);
        guard.checkSwap(request, agent);
    }

    function test_DailyLimit_IsolatedPerToken() public {
        address tokenAlt = address(0x3003);
        guard.setTokenAllowed(tokenAlt, true);
        guard.setMinTradeAmount(tokenAlt, 1 ether);
        guard.setMaxDailyVolumeForToken(tokenAlt, 10 ether);
        guard.setMaxDailyVolumeForToken(tokenIn, 2 ether);

        ISwapGuard.SwapRequest memory requestTokenIn = _baseRequest();
        requestTokenIn.amountIn = 2 ether;

        vm.prank(executor);
        guard.validateAndConsume(requestTokenIn, agent);

        ISwapGuard.SwapRequest memory requestTokenAlt = _baseRequest();
        requestTokenAlt.tokenIn = tokenAlt;
        requestTokenAlt.amountIn = 5 ether;
        _setOracleQuote(tokenAlt, tokenOut, requestTokenAlt.amountIn, 1_000);

        vm.prank(executor);
        guard.validateAndConsume(requestTokenAlt, agent);
    }

    function test_ExactOutputMode_RequiresEqualOutFields() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = SWAP_TYPE_EXACT_OUTPUT;
        request.expectedAmountIn = 2 ether;
        request.expectedAmountOut = 1000;
        request.minAmountOut = 999;

        vm.expectRevert(SwapGuard.ExactOutputMismatch.selector);
        guard.checkSwap(request, agent);

        request.minAmountOut = 1000;
        assertTrue(guard.checkSwap(request, agent));
    }

    function test_RevertWhen_ExactOutputInputBufferTooHigh() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = SWAP_TYPE_EXACT_OUTPUT;
        request.amountIn = 2 ether;
        request.expectedAmountIn = 1 ether;
        request.expectedAmountOut = 1000;
        request.minAmountOut = 1000;

        _setOracleQuote(tokenIn, tokenOut, request.expectedAmountIn, 1000);

        vm.expectRevert(SwapGuard.ExactOutputInputBufferTooHigh.selector);
        guard.checkSwap(request, agent);
    }

    function test_DynamicExactOutputInputBuffer_AllowsHigherBuffer() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = SWAP_TYPE_EXACT_OUTPUT;
        request.amountIn = 2 ether;
        request.expectedAmountIn = 1 ether;
        request.expectedAmountOut = 1000;
        request.minAmountOut = 1000;

        _setOracleQuote(tokenIn, tokenOut, request.expectedAmountIn, 1000);

        vm.expectRevert(SwapGuard.ExactOutputInputBufferTooHigh.selector);
        guard.checkSwap(request, agent);

        guard.setMaxExactOutputInputBufferBps(10_000);
        assertTrue(guard.checkSwap(request, agent));
    }

    function test_RevertWhen_OracleQuoteTooLowAgainstExpected() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 5 ether;
        request.expectedAmountIn = 0;
        request.expectedAmountOut = 1_000;
        request.minAmountOut = 990;

        _setOracleQuote(tokenIn, tokenOut, request.amountIn, 2_000);

        vm.expectRevert(SwapGuard.OracleDeviationTooHigh.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_OracleStale() public {
        vm.warp(1 hours);
        ISwapGuard.SwapRequest memory request = _baseRequest();
        oracle.setQuote(tokenIn, tokenOut, request.amountIn, 1_000, block.timestamp - 10 minutes);

        vm.expectRevert(SwapGuard.OracleStale.selector);
        guard.checkSwap(request, agent);
    }

    function test_NativeToken_ConfigSupported() public {
        address nativeToken = address(0);
        guard.setTokenAllowed(nativeToken, true);
        guard.setMinTradeAmount(nativeToken, 1 ether);
        guard.setMaxDailyVolumeForToken(nativeToken, 100 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenIn = nativeToken;
        request.amountIn = 2 ether;
        _setOracleQuote(nativeToken, tokenOut, request.amountIn, request.expectedAmountOut);

        assertTrue(guard.checkSwap(request, agent));
    }

    function testFuzz_CheckSwap_SlippageInvariant(uint256 expectedAmountOut, uint16 slippageBps) public {
        expectedAmountOut = bound(expectedAmountOut, 1, type(uint128).max);
        slippageBps = uint16(bound(slippageBps, 0, 10_000));

        uint256 minAmountOut = expectedAmountOut - ((expectedAmountOut * slippageBps) / 10_000);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: router,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: 2 ether,
            expectedAmountIn: 0,
            minAmountOut: minAmountOut,
            expectedAmountOut: expectedAmountOut,
            deadline: block.timestamp + 5 minutes
        });

        _setOracleQuote(tokenIn, tokenOut, request.amountIn, expectedAmountOut);

        uint256 effectiveSlippageBps = ((expectedAmountOut - minAmountOut) * 10_000) / expectedAmountOut;

        if (effectiveSlippageBps > guard.MAX_SLIPPAGE_BPS()) {
            vm.expectRevert(SwapGuard.SlippageTooHigh.selector);
            guard.checkSwap(request, agent);
        } else {
            assertTrue(guard.checkSwap(request, agent));
        }
    }

    function test_AdminOwnershipFlow() public {
        guard.transferOwnership(newOwner);
        assertEq(guard.pendingOwner(), newOwner);

        vm.prank(newOwner);
        guard.acceptOwnership();

        assertEq(guard.owner(), newOwner);
        assertEq(guard.pendingOwner(), address(0));
    }

    function test_RevertWhen_AcceptOwnershipUnauthorized() public {
        guard.transferOwnership(newOwner);

        vm.expectRevert(SwapGuard.Unauthorized.selector);
        guard.acceptOwnership();
    }

    function test_RevertWhen_AdminCallUnauthorized() public {
        vm.prank(agent);
        vm.expectRevert(SwapGuard.Unauthorized.selector);
        guard.setPaused(true);
    }

    function test_RevertWhen_ConstructorOwnerZeroAddress() public {
        vm.expectRevert(SwapGuard.InvalidAddress.selector);
        new SwapGuard(address(0), 1_000 ether, 0, 30 minutes);
    }

    function test_RevertWhen_TransferOwnershipZeroAddress() public {
        vm.expectRevert(SwapGuard.InvalidAddress.selector);
        guard.transferOwnership(address(0));
    }

    function test_RevertWhen_TransferOwnershipUnauthorized() public {
        vm.prank(agent);
        vm.expectRevert(SwapGuard.Unauthorized.selector);
        guard.transferOwnership(newOwner);
    }

    function test_RevertWhen_SetRouterAllowedZeroAddress() public {
        vm.expectRevert(SwapGuard.InvalidAddress.selector);
        guard.setRouterAllowed(address(0), true);
    }

    function test_RevertWhen_SetAuthorizedExecutorZeroAddress() public {
        vm.expectRevert(SwapGuard.InvalidAddress.selector);
        guard.setAuthorizedExecutor(address(0), true);
    }

    function test_RevertWhen_SetOracleConfigInvalid() public {
        vm.expectRevert(SwapGuard.InvalidAddress.selector);
        guard.setOracleConfig(address(0), 5 minutes, 100);

        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.setOracleConfig(address(oracle), 5 minutes, 10_001);
    }

    function test_RevertWhen_SetDynamicBoundsInvalid() public {
        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.setMaxSlippageBps(10_001);

        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.setMaxExactOutputInputBufferBps(10_001);
    }

    function test_RevertWhen_OracleNotConfigured() public {
        SwapGuard freshGuard = new SwapGuard(owner, 1_000 ether, 0, 30 minutes);
        freshGuard.setAuthorizedExecutor(executor, true);
        freshGuard.setRouterAllowed(router, true);
        freshGuard.setTokenAllowed(tokenIn, true);
        freshGuard.setTokenAllowed(tokenOut, true);
        freshGuard.setMinTradeAmount(tokenIn, 1 ether);
        freshGuard.setMaxDailyVolumeForToken(tokenIn, 1_000 ether);

        vm.expectRevert(SwapGuard.OracleNotConfigured.selector);
        freshGuard.checkSwap(_baseRequest(), agent);
    }

    function test_RevertWhen_OracleQuoteInvalid() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        oracle.setQuote(tokenIn, tokenOut, request.amountIn, 0, block.timestamp);

        vm.expectRevert(SwapGuard.OracleQuoteInvalid.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_InvalidSwapType() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = 2;

        vm.expectRevert(SwapGuard.InvalidSwapType.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_ExactOutputInputInvalid() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = SWAP_TYPE_EXACT_OUTPUT;
        request.minAmountOut = 1000;
        request.expectedAmountOut = 1000;
        request.expectedAmountIn = 0;

        vm.expectRevert(SwapGuard.ExactOutputInputInvalid.selector);
        guard.checkSwap(request, agent);

        request.expectedAmountIn = request.amountIn + 1;

        vm.expectRevert(SwapGuard.ExactOutputInputInvalid.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_ExactInputExpectedAmountInMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.expectedAmountIn = request.amountIn + 1;

        vm.expectRevert(SwapGuard.InvalidQuote.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_DailyLimitNotConfigured() public {
        guard.setRequireExplicitTokenLimits(true);
        guard.setMaxDailyVolumeForToken(tokenIn, 0);

        vm.expectRevert(SwapGuard.DailyLimitNotConfigured.selector);
        guard.checkSwap(_baseRequest(), agent);
    }

    function test_UsesDefaultDailyLimitWhenExplicitLimitsDisabled() public {
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(3 ether);
        guard.setMaxDailyVolumeForToken(tokenIn, 0);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.amountIn = 2 ether;

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        request.amountIn = 1 ether;
        assertTrue(guard.checkSwap(request, agent));
    }

    function test_DefaultDailyLimit_ScalesByTokenDecimals() public {
        address usdcLike = address(new MockTokenWithDecimalsForGuard(6));
        guard.setTokenAllowed(usdcLike, true);
        guard.setMinTradeAmount(usdcLike, 1);
        guard.setMaxDailyVolumeForToken(usdcLike, 0);
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(1_000 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenIn = usdcLike;
        request.amountIn = 1_000_000_001; // 1000.000001 USDC in 6 decimals
        request.expectedAmountOut = 1000;
        request.minAmountOut = 990;
        _setOracleQuote(usdcLike, tokenOut, request.amountIn, request.expectedAmountOut);

        vm.expectRevert(SwapGuard.DailyLimitExceeded.selector);
        guard.checkSwap(request, agent);
    }

    function test_DefaultDailyLimit_ScalesUpWhenTokenHasMoreThan18Decimals() public {
        address highDecimalsToken = address(new MockTokenWithDecimalsForGuard(19));
        guard.setTokenAllowed(highDecimalsToken, true);
        guard.setMinTradeAmount(highDecimalsToken, 1);
        guard.setMaxDailyVolumeForToken(highDecimalsToken, 0);
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(1_000 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenIn = highDecimalsToken;
        request.amountIn = 1_000 ether;
        _setOracleQuote(highDecimalsToken, tokenOut, request.amountIn, request.expectedAmountOut);

        assertTrue(guard.checkSwap(request, agent));
    }

    function test_DefaultDailyLimit_UsesNativeTokenDecimalsPath() public {
        address nativeToken = address(0);
        guard.setTokenAllowed(nativeToken, true);
        guard.setMinTradeAmount(nativeToken, 1 ether);
        guard.setMaxDailyVolumeForToken(nativeToken, 0);
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(3 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenIn = nativeToken;
        request.amountIn = 2 ether;
        _setOracleQuote(nativeToken, tokenOut, request.amountIn, request.expectedAmountOut);

        vm.prank(executor);
        guard.validateAndConsume(request, agent);

        request.amountIn = 1 ether;
        _setOracleQuote(nativeToken, tokenOut, request.amountIn, request.expectedAmountOut);
        assertTrue(guard.checkSwap(request, agent));
    }

    function test_RevertWhen_DefaultDailyLimitTokenDecimalsTooHigh() public {
        address hugeDecimalsToken = address(new MockTokenWithDecimalsForGuard(78));
        guard.setTokenAllowed(hugeDecimalsToken, true);
        guard.setMinTradeAmount(hugeDecimalsToken, 1);
        guard.setMaxDailyVolumeForToken(hugeDecimalsToken, 0);
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(1_000 ether);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenIn = hugeDecimalsToken;
        request.amountIn = 2 ether;
        _setOracleQuote(hugeDecimalsToken, tokenOut, request.amountIn, request.expectedAmountOut);

        vm.expectRevert(SwapGuard.InvalidTokenDecimals.selector);
        guard.checkSwap(request, agent);
    }

    function test_RevertWhen_DefaultDailyLimitZeroAndNoTokenLimit() public {
        guard.setRequireExplicitTokenLimits(false);
        guard.setMaxDailyVolume(0);
        guard.setMaxDailyVolumeForToken(tokenIn, 0);

        vm.expectRevert(SwapGuard.DailyLimitNotConfigured.selector);
        guard.checkSwap(_baseRequest(), agent);
    }

    function test_AdminSettersUpdateState() public {
        guard.setPaused(true);
        guard.setRouterAllowed(router, false);
        guard.setTokenAllowed(tokenOut, false);
        guard.setAuthorizedExecutor(executor, false);
        guard.setMinTradeAmount(tokenIn, 2 ether);
        guard.setCooldownSeconds(10);
        guard.setMaxDeadlineDelay(12);
        guard.setMaxDailyVolume(99 ether);
        guard.setMaxDailyVolumeForToken(tokenIn, 98 ether);
        guard.setMaxTradeAmountForToken(tokenIn, 97 ether);
        guard.setMaxSlippageBps(250);
        guard.setMaxExactOutputInputBufferBps(400);
        guard.setRequireExplicitTokenLimits(false);

        assertTrue(guard.paused());
        assertFalse(guard.allowedRouters(router));
        assertFalse(guard.allowedTokens(tokenOut));
        assertFalse(guard.authorizedExecutors(executor));
        assertEq(guard.minTradeAmount(tokenIn), 2 ether);
        assertEq(guard.cooldownSeconds(), 10);
        assertEq(guard.maxDeadlineDelay(), 12);
        assertEq(guard.defaultMaxDailyVolume(), 99 ether);
        assertEq(guard.maxDailyVolumeByToken(tokenIn), 98 ether);
        assertEq(guard.maxTradeAmountByToken(tokenIn), 97 ether);
        assertEq(guard.maxSlippageBps(), 250);
        assertEq(guard.maxExactOutputInputBufferBps(), 400);
        assertFalse(guard.requireExplicitTokenLimits());
    }

    function _baseRequest() internal view returns (ISwapGuard.SwapRequest memory) {
        return ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: router,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: 2 ether,
            expectedAmountIn: 0,
            minAmountOut: 990,
            expectedAmountOut: 1000,
            deadline: block.timestamp + 5 minutes
        });
    }

    function _setOracleQuote(address quoteTokenIn, address quoteTokenOut, uint256 amountIn, uint256 amountOut)
        internal
    {
        oracle.setQuote(quoteTokenIn, quoteTokenOut, amountIn, amountOut, block.timestamp);
    }
}
