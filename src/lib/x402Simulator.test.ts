import { describe, expect, it } from "vitest";
import { handleProtectedResource } from "./protectedResourceApi";
import {
  agents,
  createAuthorization,
  createChallenge,
  createLedgerEntry,
  evaluateRisk,
  ledgerToCsv,
  resources,
  starterLedger,
} from "./x402Simulator";

describe("x402 simulator", () => {
  it("creates an exact USDC payment challenge for a protected resource", () => {
    const challenge = createChallenge(agents[0], resources[0], "base-sepolia");
    const requirement = challenge.accepts[0];

    expect(challenge.x402Version).toBe(1);
    expect(challenge.error).toContain("X-PAYMENT");
    expect(requirement.scheme).toBe("exact");
    expect(requirement.asset).toBe("USDC");
    expect(requirement.network).toBe("base-sepolia");
    expect(requirement.maxAmountRequired).toBe("240000");
    expect(requirement.resource).toContain(resources[0].path);
    expect(requirement.extra.endpointId).toBe(resources[0].id);
  });

  it("creates a decodable X-PAYMENT authorization", () => {
    const challenge = createChallenge(agents[0], resources[1], "base");
    const authorization = createAuthorization(agents[0], challenge.accepts[0]);
    const decoded = JSON.parse(Buffer.from(authorization.header, "base64").toString("utf8"));

    expect(decoded.payload.from).toBe(agents[0].wallet);
    expect(decoded.payload.to).toBe(challenge.accepts[0].payTo);
    expect(decoded.payload.value).toBe(challenge.accepts[0].maxAmountRequired);
    expect(decoded.payload.network).toBe("base");
    expect(decoded.signature).toMatch(/^0x[0-9a-f]+$/);
  });

  it("blocks a non-allowlisted agent when allowlist policy is enabled", () => {
    const verdict = evaluateRisk(agents[2], resources[0], starterLedger, {
      allowlistedOnly: true,
      autopay: true,
      spendCapUsd: 0.5,
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.note).toBe("Agent is not allowlisted");
  });

  it("blocks an endpoint when its price exceeds the per-call cap", () => {
    const verdict = evaluateRisk(agents[0], resources[0], starterLedger, {
      allowlistedOnly: true,
      autopay: true,
      spendCapUsd: 0.1,
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.note).toBe("Endpoint price exceeds policy cap");
  });

  it("records settled payments with settlement references", () => {
    const entry = createLedgerEntry(
      agents[0],
      resources[2],
      "polygon",
      "settled",
      "Allowlisted agent",
    );

    expect(entry.status).toBe("settled");
    expect(entry.amountUsd).toBe(resources[2].priceUsd);
    expect(entry.settlementRef).toMatch(/^set_0x[0-9a-f]+$/);
  });

  it("exports ledger entries as escaped CSV", () => {
    const csv = ledgerToCsv([
      {
        ...starterLedger[0],
        resourceName: 'Invoice scan, "priority"',
        riskNote: "Within budget, approved",
      },
    ]);

    expect(csv.split("\n")[0]).toBe(
      "payment_id,created_at,status,agent_name,agent_wallet,resource_name,amount_usd,network,settlement_ref,risk_note",
    );
    expect(csv).toContain('"Invoice scan, ""priority"""');
    expect(csv).toContain('"Within budget, approved"');
    expect(csv).toContain(",0.12,");
  });

  it("returns a 402 response when the protected API is called without payment", () => {
    const response = handleProtectedResource({
      agentId: agents[0].id,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });

    expect(response.status).toBe(402);
    expect(response.headers["X-402-Version"]).toBe("1");
    expect(response.body.error).toBe("X-PAYMENT header is required");
  });

  it("returns paid data when the protected API receives a valid X-PAYMENT header", () => {
    const challenge = handleProtectedResource({
      agentId: agents[0].id,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });
    const paymentChallenge = challenge.body as ReturnType<typeof createChallenge>;
    const authorization = createAuthorization(agents[0], paymentChallenge.accepts[0]);
    const paid = handleProtectedResource({
      agentId: agents[0].id,
      resourceId: resources[0].id,
      network: "base-sepolia",
      paymentHeader: authorization.header,
    });

    expect(paid.status).toBe(200);
    expect(paid.headers["X-PAYMENT-RESPONSE"]).toMatch(/^api_[0-9a-f]+$/);
    expect(paid.body.payment).toMatchObject({ validated: true, asset: "USDC" });
    expect(paid.body.data).toMatchObject({ market: "tokenized_treasuries" });
  });
});
