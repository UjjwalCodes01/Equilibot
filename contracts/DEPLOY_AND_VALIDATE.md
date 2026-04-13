# Deploy And Validate (Phase 1)

## 1. Choose profile
- For testnet: copy `.env.testnet.example` to `.env`
- For mainnet: copy `.env.mainnet.example` to `.env`

## 2. Fill real values
- Replace every `0x000...000` and `0xYOUR_PRIVATE_KEY`
- Ensure comma-separated lists align by index:
  - `ALLOWED_TOKENS`
  - `MIN_TRADE_AMOUNTS`
  - `TOKEN_MAX_DAILY_VOLUMES`
- If `DEPLOY_ORACLE_ADAPTER=true`, fill all `ORACLE_FEED_*` lists with matching lengths.

## 3. Optional preflight checks
```bash
cd /home/ujwal/Desktop/coding/EquiliBot/contracts
forge build
forge test -vvv
```

## 4. Deploy
```bash
cd /home/ujwal/Desktop/coding/EquiliBot/contracts
source .env
forge script script/DeployPhase1.s.sol:DeployPhase1 \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

## 5. Verify contracts on explorer
```bash
cd /home/ujwal/Desktop/coding/EquiliBot/contracts
source .env
forge script script/DeployPhase1.s.sol:DeployPhase1 \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast --verify \
  --etherscan-api-key "$BSCSCAN_API_KEY" \
  --resume
```

## 6. Capture deployed addresses
- Set `GUARD_ADDRESS` and `MODULE_ADDRESS` in `.env`

## 7. Enable module in Safe
```bash
cd /home/ujwal/Desktop/coding/EquiliBot/contracts
source .env
forge script script/EnableSafeModule.s.sol:EnableSafeModule \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

## 8. Validate live config
```bash
cd /home/ujwal/Desktop/coding/EquiliBot/contracts
source .env
forge script script/ValidatePhase1Config.s.sol:ValidatePhase1Config \
  --rpc-url "$RPC_URL"
```

## 9. Operational safety notes
- Keep `requireExplicitTokenLimits=true`
- Never enable a router without selector policy entries
- Never set token allowlist without corresponding min trade and daily cap
- Keep `strictTokenIsolation=true` and ensure every treasury token is tracked via module protected token configuration
- Cooldown enforcement is per input token; tune `cooldownSeconds` to balance safety and liveness
