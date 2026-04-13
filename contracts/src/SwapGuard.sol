// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapGuard} from "./interfaces/ISwapGuard.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IERC20MetadataMinimal} from "./interfaces/IERC20MetadataMinimal.sol";

contract SwapGuard is ISwapGuard {
    uint16 public constant MAX_SLIPPAGE_BPS = 300;
    uint16 public constant MAX_EXACT_OUTPUT_INPUT_BUFFER_BPS = 300;
    uint16 public constant MAX_BPS = 10_000;
    uint8 public constant NATIVE_TOKEN_DECIMALS = 18;
    uint8 public constant SWAP_TYPE_EXACT_INPUT = 0;
    uint8 public constant SWAP_TYPE_EXACT_OUTPUT = 1;

    address public owner;
    address public pendingOwner;
    bool public paused;

    uint256 public defaultMaxDailyVolume;
    uint64 public cooldownSeconds;
    uint64 public maxDeadlineDelay;
    uint64 public maxOracleStaleness;
    uint16 public maxOracleDeviationBps;
    uint16 public maxSlippageBps;
    uint16 public maxExactOutputInputBufferBps;
    bool public requireExplicitTokenLimits;
    IPriceOracle public oracle;

    mapping(address => bool) public allowedRouters;
    mapping(address => bool) public allowedTokens;
    mapping(address => bool) public authorizedExecutors;
    mapping(address => uint256) public minTradeAmount;
    mapping(address => uint256) public maxDailyVolumeByToken;
    mapping(address => uint256) public maxTradeAmountByToken;

    mapping(address => uint256) public lastExecutionAt;
    mapping(address => mapping(address => uint256)) public lastExecutionAtByToken;
    mapping(address => mapping(bytes32 => uint256)) public lastExecutionAtByPair;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public dailyVolumeByAgentToken;

    error Unauthorized();
    error InvalidAddress();
    error GuardPaused();
    error RouterNotAllowed();
    error TokenNotAllowed();
    error SameToken();
    error DustSwap();
    error InvalidQuote();
    error InvalidSwapType();
    error ExactOutputMismatch();
    error SlippageTooHigh();
    error OracleNotConfigured();
    error OracleStale();
    error OracleQuoteInvalid();
    error OracleDeviationTooHigh();
    error ExactOutputInputInvalid();
    error ExactOutputInputBufferTooHigh();
    error ExpiredDeadline();
    error DeadlineTooFar();
    error CooldownActive();
    error DailyLimitExceeded();
    error DailyLimitNotConfigured();
    error TradeAmountExceeded();
    error InvalidTokenDecimals();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PauseUpdated(bool paused);
    event RouterAllowlistUpdated(address indexed router, bool allowed);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event ExecutorUpdated(address indexed executor, bool allowed);
    event MinTradeAmountUpdated(address indexed token, uint256 amount);
    event CooldownUpdated(uint64 cooldownSeconds);
    event MaxDeadlineDelayUpdated(uint64 maxDeadlineDelay);
    event DefaultMaxDailyVolumeUpdated(uint256 maxDailyVolume);
    event MaxDailyVolumeByTokenUpdated(address indexed token, uint256 maxDailyVolume);
    event MaxTradeAmountByTokenUpdated(address indexed token, uint256 maxTradeAmount);
    event OracleConfigUpdated(address indexed oracle, uint64 maxOracleStaleness, uint16 maxOracleDeviationBps);
    event MaxSlippageBpsUpdated(uint16 maxSlippageBps);
    event MaxExactOutputInputBufferBpsUpdated(uint16 maxExactOutputInputBufferBps);
    event RequireExplicitTokenLimitsUpdated(bool requireExplicitTokenLimits);
    event SwapConsumed(
        address indexed agent,
        address indexed router,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expectedAmountOut
    );

    modifier onlyAuthorizedExecutor() {
        if (!authorizedExecutors[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(
        address initialOwner,
        uint256 initialMaxDailyVolume,
        uint64 initialCooldownSeconds,
        uint64 initialMaxDeadlineDelay
    ) {
        if (initialOwner == address(0)) revert InvalidAddress();

        owner = initialOwner;
        defaultMaxDailyVolume = initialMaxDailyVolume;
        cooldownSeconds = initialCooldownSeconds;
        maxDeadlineDelay = initialMaxDeadlineDelay;
        maxOracleStaleness = 5 minutes;
        maxOracleDeviationBps = 300;
        maxSlippageBps = MAX_SLIPPAGE_BPS;
        maxExactOutputInputBufferBps = MAX_EXACT_OUTPUT_INPUT_BUFFER_BPS;
        requireExplicitTokenLimits = true;

        emit OwnershipTransferred(address(0), initialOwner);
        emit DefaultMaxDailyVolumeUpdated(initialMaxDailyVolume);
        emit CooldownUpdated(initialCooldownSeconds);
        emit MaxDeadlineDelayUpdated(initialMaxDeadlineDelay);
        emit OracleConfigUpdated(address(0), maxOracleStaleness, maxOracleDeviationBps);
        emit MaxSlippageBpsUpdated(MAX_SLIPPAGE_BPS);
        emit MaxExactOutputInputBufferBpsUpdated(MAX_EXACT_OUTPUT_INPUT_BUFFER_BPS);
        emit RequireExplicitTokenLimitsUpdated(true);
    }

    function transferOwnership(address newOwner) external {
        _requireOwner();
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

    function setPaused(bool isPaused) external {
        _requireOwner();
        paused = isPaused;
        emit PauseUpdated(isPaused);
    }

    function setRouterAllowed(address router, bool allowed) external {
        _requireOwner();
        if (router == address(0)) revert InvalidAddress();
        allowedRouters[router] = allowed;
        emit RouterAllowlistUpdated(router, allowed);
    }

    function setTokenAllowed(address token, bool allowed) external {
        _requireOwner();
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    function setAuthorizedExecutor(address executor, bool allowed) external {
        _requireOwner();
        if (executor == address(0)) revert InvalidAddress();
        authorizedExecutors[executor] = allowed;
        emit ExecutorUpdated(executor, allowed);
    }

    function setMinTradeAmount(address token, uint256 amount) external {
        _requireOwner();
        minTradeAmount[token] = amount;
        emit MinTradeAmountUpdated(token, amount);
    }

    function setCooldownSeconds(uint64 newCooldownSeconds) external {
        _requireOwner();
        cooldownSeconds = newCooldownSeconds;
        emit CooldownUpdated(newCooldownSeconds);
    }

    function setMaxDeadlineDelay(uint64 newMaxDeadlineDelay) external {
        _requireOwner();
        maxDeadlineDelay = newMaxDeadlineDelay;
        emit MaxDeadlineDelayUpdated(newMaxDeadlineDelay);
    }

    function setMaxDailyVolume(uint256 newMaxDailyVolume) external {
        _requireOwner();
        defaultMaxDailyVolume = newMaxDailyVolume;
        emit DefaultMaxDailyVolumeUpdated(newMaxDailyVolume);
    }

    function setMaxDailyVolumeForToken(address token, uint256 newMaxDailyVolume) external {
        _requireOwner();
        maxDailyVolumeByToken[token] = newMaxDailyVolume;
        emit MaxDailyVolumeByTokenUpdated(token, newMaxDailyVolume);
    }

    function setMaxTradeAmountForToken(address token, uint256 newMaxTradeAmount) external {
        _requireOwner();
        maxTradeAmountByToken[token] = newMaxTradeAmount;
        emit MaxTradeAmountByTokenUpdated(token, newMaxTradeAmount);
    }

    function setMaxSlippageBps(uint16 newMaxSlippageBps) external {
        _requireOwner();
        if (newMaxSlippageBps > MAX_BPS) revert InvalidQuote();
        maxSlippageBps = newMaxSlippageBps;
        emit MaxSlippageBpsUpdated(newMaxSlippageBps);
    }

    function setMaxExactOutputInputBufferBps(uint16 newMaxExactOutputInputBufferBps) external {
        _requireOwner();
        if (newMaxExactOutputInputBufferBps > MAX_BPS) revert InvalidQuote();
        maxExactOutputInputBufferBps = newMaxExactOutputInputBufferBps;
        emit MaxExactOutputInputBufferBpsUpdated(newMaxExactOutputInputBufferBps);
    }

    function setRequireExplicitTokenLimits(bool shouldRequire) external {
        _requireOwner();
        requireExplicitTokenLimits = shouldRequire;
        emit RequireExplicitTokenLimitsUpdated(shouldRequire);
    }

    function setOracleConfig(address oracleAddress, uint64 newMaxOracleStaleness, uint16 newMaxOracleDeviationBps)
        external
    {
        _requireOwner();
        if (oracleAddress == address(0)) revert InvalidAddress();
        if (newMaxOracleDeviationBps > 10_000) revert InvalidQuote();
        oracle = IPriceOracle(oracleAddress);
        maxOracleStaleness = newMaxOracleStaleness;
        maxOracleDeviationBps = newMaxOracleDeviationBps;
        emit OracleConfigUpdated(oracleAddress, newMaxOracleStaleness, newMaxOracleDeviationBps);
    }

    function _requireOwner() internal view {
        if (msg.sender != owner) revert Unauthorized();
    }

    function validateAndConsume(SwapRequest calldata request, address agent) external onlyAuthorizedExecutor {
        _validate(request, agent);

        uint256 dayKey = block.timestamp / 1 days;
        dailyVolumeByAgentToken[agent][request.tokenIn][dayKey] =
            dailyVolumeByAgentToken[agent][request.tokenIn][dayKey] + request.amountIn;
        lastExecutionAt[agent] = block.timestamp;
        lastExecutionAtByToken[agent][request.tokenIn] = block.timestamp;
        lastExecutionAtByPair[agent][_pairKey(request.tokenIn, request.tokenOut)] = block.timestamp;

        emit SwapConsumed(
            agent,
            request.router,
            request.tokenIn,
            request.tokenOut,
            request.amountIn,
            request.minAmountOut,
            request.expectedAmountOut
        );
    }

    function checkSwap(SwapRequest calldata request, address agent) external view returns (bool) {
        _validate(request, agent);
        return true;
    }

    function _validate(SwapRequest calldata request, address agent) internal view {
        if (paused) revert GuardPaused();

        if (!allowedRouters[request.router]) revert RouterNotAllowed();
        if (!allowedTokens[request.tokenIn] || !allowedTokens[request.tokenOut]) revert TokenNotAllowed();
        if (request.tokenIn == request.tokenOut) revert SameToken();

        if (request.amountIn < minTradeAmount[request.tokenIn]) revert DustSwap();
        uint256 maxTradeAmount = maxTradeAmountByToken[request.tokenIn];
        if (maxTradeAmount != 0 && request.amountIn > maxTradeAmount) revert TradeAmountExceeded();

        if (request.swapType > SWAP_TYPE_EXACT_OUTPUT) revert InvalidSwapType();

        if (request.swapType == SWAP_TYPE_EXACT_INPUT) {
            if (request.expectedAmountOut == 0 || request.minAmountOut > request.expectedAmountOut) {
                revert InvalidQuote();
            }
            if (request.expectedAmountIn != 0 && request.expectedAmountIn != request.amountIn) {
                revert InvalidQuote();
            }

            uint256 slippageBps =
                ((request.expectedAmountOut - request.minAmountOut) * 10_000) / request.expectedAmountOut;
            if (slippageBps > maxSlippageBps) revert SlippageTooHigh();
        } else {
            if (request.expectedAmountOut == 0 || request.minAmountOut != request.expectedAmountOut) {
                revert ExactOutputMismatch();
            }
            if (request.expectedAmountIn == 0 || request.expectedAmountIn > request.amountIn) {
                revert ExactOutputInputInvalid();
            }

            uint256 inputBufferBps = ((request.amountIn - request.expectedAmountIn) * 10_000) / request.expectedAmountIn;
            if (inputBufferBps > maxExactOutputInputBufferBps) {
                revert ExactOutputInputBufferTooHigh();
            }
        }

        _validateAgainstOracle(request);

        if (request.deadline < block.timestamp) revert ExpiredDeadline();
        if (request.deadline > block.timestamp + maxDeadlineDelay) revert DeadlineTooFar();

        uint256 lastTokenExecution = lastExecutionAtByToken[agent][request.tokenIn];
        if (cooldownSeconds != 0 && lastTokenExecution != 0 && block.timestamp < lastTokenExecution + cooldownSeconds) {
            revert CooldownActive();
        }

        uint256 dayKey = block.timestamp / 1 days;
        uint256 consumedToday = dailyVolumeByAgentToken[agent][request.tokenIn][dayKey];
        uint256 consumedPrevDay = dayKey == 0 ? 0 : dailyVolumeByAgentToken[agent][request.tokenIn][dayKey - 1];
        uint256 elapsedInDay = block.timestamp % 1 days;
        uint256 rollingConsumed = consumedToday + ((consumedPrevDay * (1 days - elapsedInDay)) / 1 days);

        uint256 maxDailyVolumeForToken = maxDailyVolumeByToken[request.tokenIn];
        if (requireExplicitTokenLimits && maxDailyVolumeForToken == 0) revert DailyLimitNotConfigured();
        uint256 limit = maxDailyVolumeForToken == 0 ? _scaleDefaultLimitForToken(request.tokenIn) : maxDailyVolumeForToken;
        if (limit == 0) revert DailyLimitNotConfigured();
        if (rollingConsumed + request.amountIn > limit) revert DailyLimitExceeded();
    }

    function _scaleDefaultLimitForToken(address token) internal view returns (uint256) {
        uint8 decimals = _decimalsOf(token);
        uint256 limit = defaultMaxDailyVolume;

        if (decimals == 18) {
            return limit;
        }
        if (decimals < 18) {
            return limit / (10 ** (18 - decimals));
        }

        uint8 upshift = decimals - 18;
        if (upshift > 59) revert InvalidTokenDecimals();
        return limit * (10 ** upshift);
    }

    function _decimalsOf(address token) internal view returns (uint8) {
        if (token == address(0)) {
            return NATIVE_TOKEN_DECIMALS;
        }
        return IERC20MetadataMinimal(token).decimals();
    }

    function _pairKey(address tokenIn, address tokenOut) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut));
    }

    function _validateAgainstOracle(SwapRequest calldata request) internal view {
        if (address(oracle) == address(0)) revert OracleNotConfigured();

        uint256 quoteAmountIn = request.swapType == SWAP_TYPE_EXACT_INPUT ? request.amountIn : request.expectedAmountIn;
        (uint256 oracleAmountOut, uint256 updatedAt) = oracle.getQuote(request.tokenIn, request.tokenOut, quoteAmountIn);

        if (oracleAmountOut == 0) revert OracleQuoteInvalid();
        if (maxOracleStaleness != 0 && block.timestamp > updatedAt + maxOracleStaleness) revert OracleStale();

        uint256 minimumExpectedOutFromOracle = (oracleAmountOut * (10_000 - maxOracleDeviationBps)) / 10_000;
        if (request.expectedAmountOut < minimumExpectedOutFromOracle) revert OracleDeviationTooHigh();
    }
}
