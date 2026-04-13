// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";
import {IERC20MetadataMinimal} from "../interfaces/IERC20MetadataMinimal.sol";

contract ChainlinkPriceOracleAdapter is IPriceOracle {
    struct FeedConfig {
        address feed;
        bool inverse;
    }

    address public owner;
    address public pendingOwner;
    uint8 public immutable nativeTokenDecimals;

    mapping(bytes32 => FeedConfig) public feedByPair;

    error Unauthorized();
    error InvalidAddress();
    error InvalidAnswer();
    error FeedNotConfigured();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event FeedConfigured(address indexed tokenIn, address indexed tokenOut, address indexed feed, bool inverse);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address initialOwner, uint8 nativeDecimals) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
        nativeTokenDecimals = nativeDecimals;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function setFeed(address tokenIn, address tokenOut, address feed, bool inverse) external onlyOwner {
        if (feed == address(0)) revert InvalidAddress();
        feedByPair[_pairKey(tokenIn, tokenOut)] = FeedConfig({feed: feed, inverse: inverse});
        emit FeedConfigured(tokenIn, tokenOut, feed, inverse);
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, uint256 updatedAt)
    {
        FeedConfig memory config = feedByPair[_pairKey(tokenIn, tokenOut)];
        if (config.feed == address(0)) revert FeedNotConfigured();

        (, int256 answer,, uint256 answeredAt,) = IAggregatorV3(config.feed).latestRoundData();
        if (answer <= 0) revert InvalidAnswer();

        uint8 feedDecimals = IAggregatorV3(config.feed).decimals();
        uint8 inDecimals = _decimalsOf(tokenIn);
        uint8 outDecimals = _decimalsOf(tokenOut);

        uint256 positiveAnswer = uint256(answer);
        uint256 normalized;

        if (!config.inverse) {
            normalized = (amountIn * positiveAnswer) / (10 ** feedDecimals);
        } else {
            normalized = (amountIn * (10 ** feedDecimals)) / positiveAnswer;
        }

        if (outDecimals >= inDecimals) {
            amountOut = normalized * (10 ** (outDecimals - inDecimals));
        } else {
            amountOut = normalized / (10 ** (inDecimals - outDecimals));
        }

        updatedAt = answeredAt;
    }

    function _pairKey(address tokenIn, address tokenOut) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut));
    }

    function _decimalsOf(address token) internal view returns (uint8) {
        if (token == address(0)) {
            return nativeTokenDecimals;
        }
        return IERC20MetadataMinimal(token).decimals();
    }
}
