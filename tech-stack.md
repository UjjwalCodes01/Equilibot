# 🛠 EquiliBot Technical Stack & Infrastructure

EquiliBot is built on a high-performance, security-first autonomous agent architecture tailored for the BNB Chain ecosystem. Our stack prioritizes **autonomous execution**, **cryptographic security**, and **mathematical precision**.

---

## 🏗 Core Frameworks

* **Agent Orchestration:** Custom TypeScript Autonomous Agent (Node.js ESM)
    * *Why:* Fully deterministic Observe → Calculate → Verify → Execute loop with explicit policy gates. No framework magic — every decision is traceable.
* **Web Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
    * *Why:* Server-side rendering for real-time telemetry data and a seamless operator dashboard UI.
* **Language:** [TypeScript](https://www.typescriptlang.org/)
    * *Why:* End-to-end type safety between agent logic, on-chain ABI interactions, and the frontend.

## 🔗 Blockchain & Smart Contracts

* **Development Environment:** [Foundry](https://book.getfoundry.sh/) (Forge/Anvil)
    * *Why:* High-speed fuzz testing and local fork-simulations of the BSC mainnet.
* **Account Abstraction:** [Safe{Core} SDK](https://docs.safe.global/)
    * *Why:* Multi-sig infrastructure for the EquiliBot Executive Module, ensuring non-custodial, policy-gated asset management.
* **Web3 Library:** [Viem](https://viem.sh/) & [Wagmi](https://wagmi.sh/)
    * *Why:* Lightweight, type-safe, optimised for modern BNB Chain sub-cent gas environments.

## 🧠 AI & Intelligence Layer

* **Primary LLM:** Google Gemini (`gemini-2.0-flash`)
    * *Why:* Low-latency reasoning for trade narration, DAO explainability, and strategy blueprint generation via the Strategy Studio.
* **AI API Security:** Bearer token auth + per-IP rate limiting on all AI endpoints
    * *Why:* Prevents quota abuse and unauthorized access to internal Gemini calls.

## 📊 Integrations & Tools

* **DEXs:** PancakeSwap V3
* **Oracles:** [Pyth Network](https://pyth.network/)
    * *Why:* Low-latency, high-fidelity price feeds required for sub-second rebalancing decisions. Stablecoin synthetic fallback (`$1.00`) implemented for testnet BUSD/USDT staleness resilience.
* **Decentralised Audit Storage:** [BNB Greenfield](https://greenfield.bnbchain.org/)
    * *Why:* Every audit log entry (intent → policy → simulation → execution) is dual-written to BNB Greenfield for immutable, decentralised audit trails. Local NDJSON is the primary read path; Greenfield is the on-chain-adjacent mirror.
* **Signing:** Local private key (testnet) / AWS KMS (mainnet via `SIGNER_MODE=managed`)

---

## ⚡ Performance Summary

| Category | Tooling |
| :--- | :--- |
| **Network** | BNB Chain Testnet (Chain ID 97) / Mainnet (Chain ID 56) |
| **Agent Loops** | Observe → Calculate → Verify → Execute |
| **Security** | Foundry fuzz tests + Safe Modules + SwapGuard policy enforcement |
| **Communication** | BSC public RPC (testnet) / QuickNode private RPC (production) |
| **Audit Trail** | Local NDJSON + BNB Greenfield decentralised mirror |
| **AI Auth** | Bearer token + IP rate limiting (10 req/min) |