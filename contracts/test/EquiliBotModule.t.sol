// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ISwapGuard} from "../src/interfaces/ISwapGuard.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {SwapGuard} from "../src/SwapGuard.sol";
import {EquiliBotModule} from "../src/EquiliBotModule.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            allowance[from][msg.sender] = currentAllowance - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockERC20NonCompliant {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    // Intentionally ignores allowance checks to emulate a non-standard token.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockSafe {
    receive() external payable {}

    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8)
        external
        returns (bool success)
    {
        (success,) = to.call{value: value}(data);
    }

    function execTransactionFromModuleReturnData(address to, uint256 value, bytes calldata data, uint8)
        external
        returns (bool success, bytes memory returnData)
    {
        (success, returnData) = to.call{value: value}(data);
    }
}

contract MockRouter {
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

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOutMin;
    }

    function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountInMax);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOut);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountInMax;
        amounts[1] = amountOut;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut) {
        bool inputOk = MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        bool outputOk = MockERC20(params.tokenOut).transfer(params.recipient, params.amountOutMinimum);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amountOut = params.amountOutMinimum;
    }

    function swapNativeForToken(address tokenOut, address recipient, uint256 amountOut) external payable {
        bool outputOk = MockERC20(tokenOut).transfer(recipient, amountOut);
        require(outputOk, "TRANSFER_FAILED");
    }

    function alwaysRevert() external pure {
        revert("ROUTER_REVERTED");
    }

    function forceInputIncrease(address tokenIn, address recipient, uint256 amount) external {
        MockERC20(tokenIn).mint(recipient, amount);
    }

    function drainSameTokenFromSafe(address token, address from, uint256 amount) external returns (uint256) {
        bool ok = MockERC20(token).transferFrom(from, address(this), amount);
        require(ok, "TRANSFER_FAILED");
        return amount;
    }

    function spendArbitraryAndPayOut(
        address tokenIn,
        address tokenOut,
        address from,
        address recipient,
        uint256 spendAmount,
        uint256 outAmount
    ) external returns (uint256) {
        bool inputOk = MockERC20NonCompliant(tokenIn).transferFrom(from, address(this), spendAmount);
        bool outputOk = MockERC20(tokenOut).transfer(recipient, outAmount);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        return outAmount;
    }
}

contract MockRouterRevertLikePancake {
    function swapExactTokensForTokens(uint256, uint256, address[] calldata, address, uint256)
        external
        pure
        returns (uint256[] memory)
    {
        revert("ROUTER_REVERTED");
    }
}

contract MockRouterDrainProtected {
    address public immutable drainToken;
    address public immutable attacker;

    constructor(address drainToken_, address attacker_) {
        drainToken = drainToken_;
        attacker = attacker_;
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        bool drainOk = MockERC20(drainToken).transferFrom(msg.sender, attacker, 1 ether);
        require(inputOk && outputOk && drainOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOutMin;
    }
}

contract MockRouterNativeExactInput {
    function swapExactTokensForTokens(uint256, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        payable
        returns (uint256[] memory amounts)
    {
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        require(outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amountOutMin;
    }
}

contract MockRouterExactInputInputIncrease {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(path[0]).mint(msg.sender, amountIn + 1);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOutMin;
    }
}

contract MockRouterExactInputOverSpend {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20NonCompliant(path[0]).transferFrom(msg.sender, address(this), amountIn + 1 ether);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn + 1 ether;
        amounts[1] = amountOutMin;
    }
}

contract MockRouterExactInputLowOutput {
    function swapExactTokensForTokens(uint256 amountIn, uint256, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, 1);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = 1;
    }
}

contract MockRouterExactOutputLowOutput {
    function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountInMax);
        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOut - 1);
        require(inputOk && outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountInMax;
        amounts[1] = amountOut - 1;
    }
}

