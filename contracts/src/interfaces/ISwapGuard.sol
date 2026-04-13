// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISwapGuard {
    // swapType: 0 = exact input, 1 = exact output
    struct SwapRequest {
        uint8 swapType;
        address router;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 expectedAmountIn;
        uint256 minAmountOut;
        uint256 expectedAmountOut;
        uint256 deadline;
    }

    function validateAndConsume(SwapRequest calldata request, address agent) external;

    function checkSwap(SwapRequest calldata request, address agent) external view returns (bool);
}
