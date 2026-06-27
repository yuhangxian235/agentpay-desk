# Real x402 upgrade notes

This demo keeps payments local and simulated. To turn it into a real x402 integration, replace the simulator boundaries below instead of rewriting the UI.

## Seller route

Current boundary:

```text
createChallenge(agent, resource, network)
```

Production replacement:

- Protect each paid API route with x402 seller middleware.
- Set the accepted network, USDC asset, pay-to account, and exact amount per resource.
- Return `402 Payment Required` when the request does not include a valid payment.
- Return `X-PAYMENT-RESPONSE` after settlement verification.

## Agent client

Current boundary:

```text
createAuthorization(agent, requirement)
```

Production replacement:

- Wrap `fetch` with an x402-aware client.
- Connect a wallet signer controlled by the agent policy layer.
- Let the client read payment requirements, sign the payment payload, attach `X-PAYMENT`, and retry.
- Keep the existing spending-policy checks before signing.

## Ledger

Current boundary:

```text
createLedgerEntry(agent, resource, network, status, riskNote)
```

Production replacement:

- Persist invoice id, agent wallet, endpoint id, amount, network, settlement response, payload hash, and policy verdict.
- Add reconciliation jobs for pending settlement, refunds, duplicate payments, and failed facilitator responses.
- Export CSV or accounting events for merchant operations.

## Risk policy

Current boundary:

```text
evaluateRisk(agent, resource, ledger, settings)
```

Production replacement:

- Enforce allowlists, per-agent daily budgets, per-endpoint caps, wallet balance checks, and merchant deny lists.
- Add velocity checks across agents controlled by the same operator.
- Require manual approval for high-risk endpoints or new wallets.

## Product next steps

- Add wallet connection for a demo buyer.
- Store ledger data in SQLite, Supabase, or Postgres.
- Add a merchant API key model for paid resources.
- Add webhook verification for settlement events.
- Deploy the frontend and a small API service separately.