contract MockRouterReentrantWithAgent {
    EquiliBotModule internal module;
    ISwapGuard.SwapRequest internal nestedRequest;
    bytes internal nestedData;

    function setReentry(EquiliBotModule module_, ISwapGuard.SwapRequest calldata request_, bytes calldata data_) external {
        module = module_;
        nestedRequest = request_;
        nestedData = data_;
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        bool inputOk = MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        require(inputOk, "TRANSFER_FAILED");

        // Re-enter executeSwap while the original call still holds the lock.
        module.executeSwap(nestedRequest, nestedData, 0);

        bool outputOk = MockERC20(path[path.length - 1]).transfer(to, amountOutMin);
        require(outputOk, "TRANSFER_FAILED");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOutMin;
    }
}

contract MockSafeFails {
    function execTransactionFromModule(address, uint256, bytes calldata, uint8) external pure returns (bool success) {
        return false;
    }

    function execTransactionFromModuleReturnData(address, uint256, bytes calldata, uint8)
        external
        pure
        returns (bool, bytes memory)
    {
        revert("NO_RETURN_DATA");
    }
}

contract MockSafeApproveAlwaysFails {
    function execTransactionFromModule(address, uint256, bytes calldata, uint8) external pure returns (bool success) {
        return false;
    }

    function execTransactionFromModuleReturnData(address, uint256, bytes calldata, uint8)
        external
        pure
        returns (bool, bytes memory)
    {
        return (false, bytes("APPROVE_FAIL"));
    }
}

contract MockSafeSecondApproveFails {
    uint256 internal callCount;

    function execTransactionFromModule(address, uint256, bytes calldata, uint8) external pure returns (bool success) {
        return false;
    }

    function execTransactionFromModuleReturnData(address, uint256, bytes calldata, uint8)
        external
        returns (bool, bytes memory)
    {
        callCount++;
        if (callCount == 1) {
            return (true, bytes(""));
        }
        return (false, bytes("APPROVE_FAIL_2"));
    }
}

contract MockSafeClearApprovalFails {
    uint256 internal callCount;

    function execTransactionFromModule(address, uint256, bytes calldata, uint8) external pure returns (bool success) {
        return false;
    }

    function execTransactionFromModuleReturnData(address, uint256, bytes calldata, uint8)
        external
        returns (bool, bytes memory)
    {
        callCount++;
        if (callCount == 4) {
            return (false, bytes("CLEAR_APPROVAL_FAIL"));
        }
        return (true, bytes(""));
    }
}

contract NoopGuard is ISwapGuard {
    function validateAndConsume(SwapRequest calldata, address) external pure {}

    function checkSwap(SwapRequest calldata, address) external pure returns (bool) {
        return true;
    }
}

contract EquiliBotModuleHarness is EquiliBotModule {
    constructor(address initialOwner, address safeAddress, address guardAddress, address initialAgent)
        EquiliBotModule(initialOwner, safeAddress, guardAddress, initialAgent)
    {}

    function callValidateBalanceDeltas(
        ISwapGuard.SwapRequest calldata request,
        uint256 balanceInBefore,
        uint256 balanceInAfter,
        uint256 balanceOutBefore,
        uint256 balanceOutAfter
    ) external view {
        _validateBalanceDeltas(request, balanceInBefore, balanceInAfter, balanceOutBefore, balanceOutAfter);
    }
}

