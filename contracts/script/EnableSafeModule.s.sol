// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";

interface ISafeModuleManager {
    function nonce() external view returns (uint256);
    function isModuleEnabled(address module) external view returns (bool);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external returns (bool success);
}

contract EnableSafeModule is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address expectedOwner = vm.addr(ownerKey);
        address configuredOwner = vm.envAddress("OWNER_ADDRESS");
        require(expectedOwner == configuredOwner, "OWNER_MISMATCH");

        ISafeModuleManager safe = ISafeModuleManager(vm.envAddress("SAFE_ADDRESS"));
        address module = vm.envAddress("MODULE_ADDRESS");

        if (safe.isModuleEnabled(module)) {
            return;
        }

        bytes memory data = abi.encodeWithSignature("enableModule(address)", module);
        uint256 safeNonce = safe.nonce();

        bytes32 txHash = safe.getTransactionHash(
            address(safe),
            0,
            data,
            0,
            0,
            0,
            0,
            address(0),
            address(0),
            safeNonce
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, txHash);
        bytes memory signatures = abi.encodePacked(r, s, v);

        vm.startBroadcast(ownerKey);
        bool ok = safe.execTransaction(
            address(safe),
            0,
            data,
            0,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );
        vm.stopBroadcast();

        require(ok, "ENABLE_MODULE_FAILED");
        require(safe.isModuleEnabled(module), "MODULE_NOT_ENABLED");
    }
}
