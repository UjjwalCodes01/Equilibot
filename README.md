# EquiliBot — Autonomous DeFAI Treasury Agent

**Live Demo:** [equilibot.vercel.app](https://equilibot.vercel.app)  

EquiliBot is an autonomous, on-chain treasury management agent built for the BNB Smart Chain. It continuously monitors a Gnosis Safe treasury, detects portfolio drift, and autonomously executes delta-neutral rebalancing strategies through a cryptographically guarded smart contract pipeline — all with complete on-chain auditability.

## 🏆 Hackathon Submission

**Track:** Four.meme AI Sprint — Autonomous DeFAI Agents on BNB Chain

### What makes this different from a "ChatGPT + smart contract" project

EquiliBot is a Deterministic DeFAI Agent — the core decision engine uses real-time market data, live Pyth oracle prices, and on-chain TWAP feeds to make mathematically precise, verifiable trading decisions. LLMs (Gemini) are used exclusively at the explainability layer, not the execution layer. This design choice prevents hallucination-based fund loss while enabling full DAO transparency via plain-English decision narration.

## ✨ Key Features

### 🤖 Autonomous Agent Engine

- Observe → Calculate → Verify → Execute cybernetic loop running 24/7
- Reads live slot0 tick data directly from PancakeSwap V3 smart contracts via BSC RPC
- Fetches real-time BNB/USD prices from Pyth Network Hermes API
- Detects portfolio drift with basis-point precision (threshold: 150 bps)
- Builds and validates cryptographic trade intents before any on-chain action

### 🛡️ Four-Layer Safety Architecture

- Off-chain Simulation — Every intent is dry-run against a local fork before submission
- On-chain SwapGuard — Deployed smart contract enforces router allowlists, token allowlists, max slippage (300 bps), and oracle freshness
- Gnosis Safe Module — The agent can only call pre-approved, policy-compliant transactions
- Execution Mode Ladder — observe → simulate → canary → active — must be manually escalated by the operator

### 📋 Four Autonomous Tasks

| Task | Description | Trigger |
|---|---|---|
| Delta-Neutral Rebalance | Sells volatile asset (BNB) to restore 50/50 treasury allocation | Drift > 150 bps |
| Buyback & Burn | Converts excess BUSD reserves to BNB and sends to 0x000...dEaD | BUSD balance > $250 |
| Yield Harvest | Detects organic balance increases and reinvests yield | Balance increase detected |
| LP Migration | Compares fee tier efficiency across PancakeSwap V3 pools | Better fee tier found |

### 🧠 Gemini AI Explainability Layer

Three AI-powered features — all frontend-only, zero impact on agent cost or performance:

| Feature | Page | How |
|---|---|---|
| AI Thought Narrator | Nexus | Click ✨ on any log entry → Gemini explains the agent's reasoning in plain English |
| AI Audit Explainer | Audits | Expand any audit entry → "Analyze with AI" generates a post-mortem analysis |
| AI Strategy Builder | Studio | Type a strategy in plain English → Gemini converts it to executable strategy blocks |

### 📊 Transparent Executive Dashboard

- The Nexus — Live agent thought stream, pipeline topology, KPI metrics
- Safety — On-chain SwapGuard policy state, execution mode ladder
- Portfolio — Live treasury allocation from actual on-chain Safe balances
- Governance Audits — Every agent decision logged with cryptographic proof of intent
- Strategy Studio — Visual + AI-powered drag-and-drop strategy builder
- Sandbox — Connect MetaMask and fund the treasury to trigger the agent live
- Identity — Agent reputation score, uptime, and execution statistics

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                        │
│  Dashboard · Studio · Audits · Nexus · Sandbox · Safety     │
│  ↕ Polls every 5s via /api/agent/* proxy                    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (Telemetry API)
┌────────────────────────▼────────────────────────────────────┐
│                 AGENT (Node.js TypeScript)                   │
│                                                              │
│  MarketObserver → OracleService → RebalanceDetector         │
│       ↓                                                      │
│  AutonomousTaskRunner (4 tasks, 15s tick)                   │
│       ↓                                                      │
│  IntentBuilder → PolicyCheck → Simulation → SafeSigner      │
│       ↓                                                      │
│  TelemetryServer (port 9100) · AuditLogger · AlertService   │
└────────────────────────┬────────────────────────────────────┘
                         │ RPC calls (viem)
┌────────────────────────▼────────────────────────────────────┐
│               BNB SMART CHAIN (Testnet: 97)                  │
│                                                              │
│  Gnosis Safe ← SwapGuard ← EquiliBotModule                  │
│       ↓                                                      │
│  PancakeSwap V3 (WBNB/BUSD pool: 0xa0172...)                │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- A BSC Testnet wallet with tBNB ([faucet](https://www.bnbchain.org/en/testnet-faucet))
- A Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

### 1. Clone the repo

```bash
git clone https://github.com/UjjwalCodes01/Equilibot.git
cd Equilibot
```

### 2. Run the Agent

```bash
cd agent
cp .env.testnet.production .env
# Edit .env: add your AGENT_PRIVATE_KEY
npm install
npm run dev
```

The agent starts on port 9100 and immediately begins monitoring the BSC Testnet WBNB/BUSD pool.

### 3. Run the Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local: add your GEMINI_API_KEY (optional, AI features degrade gracefully)
npm install
npm run dev
```

Open http://localhost:3000 — you'll see the live agent dashboard.

### 4. Trigger the Demo

1. Go to Sandbox → connect MetaMask (BSC Testnet, Chain ID 97)
2. Click "Send 0.05 tBNB → Treasury"
3. Switch to The Nexus → watch the agent detect the imbalance and build a rebalance intent in real time

## 📦 Deployed Infrastructure

| Component | URL | Stack |
|---|---|---|
| Frontend | [equilibot.vercel.app](https://equilibot.vercel.app) | Next.js 16 on Vercel |
| Agent API | [equilibot.onrender.com](https://equilibot.onrender.com) | Node.js on Render |
| Safe Treasury | [0x1922...41C3](https://testnet.bscscan.com/address/0x19223058050D2C91E6e42158f0760340Fb3D41C3) | Gnosis Safe v1.4.1 |
| SwapGuard | [0xba6c...2Dc1](https://testnet.bscscan.com/address/0xba6c8EEaDB62Dc0302bEBb3d80C0AEA459af2Dc1) | Custom Solidity (Foundry) |
| Agent Module | [0xe963...41D6](https://testnet.bscscan.com/address/0xe963752aD278ff5185e16C46bB75C6c8b87641D6) | Safe Module |

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Framer Motion, Recharts |
| Web3 (Frontend) | Viem, Wagmi v3, injected MetaMask connector |
| Agent | Node.js 20 (ESM), TypeScript, Viem |
| Smart Contracts | Solidity, Foundry (Forge/Anvil) |
| Oracle | Pyth Network (Hermes API) + on-chain TWAP fallback + synthetic stablecoin fallback |
| Safe | Gnosis Safe v1.4.1 + custom ExecutionModule |
| AI | Google Gemini 2.5 Flash (frontend explainability only) |
| Deployment | Vercel (frontend) + Render (agent) |

## 🔐 Security Design

- The agent never holds custody. All funds live in the Gnosis Safe. The agent can only call pre-approved swap routes.
- The SwapGuard smart contract enforces slippage limits (300 bps), router allowlists, and oracle freshness on every transaction — even if the agent is compromised.
- Execution Mode Ladder — The agent starts in observe mode. Escalating to canary or active requires direct .env file access on the server. No frontend toggle.
- Private keys never leave the server. The frontend only reads telemetry data via a bearer-token-authenticated proxy.
- Every decision is cryptographically logged — even skips — creating a tamper-evident audit trail.

## 📁 Repository Structure

```text
Equilibot/
├── agent/               # Autonomous TypeScript agent
│   ├── src/
│   │   ├── config/      # Chain config, token pairs, Zod-validated env
│   │   ├── services/    # Oracle, balance, gas, alert, guard-oracle
│   │   ├── strategy/    # Autonomous task runner (4 tasks)
│   │   └── index.ts     # Main orchestrator + telemetry server
│   └── .env.testnet.production  # Template env (no secrets)
│
├── frontend/            # Next.js dashboard
│   ├── src/
│   │   ├── app/         # 12 pages: nexus, audits, studio, sandbox, etc.
│   │   ├── app/api/     # Proxy routes + 3 Gemini AI routes
│   │   ├── components/  # Layout, wallet, safety, nexus components
│   │   ├── hooks/       # useTelemetry, useAgentStatus, useAuditLog
│   │   └── lib/         # Gemini client, contract config, API types
│   └── .env.local.example   # Template env (no secrets)
│
└── contracts/           # Solidity smart contracts (Foundry)
    ├── src/SwapGuard.sol
    └── DEPLOY_AND_VALIDATE.md
```

## 🧪 Testing the AI Features

All three AI features require GEMINI_API_KEY in frontend/.env.local.

1. AI Thought Narrator (Nexus page) → Click the ✨ AI Insight link under any log entry. Gemini narrates the agent's reasoning in plain English. Results are cached — no duplicate API calls.
2. AI Audit Explainer (Audits page) → Click any audit entry to expand it, then click ✨ Analyze with AI. Gemini writes a 3–4 sentence post-mortem of the decision.
3. AI Strategy Builder (Studio page) → Type into the ✨ AI Strategy Builder box and press Enter. Example prompt:

```text
Buy BNB when price drops 5% and gas is below 3 gwei, with 200bps slippage protection
```

Gemini converts this into structured strategy blocks on the canvas.

## 🪙 For Hackathon Judges

No wallet required to explore the dashboard at [equilibot.vercel.app](https://equilibot.vercel.app).

To trigger the live interactive demo:

1. Install MetaMask → switch to BSC Testnet (Chain ID: 97)
2. Get free tBNB: [bnbchain.org/en/testnet-faucet](https://www.bnbchain.org/en/testnet-faucet)
3. Visit the Sandbox page → connect wallet → click "Send 0.05 tBNB → Treasury"
4. Watch The Nexus — within 30 seconds the agent detects the imbalance and logs:
   - OBSERVE: Deviation 502,000 bps detected — direction: BUY_B
   - CALCULATE: Intent built for delta-neutral rebalance
   - SKIP: Execution mode is observe ← agent correctly holds because it's in safe mode

Built for the Four.meme AI Sprint Hackathon on BNB Chain.

## License
MIT License. See `LICENSE`.