contract EquiliBotModuleTest is Test {
    uint8 internal constant SWAP_TYPE_EXACT_INPUT = 0;
    uint8 internal constant SWAP_TYPE_EXACT_OUTPUT = 1;

    struct V3ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    MockSafe internal safe;
    MockRouter internal router;
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    SwapGuard internal guard;
    EquiliBotModule internal module;
    MockPriceOracle internal oracle;

    address internal owner = address(this);
    address internal agent = address(0x5001);
    address internal attacker = address(0x5002);
    address internal newOwner = address(0x5003);

    function setUp() public {
        safe = new MockSafe();
        router = new MockRouter();
        tokenIn = new MockERC20("Token In", "TIN", 18);
        tokenOut = new MockERC20("Token Out", "TOUT", 18);

        tokenIn.mint(address(safe), 1_000 ether);
        tokenOut.mint(address(router), 1_000 ether);

        vm.deal(address(safe), 100 ether);

        guard = new SwapGuard(owner, 0, 0, 30 minutes);
        module = new EquiliBotModule(owner, address(safe), address(guard), agent);
        oracle = new MockPriceOracle();

        guard.setAuthorizedExecutor(address(module), true);
        guard.setRouterAllowed(address(router), true);
        guard.setTokenAllowed(address(tokenIn), true);
        guard.setTokenAllowed(address(tokenOut), true);
        guard.setTokenAllowed(address(0), true);
        guard.setMinTradeAmount(address(tokenIn), 1 ether);
        guard.setMinTradeAmount(address(0), 1 ether);
        guard.setMaxDailyVolumeForToken(address(tokenIn), 10_000 ether);
        guard.setMaxDailyVolumeForToken(address(0), 10_000 ether);
        guard.setOracleConfig(address(oracle), 5 minutes, 300);

        module.setRouterSelectorAllowed(address(router), bytes4(0x38ed1739), true);
        module.setRouterSelectorAllowed(address(router), MockRouter.swapTokensForExactTokens.selector, true);
        module.setRouterSelectorAllowed(address(router), bytes4(0x414bf389), true);
        module.setProtectedToken(address(tokenIn), true);
        module.setProtectedToken(address(tokenOut), true);

        _setOracleQuote(address(tokenIn), address(tokenOut), 100 ether, 1_000);
        _setOracleQuote(address(0), address(tokenOut), 2 ether, 10.2 ether);
        _setOracleQuote(address(tokenIn), address(tokenOut), 80 ether, 40 ether);
    }

    function test_ExecuteSwap_ExactInput_SuccessAndAllowanceReset() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(agent);
        bool success = module.executeSwap(request, data, 0);

        assertTrue(success);
        assertEq(tokenIn.balanceOf(address(safe)), 900 ether);
        assertEq(tokenOut.balanceOf(address(safe)), 995 ether);
        assertEq(tokenIn.allowance(address(safe), address(router)), 0);
    }

    function test_RevertWhen_CalldataSendsOutputToAttacker() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        bytes memory data = _exactInputData(request.amountIn, 995 ether, attacker, request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_ExecuteSwap_V3ExactInputSingle_SuccessAndAllowanceReset() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        bytes memory data = _exactInputSingleData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(agent);
        bool success = module.executeSwap(request, data, 0);

        assertTrue(success);
        assertEq(tokenIn.balanceOf(address(safe)), 900 ether);
        assertEq(tokenOut.balanceOf(address(safe)), 995 ether);
        assertEq(tokenIn.allowance(address(safe), address(router)), 0);
    }

    function test_RevertWhen_V3ExactInputSingleSwapTypeMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = SWAP_TYPE_EXACT_OUTPUT;

        bytes memory data = _exactInputSingleData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_V3ExactInputSingleCanonicalCalldataHashMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory canonical = _exactInputSingleData(request.amountIn, request.minAmountOut, address(safe), request.deadline);
        bytes memory nonCanonical = bytes.concat(canonical, hex"01");

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, nonCanonical, 0);
    }

    function test_RevertWhen_V3ExactInputSingleRecipientMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputSingleData(request.amountIn, request.minAmountOut, attacker, request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_V3ExactInputSingleTokenMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputSingleDataWithTokens(
            address(tokenIn),
            attacker,
            request.amountIn,
            request.minAmountOut,
            address(safe),
            request.deadline
        );

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_V3ExactInputSingleAmountInMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputSingleData(request.amountIn + 1, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_V3ExactInputSingleMinOutTooLow() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputSingleData(request.amountIn, request.minAmountOut - 1, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_V3ExactInputSingleDeadlineAboveRequest() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputSingleData(request.amountIn, request.minAmountOut, address(safe), request.deadline + 1);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ValueProvidedForErc20Swap() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.NativeValueMismatch.selector);
        module.executeSwap(request, data, 1 ether);
    }

    function test_RevertWhen_NativeInputSelectorUnsupported() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(router),
            tokenIn: address(0),
            tokenOut: address(tokenOut),
            amountIn: 2 ether,
            expectedAmountIn: 0,
            minAmountOut: 10 ether,
            expectedAmountOut: 10.2 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = abi.encodeCall(MockRouter.swapNativeForToken, (address(tokenOut), address(safe), 10 ether));

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.SelectorNotAllowed.selector);
        module.executeSwap(request, data, 2 ether);
    }

    function test_ExactOutputMode_SucceedsWithinMaxInput() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory goodData = _exactOutputData(40 ether, 82 ether, address(safe), request.deadline);

        vm.prank(agent);
        assertTrue(module.executeSwap(request, goodData, 0));
    }

    function test_ExactOutputMode_RevertsWhenRouterAttemptsAboveApprovedMaxInput() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory badData = _exactOutputData(40 ether, 120 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert();
        module.executeSwap(request, badData, 0);
    }

    function test_RevertBubblesFromRouter() public {
        MockRouterRevertLikePancake badRouter = new MockRouterRevertLikePancake();
        guard.setRouterAllowed(address(badRouter), true);
        module.setRouterSelectorAllowed(address(badRouter), bytes4(0x38ed1739), true);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(badRouter);
        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);
        bytes memory data = abi.encodeWithSelector(
            bytes4(0x38ed1739), request.amountIn, request.minAmountOut, path, address(safe), request.deadline
        );

        vm.prank(agent);
        vm.expectRevert(bytes("ROUTER_REVERTED"));
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_SelectorNotAllowed() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        module.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, false);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.SelectorNotAllowed.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_UnauthorizedAgent() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(attacker);
        vm.expectRevert(EquiliBotModule.UnauthorizedAgent.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ModulePaused() public {
        module.setPaused(true);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.ModulePaused.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_InvalidCalldata() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, hex"1234", 0);
    }

    function test_OwnershipTransferFlow() public {
        module.transferOwnership(newOwner);
        assertEq(module.pendingOwner(), newOwner);

        vm.prank(newOwner);
        module.acceptOwnership();

        assertEq(module.owner(), newOwner);
        assertEq(module.pendingOwner(), address(0));
    }

    function test_RevertWhen_AcceptOwnershipUnauthorized() public {
        module.transferOwnership(newOwner);

        vm.expectRevert(EquiliBotModule.Unauthorized.selector);
        module.acceptOwnership();
    }

    function test_RevertWhen_TransferOwnershipZeroAddress() public {
        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        module.transferOwnership(address(0));
    }

    function test_RevertWhen_SetAgentZeroAddress() public {
        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        module.setAgent(address(0));
    }

    function test_RevertWhen_SetGuardZeroAddress() public {
        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        module.setGuard(address(0));
    }

    function test_RevertWhen_AdminCallsUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert(EquiliBotModule.Unauthorized.selector);
        module.setPaused(true);

        vm.prank(attacker);
        vm.expectRevert(EquiliBotModule.Unauthorized.selector);
        module.setAgent(attacker);

        vm.prank(attacker);
        vm.expectRevert(EquiliBotModule.Unauthorized.selector);
        module.setGuard(address(guard));

        vm.prank(attacker);
        vm.expectRevert(EquiliBotModule.Unauthorized.selector);
        module.setStrictTokenIsolation(false);
    }

    function test_AdminSettersUpdateState() public {
        NoopGuard altGuard = new NoopGuard();

        module.setPaused(true);
        module.setAgent(attacker);
        module.setGuard(address(altGuard));
        module.setStrictTokenIsolation(false);

        assertTrue(module.paused());
        assertEq(module.agent(), attacker);
        assertEq(address(module.guard()), address(altGuard));
        assertFalse(module.strictTokenIsolation());
    }

    function test_RevertWhen_StrictIsolationNotConfigured() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule strictModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        strictModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.TokenIsolationNotConfigured.selector);
        strictModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_StrictIsolationTokenOutNotConfigured() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule strictModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        strictModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        strictModule.setProtectedToken(address(tokenIn), true);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.TokenIsolationNotConfigured.selector);
        strictModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_SafeExecutionFailsWithoutData() public {
        MockSafeFails badSafe = new MockSafeFails();
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule badModule = new EquiliBotModule(owner, address(badSafe), address(noopGuard), agent);
        badModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(badModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(badSafe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.SafeExecutionFailed.selector);
        badModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ConstructorHasInvalidAddress() public {
        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        new EquiliBotModule(address(0), address(safe), address(guard), agent);

        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        new EquiliBotModule(owner, address(0), address(guard), agent);

        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        new EquiliBotModule(owner, address(safe), address(0), agent);

        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        new EquiliBotModule(owner, address(safe), address(guard), address(0));
    }

    function test_RevertWhen_SetRouterSelectorAllowedZeroRouter() public {
        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        module.setRouterSelectorAllowed(address(0), bytes4(0), true);
    }

    function test_RevertWhen_FirstApprovalFailsWithData() public {
        MockSafeApproveAlwaysFails badSafe = new MockSafeApproveAlwaysFails();
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule badModule = new EquiliBotModule(owner, address(badSafe), address(noopGuard), agent);
        badModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(badModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(badSafe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(bytes("APPROVE_FAIL"));
        badModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_SecondApprovalFailsWithData() public {
        MockSafeSecondApproveFails badSafe = new MockSafeSecondApproveFails();
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule badModule = new EquiliBotModule(owner, address(badSafe), address(noopGuard), agent);
        badModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(badModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(badSafe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(bytes("APPROVE_FAIL_2"));
        badModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ClearApprovalFailsWithData() public {
        MockSafeClearApprovalFails badSafe = new MockSafeClearApprovalFails();
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule badModule = new EquiliBotModule(owner, address(badSafe), address(noopGuard), agent);
        badModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(badModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(badSafe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(bytes("CLEAR_APPROVAL_FAIL"));
        badModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_SwapTypeUnsupportedAfterExecution() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = 3;

        bytes memory data = _exactInputData(request.amountIn, 995 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_InputBalanceUnexpectedIncrease() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.forceInputIncrease.selector, true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = abi.encodeCall(MockRouter.forceInputIncrease, (address(tokenIn), address(safe), 1 ether));

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_InputBalanceIncreaseAllowed_WhenConfigured() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.forceInputIncrease.selector, true);
        looseModule.setAllowInputBalanceIncrease(true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.minAmountOut = 0;
        bytes memory data = abi.encodeCall(MockRouter.forceInputIncrease, (address(tokenIn), address(safe), 1 ether));

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_OutputBalanceUnexpectedDecrease() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.drainSameTokenFromSafe.selector, true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenOut = request.tokenIn;

        bytes memory data = abi.encodeCall(MockRouter.drainSameTokenFromSafe, (address(tokenIn), address(safe), 50 ether));

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_InputSpentExceedsRequestAmount() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.spendArbitraryAndPayOut.selector, true);
        _disableStrictIsolation(looseModule);

        MockERC20NonCompliant badTokenIn = new MockERC20NonCompliant("Bad Token In", "BTIN", 18);
        badTokenIn.mint(address(safe), 1_000 ether);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(router),
            tokenIn: address(badTokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100 ether,
            expectedAmountIn: 0,
            minAmountOut: 1,
            expectedAmountOut: 1,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = abi.encodeCall(
            MockRouter.spendArbitraryAndPayOut,
            (address(badTokenIn), address(tokenOut), address(safe), address(safe), 120 ether, 10 ether)
        );

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputReceivedLessThanExpected() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.swapTokensForExactTokens.selector, true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = _exactOutputData(39 ether, 80 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ProtectedTokenDecreases() public {
        MockERC20 protectedToken = new MockERC20("Protected", "PRT", 18);
        protectedToken.mint(address(safe), 10 ether);

        MockRouterDrainProtected badRouter = new MockRouterDrainProtected(address(protectedToken), attacker);
        guard.setRouterAllowed(address(badRouter), true);
        module.setRouterSelectorAllowed(address(badRouter), bytes4(0x38ed1739), true);
        module.setProtectedToken(address(protectedToken), true);
        tokenOut.mint(address(badRouter), 1_000 ether);

        bytes memory approveData = abi.encodeCall(IERC20Minimal.approve, (address(badRouter), 10 ether));
        safe.execTransactionFromModuleReturnData(address(protectedToken), 0, approveData, 0);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(badRouter);

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);
        bytes memory data =
            abi.encodeWithSelector(bytes4(0x38ed1739), request.amountIn, request.minAmountOut, path, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.UnexpectedProtectedTokenDecrease.selector);
        module.executeSwap(request, data, 0);
    }

    function test_ProtectedToken_RemovePath_CoversSwapAndTailRemoval() public {
        MockERC20 p1 = new MockERC20("P1", "P1", 18);
        MockERC20 p2 = new MockERC20("P2", "P2", 18);

        module.setProtectedToken(address(p1), true);
        module.setProtectedToken(address(p2), true);

        module.setProtectedToken(address(p1), false);
        module.setProtectedToken(address(p2), false);

        vm.expectRevert(EquiliBotModule.InvalidAddress.selector);
        module.setProtectedToken(address(0), false);
    }

    function test_RevertWhen_ExactInputCanonicalCalldataHashMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory canonical = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);
        bytes memory nonCanonical = bytes.concat(canonical, hex"01");

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, nonCanonical, 0);
    }

    function test_RevertWhen_ExactInputPathInvalid() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        address[] memory badPath = new address[](1);
        badPath[0] = address(tokenIn);
        bytes memory data = _exactInputDataWithPath(request.amountIn, request.minAmountOut, badPath, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputPathInvalid() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        address[] memory badPath = new address[](1);
        badPath[0] = address(tokenIn);
        bytes memory data = _exactOutputDataWithPath(40 ether, 82 ether, badPath, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactInputAmountInMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn + 1, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactInputMinOutTooLow() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut - 1, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactInputDeadlineAboveRequest() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline + 1);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputSwapTypeMismatch() public {
        ISwapGuard.SwapRequest memory request = _baseRequest();
        bytes memory data = _exactOutputData(40 ether, request.amountIn, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputCanonicalCalldataHashMismatch() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory canonical = _exactOutputData(40 ether, 82 ether, address(safe), request.deadline);
        bytes memory nonCanonical = bytes.concat(canonical, hex"01");

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, nonCanonical, 0);
    }

    function test_RevertWhen_ExactOutputRecipientMismatch() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = _exactOutputData(40 ether, 82 ether, attacker, request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputDeadlineAboveRequest() public {
        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = _exactOutputData(40 ether, 82 ether, address(safe), request.deadline + 1);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InvalidCalldata.selector);
        module.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ReentrancyDetected() public {
        MockRouterReentrantWithAgent reentrantRouter = new MockRouterReentrantWithAgent();
        tokenOut.mint(address(reentrantRouter), 1_000 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule reentrantModule =
            new EquiliBotModule(owner, address(safe), address(noopGuard), address(reentrantRouter));
        reentrantModule.setRouterSelectorAllowed(address(reentrantRouter), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(reentrantModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(reentrantRouter);
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        reentrantRouter.setReentry(reentrantModule, request, data);

        vm.prank(address(reentrantRouter));
        vm.expectRevert(EquiliBotModule.ReentrancyDetected.selector);
        reentrantModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_UnsupportedSwapTypeBranchReachedInBalanceValidation() public {
        EquiliBotModuleHarness harness = new EquiliBotModuleHarness(owner, address(safe), address(guard), agent);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.swapType = 99;

        vm.expectRevert(EquiliBotModule.UnsupportedSwapType.selector);
        harness.callValidateBalanceDeltas(request, 100, 90, 0, 10);
    }

    function test_RevertWhen_NativeExactInputValueMismatch_WithAllowedSelector() public {
        MockRouterNativeExactInput nativeRouter = new MockRouterNativeExactInput();
        tokenOut.mint(address(nativeRouter), 100 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule nativeModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        nativeModule.setRouterSelectorAllowed(address(nativeRouter), MockRouter.swapExactTokensForTokens.selector, true);
        nativeModule.setProtectedToken(address(tokenOut), true);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(nativeRouter),
            tokenIn: address(0),
            tokenOut: address(tokenOut),
            amountIn: 2 ether,
            expectedAmountIn: 0,
            minAmountOut: 10 ether,
            expectedAmountOut: 10 ether,
            deadline: block.timestamp + 5 minutes
        });

        address[] memory nativePath = new address[](2);
        nativePath[0] = address(0);
        nativePath[1] = address(tokenOut);
        bytes memory data = _exactInputDataWithPath(request.amountIn, request.minAmountOut, nativePath, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.NativeValueMismatch.selector);
        nativeModule.executeSwap(request, data, 1 ether);
    }

    function test_ExecuteSwap_NativeExactInput_Success() public {
        MockRouterNativeExactInput nativeRouter = new MockRouterNativeExactInput();
        tokenOut.mint(address(nativeRouter), 100 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule nativeModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        nativeModule.setRouterSelectorAllowed(address(nativeRouter), MockRouter.swapExactTokensForTokens.selector, true);
        nativeModule.setProtectedToken(address(tokenOut), true);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(nativeRouter),
            tokenIn: address(0),
            tokenOut: address(tokenOut),
            amountIn: 2 ether,
            expectedAmountIn: 0,
            minAmountOut: 10 ether,
            expectedAmountOut: 10 ether,
            deadline: block.timestamp + 5 minutes
        });

        address[] memory nativePath = new address[](2);
        nativePath[0] = address(0);
        nativePath[1] = address(tokenOut);
        bytes memory data = _exactInputDataWithPath(request.amountIn, request.minAmountOut, nativePath, address(safe), request.deadline);

        vm.prank(agent);
        assertTrue(nativeModule.executeSwap(request, data, 2 ether));
    }

    function test_RevertWhen_UnexpectedInputBalanceIncrease_AfterValidCalldata() public {
        MockRouterExactInputInputIncrease badRouter = new MockRouterExactInputInputIncrease();
        tokenOut.mint(address(badRouter), 100 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(badRouter), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(badRouter);
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.UnexpectedInputBalanceIncrease.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_UnexpectedOutputBalanceDecrease_AfterValidCalldata() public {
        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(router), MockRouter.swapExactTokensForTokens.selector, true);
        _disableStrictIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.tokenOut = address(tokenIn);
        request.minAmountOut = 1;
        request.expectedAmountOut = 1;

        address[] memory samePath = new address[](2);
        samePath[0] = address(tokenIn);
        samePath[1] = address(tokenIn);
        bytes memory data = _exactInputDataWithPath(request.amountIn, request.minAmountOut, samePath, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.UnexpectedOutputBalanceDecrease.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_InputExceeded_AfterValidCalldata() public {
        MockRouterExactInputOverSpend badRouter = new MockRouterExactInputOverSpend();
        tokenOut.mint(address(badRouter), 100 ether);

        MockERC20NonCompliant badTokenIn = new MockERC20NonCompliant("Bad Token In", "BTIN", 18);
        badTokenIn.mint(address(safe), 1_000 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(badRouter), MockRouter.swapExactTokensForTokens.selector, true);
        looseModule.setProtectedToken(address(badTokenIn), true);
        looseModule.setProtectedToken(address(tokenOut), true);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(badRouter),
            tokenIn: address(badTokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100 ether,
            expectedAmountIn: 0,
            minAmountOut: 1,
            expectedAmountOut: 1,
            deadline: block.timestamp + 5 minutes
        });

        address[] memory path = new address[](2);
        path[0] = address(badTokenIn);
        path[1] = address(tokenOut);
        bytes memory data = _exactInputDataWithPath(request.amountIn, request.minAmountOut, path, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.InputExceeded.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactInputOutputTooLow_AfterValidCalldata() public {
        MockRouterExactInputLowOutput badRouter = new MockRouterExactInputLowOutput();
        tokenOut.mint(address(badRouter), 100 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(badRouter), MockRouter.swapExactTokensForTokens.selector, true);
        _configureBaseIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = _baseRequest();
        request.router = address(badRouter);
        request.minAmountOut = 500;
        bytes memory data = _exactInputData(request.amountIn, request.minAmountOut, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.OutputTooLow.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function test_RevertWhen_ExactOutputOutputTooLow_AfterValidCalldata() public {
        MockRouterExactOutputLowOutput badRouter = new MockRouterExactOutputLowOutput();
        tokenOut.mint(address(badRouter), 100 ether);

        NoopGuard noopGuard = new NoopGuard();
        EquiliBotModule looseModule = new EquiliBotModule(owner, address(safe), address(noopGuard), agent);
        looseModule.setRouterSelectorAllowed(address(badRouter), MockRouter.swapTokensForExactTokens.selector, true);
        _configureBaseIsolation(looseModule);

        ISwapGuard.SwapRequest memory request = ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_OUTPUT,
            router: address(badRouter),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 82 ether,
            expectedAmountIn: 80 ether,
            minAmountOut: 40 ether,
            expectedAmountOut: 40 ether,
            deadline: block.timestamp + 5 minutes
        });

        bytes memory data = _exactOutputData(40 ether, 82 ether, address(safe), request.deadline);

        vm.prank(agent);
        vm.expectRevert(EquiliBotModule.OutputTooLow.selector);
        looseModule.executeSwap(request, data, 0);
    }

    function _baseRequest() internal view returns (ISwapGuard.SwapRequest memory) {
        return ISwapGuard.SwapRequest({
            swapType: SWAP_TYPE_EXACT_INPUT,
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100 ether,
            expectedAmountIn: 0,
            minAmountOut: 990,
            expectedAmountOut: 1000,
            deadline: block.timestamp + 5 minutes
        });
    }

    function _path() internal view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);
    }

    function _exactInputData(uint256 amountIn, uint256 amountOutMin, address recipient, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _exactInputDataWithPath(amountIn, amountOutMin, _path(), recipient, deadline);
    }

    function _exactOutputData(uint256 amountOut, uint256 amountInMax, address recipient, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _exactOutputDataWithPath(amountOut, amountInMax, _path(), recipient, deadline);
    }

    function _exactInputDataWithPath(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address recipient,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0x38ed1739), amountIn, amountOutMin, path, recipient, deadline);
    }

    function _exactOutputDataWithPath(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory path,
        address recipient,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0x8803dbee), amountOut, amountInMax, path, recipient, deadline);
    }

    function _exactInputSingleData(uint256 amountIn, uint256 amountOutMin, address recipient, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _exactInputSingleDataWithTokens(
            address(tokenIn), address(tokenOut), amountIn, amountOutMin, recipient, deadline
        );
    }

    function _exactInputSingleDataWithTokens(
        address customTokenIn,
        address customTokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        V3ExactInputSingleParams memory params = V3ExactInputSingleParams({
            tokenIn: customTokenIn,
            tokenOut: customTokenOut,
            fee: 500,
            recipient: recipient,
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        return abi.encodeWithSelector(bytes4(0x414bf389), params);
    }

    function _setOracleQuote(address quoteTokenIn, address quoteTokenOut, uint256 amountIn, uint256 amountOut)
        internal
    {
        oracle.setQuote(quoteTokenIn, quoteTokenOut, amountIn, amountOut, block.timestamp);
    }

    function _configureBaseIsolation(EquiliBotModule target) internal {
        target.setProtectedToken(address(tokenIn), true);
        target.setProtectedToken(address(tokenOut), true);
    }

    function _disableStrictIsolation(EquiliBotModule target) internal {
        target.setStrictTokenIsolation(false);
    }
}
