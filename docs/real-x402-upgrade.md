# Real x402 upgrade notes

This demo now includes a real `/api/protected-resource` route that returns HTTP `402 Payment Required` before a client retries with `X-PAYMENT`. It still keeps funds local and simulated. To turn it into a real x402 integration, replace the simulator boundaries below instead of rewriting the UI.

## Seller route

Current boundary:

```text
api/protected-resource.ts
handleProtectedResource({ agentId, resourceId, network, paymentHeader })
```

Production replacement:

- Protect each paid API route with x402 seller middleware.
- Authenticate merchant-owned endpoints with scoped API keys before returning a 402 challenge or paid data.
- Set the accepted network, USDC asset, pay-to account, and exact amount per resource.
- Return `402 Payment Required` when the request does not include a valid payment.
- Return `X-PAYMENT-RESPONSE` after settlement verification.

## Agent client

Current boundary:

```text
evaluateSigner(mode, agent, resource)
createAuthorization(agent, requirement)
```

Production replacement:

- Wrap `fetch` with an x402-aware client.
- Connect a wallet signer controlled by the agent policy layer.
- Model signer states for pending approval, manual review, rejection, expiry, and successful signature.
- Let the client read payment requirements, request signer approval, sign the payment payload, attach `X-PAYMENT`, and retry.
- Keep the existing spending-policy checks before signing.

## Ledger

Current boundary:

```text
createLedgerEntry(agent, resource, network, status, riskNote)
buildReconciliationEvents(ledger)
POST /api/merchant-ops { action: "append-ledger", entry }
```

Production replacement:

- Persist invoice id, agent wallet, endpoint id, amount, network, settlement response, payload hash, and policy verdict.
- Add reconciliation jobs and webhook events for pending settlement, refunds, duplicate payments, held payments, and failed facilitator responses.
- Export CSV or accounting events for merchant operations.
- Replace the in-memory merchant repository in `src/lib/merchantOpsStore.ts` with a durable database adapter.

## API keys

Current boundary:

```text
starterApiKeys
rotateApiKey(keys, keyId)
POST /api/merchant-ops { action: "rotate-key", keyId }
verifyApiKey(apiKey, resourceId)
```

Production replacement:

- Store hashed API keys with merchant id, endpoint scopes, environment, status, and rotation history.
- Enforce key scope before protected resources are served.
- Add key revocation, grace-period rotation, usage metering, and audit logs.

## Risk policy

Current boundary:

```text
evaluateRisk(agent, resource, ledger, settings)
```

Production replacement:

- Enforce allowlists, per-agent daily budgets, per-endpoint caps, wallet balance checks, and merchant deny lists.
- Add velocity checks across agents controlled by the same operator.
- Require manual approval for high-risk endpoints or new wallets, and persist rejected or expired signer outcomes.

## Product next steps

- Connect a real wallet/signature provider for a demo buyer.
- Store ledger data in SQLite, Supabase, or Postgres.
- Replace the simulated merchant API key registry with persisted keys and real auth middleware.
- Add webhook verification for settlement events.
- Deploy the frontend and a small API service separately.
