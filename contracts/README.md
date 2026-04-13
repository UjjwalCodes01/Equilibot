## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/DeployPhase1.s.sol:DeployPhase1 --rpc-url <your_rpc_url> --broadcast
```

### Validate Deployed Configuration

```shell
$ forge script script/ValidatePhase1Config.s.sol:ValidatePhase1Config --rpc-url <your_rpc_url>
```

### Oracle Adapter

The production oracle adapter contract is at `src/oracles/ChainlinkPriceOracleAdapter.sol`.
Use `DEPLOY_ORACLE_ADAPTER=true` in `.env` to deploy and configure it during phase-1 deployment.

### Mainnet Operations Checklist

Follow `PHASE1_MAINNET_CHECKLIST.md` before enabling production execution.

### Deployment Guide

Use `DEPLOY_AND_VALIDATE.md` for the exact command flow and profile templates:
- `.env.testnet.example`
- `.env.mainnet.example`

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
