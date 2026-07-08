# 90-second demo walkthrough

Use this as the spoken script for a short screen recording. Keep the pace calm and show the Agent Autopilot trace first, then the protocol panel.

## Script

0-10s
AgentPay Desk is an agent payment runtime prototype for AI agents that need to buy paid API resources without a human checkout flow.

10-22s
The user gives the agent a task and budget: get tokenized treasury yield data only if the API costs less than thirty cents.

22-35s
When I click Run agent autopilot, the trace shows the agent parsing the task, choosing a paid API, quoting the endpoint, and calling the protected route without payment.

35-45s
The seller returns HTTP `402 Payment Required` with `X-402-Version` and an accepted USDC payment requirement.

45-58s
Before the agent can pay, the wallet signer has to approve the request. Auto and Review can sign; Reject and Expire stop the flow before funds can move.

58-70s
After approval, the client attaches `X-PAYMENT` and retries the same protected route.

70-80s
The API validates the payment payload and returns the paid data with `X-PAYMENT-RESPONSE`.

80-90s
The agent returns the paid data with a settlement receipt, while the merchant ledger records either settled revenue or a held payment block.

## Shot list

1. Start on Agent Autopilot with the default treasury-yield prompt.
2. Click `Run agent autopilot`.
3. Show the tool-call trace moving from `parse_user_goal` to `return_answer`.
4. Show the initial GET request to `/api/protected-resource`.
5. Show the `402 Payment Required` response.
6. Show Wallet approval pending, then signed `X-PAYMENT`.
7. Show the final `X-PAYMENT-RESPONSE`, agent answer, and purchased payload.
8. Switch signer to `Reject` and rerun the guided flow.
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
