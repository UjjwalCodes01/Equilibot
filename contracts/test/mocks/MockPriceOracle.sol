// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";

contract MockPriceOracle is IPriceOracle {
    struct Quote {
        uint256 amountOut;
        uint256 updatedAt;
    }

    mapping(bytes32 => Quote) internal quotes;

    function setQuote(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 updatedAt)
        external
    {
        quotes[_key(tokenIn, tokenOut, amountIn)] = Quote({amountOut: amountOut, updatedAt: updatedAt});
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, uint256 updatedAt)
    {
        Quote memory quote = quotes[_key(tokenIn, tokenOut, amountIn)];
        return (quote.amountOut, quote.updatedAt);
    }

    function _key(address tokenIn, address tokenOut, uint256 amountIn) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut, amountIn));
    }
}
