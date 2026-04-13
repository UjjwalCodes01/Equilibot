// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChainlinkPriceOracleAdapter} from "../src/oracles/ChainlinkPriceOracleAdapter.sol";

contract MockAggregatorV3 {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 feedDecimals) {
        decimals = feedDecimals;
    }

    function setRoundData(int256 newAnswer, uint256 newUpdatedAt) external {
        answer = newAnswer;
        updatedAt = newUpdatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 ans, uint256 startedAt, uint256 updated, uint80 answeredInRound)
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract MockTokenWithDecimals {
    uint8 public immutable decimals;

    constructor(uint8 tokenDecimals) {
        decimals = tokenDecimals;
    }
}

contract ChainlinkPriceOracleAdapterTest is Test {
    ChainlinkPriceOracleAdapter internal adapter;
    MockAggregatorV3 internal feed;
    MockTokenWithDecimals internal tokenIn;
    MockTokenWithDecimals internal tokenOut;
    MockTokenWithDecimals internal tokenSix;
    MockTokenWithDecimals internal tokenEighteen;

    function setUp() public {
        adapter = new ChainlinkPriceOracleAdapter(address(this), 18);
        feed = new MockAggregatorV3(8);
        tokenIn = new MockTokenWithDecimals(18);
        tokenOut = new MockTokenWithDecimals(6);
        tokenSix = new MockTokenWithDecimals(6);
        tokenEighteen = new MockTokenWithDecimals(18);
    }

    function test_GetQuote_NonInverse() public {
        // price = 2 tokenOut per tokenIn (scaled by 1e8)
        feed.setRoundData(200_000_000, block.timestamp);
        adapter.setFeed(address(tokenIn), address(tokenOut), address(feed), false);

        (uint256 amountOut, uint256 updatedAt) = adapter.getQuote(address(tokenIn), address(tokenOut), 1 ether);

        assertEq(amountOut, 2_000_000);
        assertEq(updatedAt, block.timestamp);
    }

    function test_GetQuote_Inverse() public {
        // feed gives tokenIn per tokenOut = 0.5 (scaled by 1e8), inverse => output should be 2 tokenOut per tokenIn
        feed.setRoundData(50_000_000, block.timestamp);
        adapter.setFeed(address(tokenIn), address(tokenOut), address(feed), true);

        (uint256 amountOut,) = adapter.getQuote(address(tokenIn), address(tokenOut), 1 ether);

        assertEq(amountOut, 2_000_000);
    }

    function test_RevertWhen_FeedMissing() public {
        vm.expectRevert(ChainlinkPriceOracleAdapter.FeedNotConfigured.selector);
        adapter.getQuote(address(tokenIn), address(tokenOut), 1 ether);
    }

    function test_RevertWhen_InvalidAnswer() public {
        feed.setRoundData(0, block.timestamp);
        adapter.setFeed(address(tokenIn), address(tokenOut), address(feed), false);

        vm.expectRevert(ChainlinkPriceOracleAdapter.InvalidAnswer.selector);
        adapter.getQuote(address(tokenIn), address(tokenOut), 1 ether);
    }

    function test_OwnershipTransferFlow() public {
        address newOwner = address(0xBEEF);
        adapter.transferOwnership(newOwner);
        assertEq(adapter.pendingOwner(), newOwner);

        vm.prank(newOwner);
        adapter.acceptOwnership();

        assertEq(adapter.owner(), newOwner);
        assertEq(adapter.pendingOwner(), address(0));
    }

    function test_RevertWhen_UnauthorizedAdminAction() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(ChainlinkPriceOracleAdapter.Unauthorized.selector);
        adapter.setFeed(address(tokenIn), address(tokenOut), address(feed), false);
    }

    function test_RevertWhen_TransferOwnershipInvalidAddress() public {
        vm.expectRevert(ChainlinkPriceOracleAdapter.InvalidAddress.selector);
        adapter.transferOwnership(address(0));
    }

    function test_RevertWhen_AcceptOwnershipUnauthorized() public {
        adapter.transferOwnership(address(0xABCD));

        vm.expectRevert(ChainlinkPriceOracleAdapter.Unauthorized.selector);
        adapter.acceptOwnership();
    }

    function test_RevertWhen_SetFeedZeroAddress() public {
        vm.expectRevert(ChainlinkPriceOracleAdapter.InvalidAddress.selector);
        adapter.setFeed(address(tokenIn), address(tokenOut), address(0), false);
    }

    function test_GetQuote_WithNativeTokenInputDecimalsPath() public {
        // 2 quote token per native token with 1e8 feed decimals.
        feed.setRoundData(200_000_000, block.timestamp);
        adapter.setFeed(address(0), address(tokenOut), address(feed), false);

        (uint256 amountOut,) = adapter.getQuote(address(0), address(tokenOut), 1 ether);
        assertEq(amountOut, 2_000_000);
    }

    function test_GetQuote_WhenOutputHasMoreDecimalsThanInput() public {
        // 2 quote token per input token with 1e8 feed decimals.
        feed.setRoundData(200_000_000, block.timestamp);
        adapter.setFeed(address(tokenSix), address(tokenEighteen), address(feed), false);

        (uint256 amountOut,) = adapter.getQuote(address(tokenSix), address(tokenEighteen), 1_000_000);
        assertEq(amountOut, 2 ether);
    }

    function test_RevertWhen_ConstructorOwnerInvalidAddress() public {
        vm.expectRevert(ChainlinkPriceOracleAdapter.InvalidAddress.selector);
        new ChainlinkPriceOracleAdapter(address(0), 18);
    }
}
