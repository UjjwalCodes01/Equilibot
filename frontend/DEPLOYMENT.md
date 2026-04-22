# EquiliBot — Deployment Guide

## Prerequisites
- Node.js 20+
- A BSC Testnet wallet with some tBNB for gas

## Frontend (Next.js)

### Local Development
```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local with your values
npm install
npm run dev
```

### Deploy to Vercel
1. Push the repository to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set the Root Directory to `frontend`
4. Add these environment variables in Vercel's dashboard:
   - `AGENT_TELEMETRY_BASE_URL` — URL of your deployed agent (e.g., `https://equilibot.onrender.com`)
   - `AGENT_TELEMETRY_API_TOKEN` — Must match the agent's `TELEMETRY_API_TOKEN` (recommended)
   - `GEMINI_API_KEY` — Your Google AI Studio API key (powers Nexus Narrator, Audit Explainer, Studio AI Builder)
5. Deploy!

## Agent (Node.js)

### Local Development
```bash
cd agent
cp .env.testnet.production .env
# Edit .env with your AGENT_PRIVATE_KEY and TELEMETRY_API_TOKEN
npm install
npm run dev
```

### Deploy to Railway / Render
1. Set the Root Directory to `agent`
2. Set the Start Command to:
   - `TELEMETRY_PORT=$PORT TELEMETRY_BIND_ADDRESS=0.0.0.0 npm start`
3. Add the same `.env` variables from the agent's `.env` file as environment variables in the hosting dashboard
4. The telemetry server will start on `TELEMETRY_PORT` (Render sets this via `$PORT`)

## Connecting Frontend ↔ Agent
The frontend proxies all `/api/agent/*` requests to the agent's telemetry server.
The `AGENT_TELEMETRY_BASE_URL` env var tells the Next.js API proxy where to forward requests.

- **Local**: Both on localhost → default `http://127.0.0.1:9100` works
- **Deployed**: Set `AGENT_TELEMETRY_BASE_URL` in Vercel to the agent's public URL

## For Hackathon Judges
No wallet connection is required to view the dashboard. However, if you want the interactive demo:
1. Install MetaMask and switch to BSC Testnet (Chain ID 97)
2. Get testnet tBNB from the [BNB Faucet](https://www.bnbchain.org/en/testnet-faucet)
3. Visit the demo, connect your wallet, and use the "Fund Treasury" feature on the Sandbox page
