# 🛠 EquiliBot Technical Stack & Infrastructure

EquiliBot is built on a high-performance, decentralized AI architecture tailored for the BNB Chain ecosystem. Our stack prioritizes **autonomous execution**, **cryptographic security**, and **mathematical precision**.

---

## 🏗 Core Frameworks
* **Agent Orchestration:** [ElizaOS](https://github.com/ai16z/eliza) (2026 Edition)
    * *Why:* Industry-standard for agentic workflows with native support for BAP-578 (Non-Fungible Agents) and BNB Chain plugins.
* **Web Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
    * *Why:* Server-side rendering for real-time liquidity data and a seamless "Command Center" UI.
* **Language:** [TypeScript](https://www.typescriptlang.org/)
    * *Why:* Ensures end-to-end type safety between the agent logic and on-chain interactions.

## 🔗 Blockchain & Smart Contracts
* **Development Environment:** [Foundry](https://book.getfoundry.sh/) (Forge/Anvil)
    * *Why:* Enables high-speed fuzz testing and local fork-simulations of the BNB Chain mainnet.
* **Account Abstraction:** [Safe{Core} SDK](https://docs.safe.global/)
    * *Why:* Provides the multi-sig infrastructure for the EquiliBot Executive Module, ensuring non-custodial asset management.
* **Protocol Standards:**
    * **BAP-578:** Utilizing the Non-Fungible Agent (NFA) standard for verifiable on-chain identity.
    * **ERC-4337:** For gasless transaction batching and session keys.
* **Web3 Library:** [Viem](https://viem.sh/) & [Wagmi](https://wagmi.sh/)
    * *Why:* Lightweight, type-safe alternatives to ethers.js optimized for modern BNB Chain sub-cent gas environments.

## 🧠 AI & Intelligence Layer
* **Primary LLM:** Claude 3.5 Sonnet / Llama 3 (Self-hosted)
    * *Why:* Superior reasoning capabilities for complex financial rebalancing and $x \cdot y = k$ invariant math.
* **Data Aggregator:** Custom-built subgraphs using [The Graph](https://thegraph.com/) for real-time monitoring of PancakeSwap V3 and BiSwap liquidity reserves.
* **Simulation Engine:** [Tenderly](https://tenderly.co/)
    * *Why:* To "dry-run" every autonomous swap for MEV protection and slippage verification before execution.

## 📊 Integrations & Tools
* **DEXs:** PancakeSwap V3, BiSwap, ApeSwap.
* **Oracles:** [Pyth Network](https://pyth.network/)
    * *Why:* Low-latency, high-fidelity price feeds required for sub-second rebalancing decisions.
* **Storage:** [BNB Greenfield](https://greenfield.bnbchain.org/)
    * *Why:* Decentrally storing the Agent's "Audit Logs" to ensure every trade is transparent and verifiable by the DAO.

---

## ⚡ Performance Summary
| Category | Tooling |
| :--- | :--- |
| **Network** | BNB Chain (Mainnet/Testnet) |
| **Agent Loops** | Observe → Calculate → Verify → Execute |
| **Security** | Formal Verification via Foundry + Safe Modules |
| **Communication** | Secure RPCs via QuickNode / Ankr |