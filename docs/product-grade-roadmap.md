# Product-Grade Roadmap

AgentPay Desk is now more than a front-end demo: merchant ledger, API keys, reconciliation events, CSV export, and audit trail have a backend API boundary through `/api/merchant-ops`. The default deployment uses an in-memory demo store so it can run without external credentials, and local development can switch to a file-backed repository with `MERCHANT_OPS_STORE=file`.

## Current Productized Surface

- Real protected API route: `/api/protected-resource`.
- Merchant operations API route: `/api/merchant-ops`.
- Server-side merchant state contract for ledger rows, API keys, reconciliation events, CSV export, and audit events.
- Protected resource API key enforcement with scoped demo credentials.
- Repository interface with in-memory and file-backed adapters, replaceable by Postgres, Supabase, SQLite, or another durable store.
- Frontend syncs merchant operations through the API instead of treating ledger/API keys as only local component state.
- Audit trail records reset, ledger append, and API key rotation events.
- Playwright E2E resets server state before each test.
- Live smoke checks both the x402-style protected resource and merchant ops API.

## Still Demo-Only

- The Vercel demo still defaults to in-memory state and is not durable across serverless cold starts.
- The file-backed adapter is local/Node persistence, not a production multi-tenant database.
- Wallet signatures are simulated.
- x402 facilitator settlement is simulated.
- API key secrets are public demo credentials, not hashed production credentials.
- Webhook delivery is displayed as reconciliation events, not sent to real merchant endpoints.
- There is no auth, user account model, RBAC, rate limit, or billing tenant model yet.

## Path To Real Product

1. Durable storage
   - Replace the demo repository adapter with Postgres, Supabase, SQLite, or Neon.
   - Add migrations for ledger entries, API keys, webhook events, audit events, resources, agents, and merchants.
   - Keep the current repository interface so UI and API handlers do not need a rewrite.

2. Authentication and authorization
   - Add merchant login.
   - Add scoped API keys with hashed secrets.
   - Add role-based permissions for key rotation, export, and webhook settings.
   - Persist denied API key attempts as audit events.

3. Real x402 integration
   - Replace simulated challenge creation with x402 seller middleware.
   - Replace simulated authorization with wallet signing.
   - Store real settlement references and facilitator responses.

4. Reconciliation workers
   - Add webhook delivery attempts, retries, signatures, and dead-letter handling.
   - Track duplicate settlement, refund, failed settlement, and timeout states.

5. Operational hardening
   - Add rate limiting, structured logs, audit retention, alerting, and error tracking.
   - Add environment-specific secrets and deployment checks.
   - Add security review before any real funds are used.

## Interview Framing

Call the current version a production-shaped prototype:

```text
The demo now has real HTTP API boundaries, server-side merchant ops state, a replaceable storage adapter, audit trail, browser E2E, CI, and live smoke checks. The remaining work to make it a real payment product is replacing the demo repository and simulated signer/facilitator with production database storage and real x402 settlement.
```
