# AgentPay Desk

Stablecoin payment desk for AI agents buying paid API resources with an x402-style `402 Payment Required` challenge, signed retry, merchant ledger, and risk controls.

Live demo: https://agentpay-desk.vercel.app

![AgentPay Desk desktop screenshot](docs/screenshots/agentpay-desktop.png)

## Why this exists

AI agents are starting to act like software buyers: they request data, consume APIs, and may need to pay small amounts without a human checkout flow. AgentPay Desk explores that product surface with a Web3 payment-infrastructure lens.

The demo models a paid HTTP API flow:

1. An agent requests a protected API resource.
2. The seller returns `402 Payment Required`.
3. The agent signs and retries with `X-PAYMENT`.
4. The seller returns data and an `X-PAYMENT-RESPONSE`.
5. The merchant ledger records settlement or a policy block.

This version uses a local simulator instead of moving real USDC. That keeps the demo safe and easy to run while preserving the integration boundaries for a production x402 client, wallet signer, seller middleware, facilitator, and ledger service.

## Screenshots

| Desktop flow | Mobile layout |
| --- | --- |
| ![Desktop payment flow](docs/screenshots/agentpay-desktop.png) | ![Mobile responsive layout](docs/screenshots/agentpay-mobile.png) |

## Features

- AI agent buyer selection with wallet balance, daily limit, trust score, and allowlist state.
- Paid API marketplace for RWA yield data, wallet risk scoring, invoice scanning, and stablecoin route quotes.
- x402-style HTTP exchange panel with `402`, `X-PAYMENT`, and `X-PAYMENT-RESPONSE`.
- Merchant ledger for settled and blocked API calls.
- Risk controls for allowlisting, autopay, settlement network, and per-call spend caps.
- Unit-tested payment requirement creation, authorization payloads, policy blocks, and settlement records.
- Responsive dashboard UI for desktop and mobile.

## Tech stack

- React
- TypeScript
- Vite
- Vitest
- Lucide React

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Quality checks

```bash
npm run lint
npm test
npm run build
```

## Demo script

1. Click `Run x402 purchase` with `Quanta Scout` selected.
2. Point out the first unauthenticated request, the `402 Payment Required` challenge, the signed `X-PAYMENT` retry, and the final `X-PAYMENT-RESPONSE`.
3. Select `Edge Crawler` and run the flow again to show policy blocking for a non-allowlisted agent.
4. Lower the spend cap below the endpoint price to show per-call risk enforcement.

## Architecture

```text
src/
  App.tsx                  Dashboard, controls, protocol feed, merchant ledger
  App.css                  Responsive payment-operations interface
  lib/x402Simulator.ts     x402 challenge, payment authorization, risk policy, ledger helpers
  lib/x402Simulator.test.ts
docs/
  real-x402-upgrade.md     Notes for replacing the simulator with production wiring
  screenshots/             README screenshots
```

## Production upgrade path

See [`docs/real-x402-upgrade.md`](docs/real-x402-upgrade.md) for the implementation boundary map.

High-level path:

1. Replace `src/lib/x402Simulator.ts` with real seller middleware and buyer client wiring.
2. Protect paid API routes and return exact USDC payment requirements.
3. Wrap agent requests with an x402-aware client and wallet signer.
4. Persist settlement references, invoice metadata, agent policy outcomes, and payload hashes.
5. Add webhook reconciliation for failed settlement, refunds, duplicate payments, and accounting exports.

Relevant docs:

- [Coinbase CDP x402 docs](https://docs.cdp.coinbase.com/x402/welcome)
- [x402 protocol site](https://www.x402.org/)

## Deploy to Vercel

The project includes a small `vercel.json` for a Vite static deployment.

GitHub flow:

1. Push this repo to GitHub.
2. In Vercel, create a new project and import the GitHub repo.
3. Keep the default install command.
4. Use `npm run build` as the build command.
5. Use `dist` as the output directory.
6. Deploy.

CLI flow:

```bash
npm install -g vercel
vercel
vercel --prod
```

## Resume bullets

- Built an x402-style stablecoin payment desk for AI agents buying paid API resources.
- Implemented 402 challenge handling, signed payment retry simulation, merchant ledger, and risk-policy checks in React + TypeScript.
- Added unit tests for payment requirement creation, authorization payloads, policy blocks, and settlement records.
- Designed a responsive dashboard for agent budgets, USDC-style payment authorization, paid payload delivery, and merchant reconciliation.
