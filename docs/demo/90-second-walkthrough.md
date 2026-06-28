# 90-second demo walkthrough

Use this as the spoken script for a short screen recording. Keep the pace calm and show the protocol panel while each line appears in the UI.

## Script

0-10s
AgentPay Desk is a stablecoin payment desk for AI agents that need to buy paid API resources without a human checkout flow.

10-22s
The buyer chooses an agent, a paid API resource, a settlement network, and a wallet signer mode. The demo keeps funds simulated, but the protocol boundaries match an x402-style integration.

22-35s
When I click Run x402 purchase, the first request hits the protected `/api/protected-resource` route without payment.

35-45s
The seller returns HTTP `402 Payment Required` with `X-402-Version` and an accepted USDC payment requirement.

45-58s
Before the agent can pay, the wallet signer has to approve the request. Auto and Review can sign; Reject and Expire stop the flow before funds can move.

58-70s
After approval, the client attaches `X-PAYMENT` and retries the same protected route.

70-80s
The API validates the payment payload and returns the paid data with `X-PAYMENT-RESPONSE`.

80-90s
The merchant ledger records either settled revenue or a held payment block, and the ledger can be exported as CSV for reconciliation.

## Shot list

1. Start on the dashboard with Quanta Scout and Tokenized T-bill yield selected.
2. Point at the buyer controls and Wallet signer modes.
3. Click `Run x402 purchase`.
4. Show the initial GET request to `/api/protected-resource`.
5. Show the `402 Payment Required` response.
6. Show Wallet approval pending, then signed `X-PAYMENT`.
7. Show the final `X-PAYMENT-RESPONSE` and purchased payload.
8. Switch signer to `Reject` and rerun.
9. Show that the merchant ledger records Held instead of settlement.

## Captioned asset

A silent captioned video asset lives at:

```text
docs/demo/agentpay-90s-walkthrough.mp4
```

For outreach, pair the video with:

```text
Live demo: https://agentpay-desk.vercel.app
Code: https://github.com/yuhangxian235/agentpay-desk
```
