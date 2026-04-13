// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapGuard} from "./interfaces/ISwapGuard.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

interface ISafeModuleExecutor {
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success);

    function execTransactionFromModuleReturnData(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success, bytes memory returnData);
}

contract EquiliBotModule {
    uint8 internal constant OPERATION_CALL = 0;
    uint8 internal constant SWAP_TYPE_EXACT_INPUT = 0;
    uint8 internal constant SWAP_TYPE_EXACT_OUTPUT = 1;
    address internal constant NATIVE_TOKEN = address(0);
    bytes4 internal constant SELECTOR_SWAP_EXACT_TOKENS_FOR_TOKENS = 0x38ed1739;
    bytes4 internal constant SELECTOR_SWAP_TOKENS_FOR_EXACT_TOKENS = 0x8803dbee;
    bytes4 internal constant SELECTOR_EXACT_INPUT_SINGLE = 0x414bf389;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    address public owner;
    address public pendingOwner;
    bool public paused;
    bool public allowInputBalanceIncrease;
    bool public strictTokenIsolation;

    address public agent;
    ISafeModuleExecutor public immutable safe;
    ISwapGuard public guard;
    mapping(address => mapping(bytes4 => bool)) public allowedRouterSelectors;
    mapping(address => bool) public protectedTokens;
    mapping(address => uint256) private protectedTokenIndexPlusOne;
    address[] private protectedTokenList;
    uint256 private _reentrancyLock;

    error Unauthorized();
    error InvalidAddress();
    error ModulePaused();
    error UnauthorizedAgent();
    error SafeExecutionFailed();
    error NativeValueMismatch();
    error InvalidCalldata();
    error SelectorNotAllowed();
    error UnsupportedSwapType();
    error InputExceeded();
    error OutputTooLow();
    error UnexpectedInputBalanceIncrease();
    error UnexpectedOutputBalanceDecrease();
    error UnexpectedProtectedTokenDecrease();
    error TokenIsolationNotConfigured();
    error ApprovalFailed();
    error ReentrancyDetected();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PausedUpdated(bool paused);
    event AgentUpdated(address indexed previousAgent, address indexed newAgent);
    event GuardUpdated(address indexed previousGuard, address indexed newGuard);
    event InputBalanceIncreaseToleranceUpdated(bool allowed);
    event StrictTokenIsolationUpdated(bool enabled);
    event ProtectedTokenUpdated(address indexed token, bool protectedToken);
    event RouterSelectorPolicyUpdated(address indexed router, bytes4 indexed selector, bool allowed);
    event SwapExecuted(
        address indexed agent,
        address indexed router,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes32 calldataHash
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyLock != 1) revert ReentrancyDetected();
        _reentrancyLock = 2;
        _;
        _reentrancyLock = 1;
    }

    constructor(address initialOwner, address safeAddress, address guardAddress, address initialAgent) {
        if (
            initialOwner == address(0) || safeAddress == address(0) || guardAddress == address(0)
                || initialAgent == address(0)
        ) {
            revert InvalidAddress();
        }

        owner = initialOwner;
        safe = ISafeModuleExecutor(safeAddress);
        guard = ISwapGuard(guardAddress);
        agent = initialAgent;
        strictTokenIsolation = true;
        _reentrancyLock = 1;

        emit OwnershipTransferred(address(0), initialOwner);
        emit AgentUpdated(address(0), initialAgent);
        emit GuardUpdated(address(0), guardAddress);
        emit StrictTokenIsolationUpdated(true);
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

    function setPaused(bool isPaused) external onlyOwner {
        paused = isPaused;
        emit PausedUpdated(isPaused);
    }

    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert InvalidAddress();
        address previousAgent = agent;
        agent = newAgent;
        emit AgentUpdated(previousAgent, newAgent);
    }

    function setGuard(address newGuard) external onlyOwner {
        if (newGuard == address(0)) revert InvalidAddress();
        address previousGuard = address(guard);
        guard = ISwapGuard(newGuard);
        emit GuardUpdated(previousGuard, newGuard);
    }

    function setAllowInputBalanceIncrease(bool allowed) external onlyOwner {
        allowInputBalanceIncrease = allowed;
        emit InputBalanceIncreaseToleranceUpdated(allowed);
    }

    function setStrictTokenIsolation(bool enabled) external onlyOwner {
        strictTokenIsolation = enabled;
        emit StrictTokenIsolationUpdated(enabled);
    }

    function setRouterSelectorAllowed(address router, bytes4 selector, bool allowed) external onlyOwner {
        if (router == address(0)) revert InvalidAddress();
        allowedRouterSelectors[router][selector] = allowed;
        emit RouterSelectorPolicyUpdated(router, selector, allowed);
    }

    function setProtectedToken(address token, bool shouldProtect) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();

        if (shouldProtect) {
            if (!protectedTokens[token]) {
                protectedTokens[token] = true;
                protectedTokenList.push(token);
                protectedTokenIndexPlusOne[token] = protectedTokenList.length;
            }
        } else if (protectedTokens[token]) {
            protectedTokens[token] = false;
            uint256 idx = protectedTokenIndexPlusOne[token] - 1;
            uint256 lastIdx = protectedTokenList.length - 1;

            if (idx != lastIdx) {
                address moved = protectedTokenList[lastIdx];
                protectedTokenList[idx] = moved;
                protectedTokenIndexPlusOne[moved] = idx + 1;
            }

            protectedTokenList.pop();
            protectedTokenIndexPlusOne[token] = 0;
        }

        emit ProtectedTokenUpdated(token, shouldProtect);
    }

    function executeSwap(ISwapGuard.SwapRequest calldata request, bytes calldata routerCalldata, uint256 value)
        external
        nonReentrant
        returns (bool)
    {
        if (paused) revert ModulePaused();
        if (msg.sender != agent) revert UnauthorizedAgent();
        if (routerCalldata.length < 4) revert InvalidCalldata();

        bytes4 selector = bytes4(routerCalldata[:4]);
        if (!allowedRouterSelectors[request.router][selector]) revert SelectorNotAllowed();
        _validateRouterCalldata(request, selector, routerCalldata);
        _validateIsolationConfiguration(request);

        guard.validateAndConsume(request, msg.sender);
        _validateValue(request, value);
        _executeAndValidate(request, routerCalldata, value);

        emit SwapExecuted(
            msg.sender, request.router, request.tokenIn, request.tokenOut, request.amountIn, keccak256(routerCalldata)
        );

        return true;
    }

    function _validateIsolationConfiguration(ISwapGuard.SwapRequest calldata request) internal view {
        if (!strictTokenIsolation) {
            return;
        }

        if (request.tokenIn != NATIVE_TOKEN && !protectedTokens[request.tokenIn]) {
            revert TokenIsolationNotConfigured();
        }
        if (request.tokenOut != NATIVE_TOKEN && !protectedTokens[request.tokenOut]) {
            revert TokenIsolationNotConfigured();
        }
    }

    function _executeAndValidate(ISwapGuard.SwapRequest calldata request, bytes calldata routerCalldata, uint256 value)
        internal
    {
        address safeAddress = address(safe);
        uint256 balanceInBefore = _balanceOf(request.tokenIn, safeAddress);
        uint256 balanceOutBefore = _balanceOf(request.tokenOut, safeAddress);
        uint256[] memory protectedBalancesBefore = _snapshotProtectedBalances(safeAddress);

        if (request.tokenIn != NATIVE_TOKEN) {
            _approveToken(request.tokenIn, request.router, request.amountIn);
        }

        (bool success, bytes memory returnData) = _safeExec(request.router, value, routerCalldata);
        if (!success) {
            _revertWithData(returnData);
        }

        if (request.tokenIn != NATIVE_TOKEN) {
            _clearApproval(request.tokenIn, request.router);
        }

        uint256 balanceInAfter = _balanceOf(request.tokenIn, safeAddress);
        uint256 balanceOutAfter = _balanceOf(request.tokenOut, safeAddress);
        _validateProtectedBalances(safeAddress, request, protectedBalancesBefore);

        _validateBalanceDeltas(request, balanceInBefore, balanceInAfter, balanceOutBefore, balanceOutAfter);
    }

    function _validateRouterCalldata(ISwapGuard.SwapRequest calldata request, bytes4 selector, bytes calldata routerCalldata)
        internal
        view
    {
        address safeAddress = address(safe);

        if (selector == SELECTOR_SWAP_EXACT_TOKENS_FOR_TOKENS) {
            if (request.swapType != SWAP_TYPE_EXACT_INPUT) revert InvalidCalldata();

            (uint256 amountIn, uint256 amountOutMin, address[] memory path, address to, uint256 deadline) =
                abi.decode(routerCalldata[4:], (uint256, uint256, address[], address, uint256));

            bytes memory canonical =
                abi.encodeWithSelector(selector, amountIn, amountOutMin, path, to, deadline);
            if (keccak256(canonical) != keccak256(routerCalldata)) revert InvalidCalldata();
            if (to != safeAddress) revert InvalidCalldata();
            if (amountIn != request.amountIn) revert InvalidCalldata();
            if (amountOutMin < request.minAmountOut) revert InvalidCalldata();
            if (deadline > request.deadline) revert InvalidCalldata();
            if (path.length < 2 || path[0] != request.tokenIn || path[path.length - 1] != request.tokenOut) {
                revert InvalidCalldata();
            }
            return;
        }

        if (selector == SELECTOR_SWAP_TOKENS_FOR_EXACT_TOKENS) {
            if (request.swapType != SWAP_TYPE_EXACT_OUTPUT) revert InvalidCalldata();

            (uint256 amountOut, uint256 amountInMax, address[] memory path, address to, uint256 deadline) =
                abi.decode(routerCalldata[4:], (uint256, uint256, address[], address, uint256));

            bytes memory canonical =
                abi.encodeWithSelector(selector, amountOut, amountInMax, path, to, deadline);
            if (keccak256(canonical) != keccak256(routerCalldata)) revert InvalidCalldata();
            if (to != safeAddress) revert InvalidCalldata();
            if (amountOut != request.expectedAmountOut) revert InvalidCalldata();
            if (amountInMax != request.amountIn) revert InvalidCalldata();
            if (deadline > request.deadline) revert InvalidCalldata();
            if (path.length < 2 || path[0] != request.tokenIn || path[path.length - 1] != request.tokenOut) {
                revert InvalidCalldata();
            }
            return;
        }

        if (selector == SELECTOR_EXACT_INPUT_SINGLE) {
            if (request.swapType != SWAP_TYPE_EXACT_INPUT) revert InvalidCalldata();

            ExactInputSingleParams memory params = abi.decode(routerCalldata[4:], (ExactInputSingleParams));

            bytes memory canonical = abi.encodeWithSelector(selector, params);
            if (keccak256(canonical) != keccak256(routerCalldata)) revert InvalidCalldata();
            if (params.recipient != safeAddress) revert InvalidCalldata();
            if (params.tokenIn != request.tokenIn || params.tokenOut != request.tokenOut) {
                revert InvalidCalldata();
            }
            if (params.amountIn != request.amountIn) revert InvalidCalldata();
            if (params.amountOutMinimum < request.minAmountOut) revert InvalidCalldata();
            if (params.deadline > request.deadline) revert InvalidCalldata();
            return;
        }

        revert InvalidCalldata();
    }

    function _snapshotProtectedBalances(address safeAddress) internal view returns (uint256[] memory balances) {
        uint256 len = protectedTokenList.length;
        balances = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            balances[i] = _balanceOf(protectedTokenList[i], safeAddress);
        }
    }

    function _validateProtectedBalances(
        address safeAddress,
        ISwapGuard.SwapRequest calldata request,
        uint256[] memory balancesBefore
    ) internal view {
        uint256 len = protectedTokenList.length;
        for (uint256 i = 0; i < len; i++) {
            address token = protectedTokenList[i];
            if (token == request.tokenIn || token == request.tokenOut) continue;

            uint256 afterBalance = _balanceOf(token, safeAddress);
            if (afterBalance < balancesBefore[i]) revert UnexpectedProtectedTokenDecrease();
        }
    }

    function _validateValue(ISwapGuard.SwapRequest calldata request, uint256 value) internal pure {
        if (request.tokenIn == NATIVE_TOKEN) {
            if (value != request.amountIn) revert NativeValueMismatch();
        } else if (value != 0) {
            revert NativeValueMismatch();
        }
    }

    function _balanceOf(address token, address account) internal view returns (uint256) {
        if (token == NATIVE_TOKEN) {
            return account.balance;
        }
        return IERC20Minimal(token).balanceOf(account);
    }

    function _approveToken(address token, address spender, uint256 amount) internal {
        bytes memory zeroApprovalData = abi.encodeCall(IERC20Minimal.approve, (spender, 0));
        (bool zeroApprovalSuccess, bytes memory zeroApprovalReturnData) = _safeExec(token, 0, zeroApprovalData);
        if (!zeroApprovalSuccess) {
            _revertWithData(zeroApprovalReturnData);
        }

        bytes memory approvalData = abi.encodeCall(IERC20Minimal.approve, (spender, amount));
        (bool approvalSuccess, bytes memory approvalReturnData) = _safeExec(token, 0, approvalData);
        if (!approvalSuccess) {
            _revertWithData(approvalReturnData);
        }
    }

    function _clearApproval(address token, address spender) internal {
        bytes memory zeroApprovalData = abi.encodeCall(IERC20Minimal.approve, (spender, 0));
        (bool zeroApprovalSuccess, bytes memory zeroApprovalReturnData) = _safeExec(token, 0, zeroApprovalData);
        if (!zeroApprovalSuccess) {
            _revertWithData(zeroApprovalReturnData);
        }
    }

    function _safeExec(address to, uint256 value, bytes memory data)
        internal
        returns (bool success, bytes memory returnData)
    {
        bytes memory payload = abi.encodeCall(
            ISafeModuleExecutor.execTransactionFromModuleReturnData, (to, value, data, OPERATION_CALL)
        );

        (bool callOk, bytes memory raw) = address(safe).call(payload);
        if (callOk) {
            return abi.decode(raw, (bool, bytes));
        }

        success = safe.execTransactionFromModule(to, value, data, OPERATION_CALL);
        returnData = "";
    }

    function _validateBalanceDeltas(
        ISwapGuard.SwapRequest calldata request,
        uint256 balanceInBefore,
        uint256 balanceInAfter,
        uint256 balanceOutBefore,
        uint256 balanceOutAfter
    ) internal view {
        if (!allowInputBalanceIncrease && balanceInAfter > balanceInBefore) revert UnexpectedInputBalanceIncrease();
        if (balanceOutAfter < balanceOutBefore) revert UnexpectedOutputBalanceDecrease();

        uint256 spentInput = balanceInAfter < balanceInBefore ? balanceInBefore - balanceInAfter : 0;
        uint256 receivedOutput = balanceOutAfter - balanceOutBefore;

        if (spentInput > request.amountIn) revert InputExceeded();

        if (request.swapType == SWAP_TYPE_EXACT_INPUT) {
            if (receivedOutput < request.minAmountOut) revert OutputTooLow();
        } else if (request.swapType == SWAP_TYPE_EXACT_OUTPUT) {
            if (receivedOutput < request.expectedAmountOut) revert OutputTooLow();
        } else {
            revert UnsupportedSwapType();
        }
    }

    function _revertWithData(bytes memory returnData) internal pure {
        if (returnData.length == 0) revert SafeExecutionFailed();
        assembly {
            revert(add(returnData, 32), mload(returnData))
        }
    }
}
