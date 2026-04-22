# EquiliBot — AI Features Guide

This document covers the 3 Gemini AI features added to the frontend dashboard and exactly how to test each one.

---

## Setup

Before testing, make sure your `frontend/.env.local` has the Gemini API key:

```env
GEMINI_API_KEY=your_key_here
```

Get a free key at: https://aistudio.google.com/app/apikey

Then run the frontend:
```bash
cd frontend
npm install
npm run dev
```

> **Note:** All 3 AI features are purely frontend. The backend agent does NOT need to be running to test them (though the Nexus and Audits pages show richer data when the agent is live).

---

## Feature 1 — AI Thought Narrator (Nexus Page)

### What it does
Every entry in the **Thought Stream** on the Nexus page shows a small ✨ **AI Insight** link below it. Clicking it sends the raw agent decision data to Gemini, which narrates the agent's reasoning in plain English.

### How to test
1. Go to `http://localhost:3000/nexus`
2. Look at the Thought Stream panel on the left side
3. Find any log entry (OBSERVE, SKIP, EXECUTE, etc.)
4. Click the small **✨ AI Insight** text below the raw summary
5. Wait 1–2 seconds — a gold-bordered box appears with Gemini's narration

**Expected output (example):**
> *"The agent detected a 5,024 basis point deviation in the WBNB-BUSD treasury, meaning the BNB allocation has drifted to nearly 100% of total value. It has correctly identified a BUY_B opportunity to restore the 50/50 balance, but is holding off on execution because the system is currently in observe-only mode."*

**Cost-efficiency proof:** Click the same entry again — it does NOT make a second API call. The result is cached in the browser for the entire session.

---

## Feature 2 — AI Audit Explainer (Audits Page)

### What it does
Every entry in the **Governance Audits** log has a raw JSON accordion. When you expand it, an **✨ Analyze with AI** button appears below the JSON. Clicking it asks Gemini to write a 3–4 sentence post-mortem analysis of that specific agent decision.

### How to test
1. Go to `http://localhost:3000/audits`
2. Today's date is pre-selected — if the agent has run, entries will appear
3. Click any entry row to **expand** it (the raw JSON accordion opens)
4. Below the JSON block, click the gold **✨ Analyze with AI** button
5. Wait 1–2 seconds — a gold analysis box appears below

**Expected output (example):**
> *"The agent completed a SKIP decision for the delta-neutral-rebalance task on the WBNB-BUSD pair. It correctly identified that the system is in observe-only mode, which restricts it from submitting on-chain transactions. The underlying opportunity was genuine — a 5,024 bps deviation far exceeds the 150 bps neutral band — so escalating to canary mode would allow the agent to execute this rebalance autonomously."*

**Tip:** Use the **Stage Filter** dropdown to filter by `SKIP` or `OPPORTUNITY` stages to find the most interesting entries to analyze.

---

## Feature 3 — AI Strategy Builder (Studio Page)

### What it does
The **Strategy Studio** now has a **✨ AI Strategy Builder** input at the top of the canvas. Type a strategy description in plain English, press Generate, and Gemini converts it into structured strategy blocks that populate the canvas automatically.

### How to test
1. Go to `http://localhost:3000/studio`
2. At the top of the **Strategy Blueprint** canvas, find the gold **✨ AI Strategy Builder** box
3. Type one of the example prompts below and press **Enter** or click **Generate**
4. Watch the canvas blocks get replaced with AI-generated strategy blocks

**Example prompts to try:**

| Prompt | What you should see |
|--------|---------------------|
| `Buy BNB when price drops 5% and gas is below 3 gwei` | A Price Deviation trigger + Gas Below Threshold condition + Swap action |
| `Harvest yield every hour if circuit breaker is OK, with 200bps max slippage` | A Time Interval trigger + Circuit Breaker condition + Harvest action + Max Slippage guard |
| `Rebalance treasury when balance drifts more than 10%, protect against sandwich attacks` | A Balance Drift trigger + Swap action + Max Slippage guard |

**Expected result:** The canvas clears and fills with correctly typed blocks (trigger → condition → action → guard order). The blocks are real — you can click **Deploy Strategy** to send them to the live agent pipeline.

---

## Important Notes

- **No background API calls:** Gemini is only called when you click a button. If you close the tab or don't interact, zero API calls are made.
- **Graceful degradation:** If `GEMINI_API_KEY` is missing or invalid, the features simply won't show up. All other dashboard functionality works normally.
- **Model used:** `gemini-2.0-flash` by default (or `GEMINI_MODEL` override if configured).
- **API key security:** The key lives only in `frontend/.env.local` which is gitignored and never sent to the browser. It is read server-side by Next.js API routes only.
