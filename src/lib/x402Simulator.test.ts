import { describe, expect, it } from "vitest";
import {
  agents,
  createAuthorization,
  createChallenge,
  createLedgerEntry,
  evaluateRisk,
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
});
