import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleMerchantOps } from "./merchantOpsApi";
import { createFileMerchantOpsRepository } from "./merchantOpsStore";
import { handleProtectedResource } from "./protectedResourceApi";
import { createSimulatedFacilitator } from "./x402Facilitator";
import {
  type LedgerEntry,
  agents,
  buildReconciliationEvents,
  createAuthorization,
  createChallenge,
  createLedgerEntry,
  demoApiCredentials,
  evaluateSigner,
  evaluateRisk,
  findDemoApiCredential,
  ledgerToCsv,
  rotateApiKey,
  resources,
  starterApiKeys,
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
      apiKeyHeader: findDemoApiCredential(resources[0].id)?.secret,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });

    expect(response.status).toBe(402);
    expect(response.headers["X-402-Version"]).toBe("1");
    expect(response.body.error).toBe("X-PAYMENT header is required");
  });

  it("requires an API key before returning a payment challenge", () => {
    const response = handleProtectedResource({
      agentId: agents[0].id,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });

    expect(response.status).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toContain("ApiKey");
    expect(response.body.error).toBe("X-API-Key header is required");
  });

  it("rejects API keys that are not scoped for the requested resource", () => {
    const response = handleProtectedResource({
      agentId: agents[0].id,
      apiKeyHeader: demoApiCredentials[1].secret,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("API key is not scoped for this resource");
  });

  it("returns paid data when the protected API receives a valid X-PAYMENT header", () => {
    const challenge = handleProtectedResource({
      agentId: agents[0].id,
      apiKeyHeader: findDemoApiCredential(resources[0].id)?.secret,
      resourceId: resources[0].id,
      network: "base-sepolia",
    });
    const paymentChallenge = challenge.body as ReturnType<typeof createChallenge>;
    const authorization = createAuthorization(agents[0], paymentChallenge.accepts[0]);
    const paid = handleProtectedResource({
      agentId: agents[0].id,
      apiKeyHeader: findDemoApiCredential(resources[0].id)?.secret,
      resourceId: resources[0].id,
      network: "base-sepolia",
      paymentHeader: authorization.header,
    });

    expect(paid.status).toBe(200);
    expect(paid.body.apiKey).toMatchObject({ validated: true });
    expect(paid.body.facilitator).toMatchObject({ mode: "simulated", status: "settled" });
    expect(paid.headers["X-FACILITATOR-RECEIPT"]).toMatch(/^fac_[0-9a-f]+$/);
    expect(paid.headers["X-PAYMENT-RESPONSE"]).toMatch(/^api_[0-9a-f]+$/);
    expect(paid.body.payment).toMatchObject({
      validated: true,
      asset: "USDC",
      facilitatorReceipt: paid.headers["X-FACILITATOR-RECEIPT"],
    });
    expect(paid.body.data).toMatchObject({ market: "tokenized_treasuries" });
  });

  it("settles payment authorizations through a facilitator adapter boundary", () => {
    const challenge = createChallenge(agents[0], resources[0], "base-sepolia");
    const authorization = createAuthorization(agents[0], challenge.accepts[0]);
    const facilitator = createSimulatedFacilitator("https://facilitator.example/settle");
    const settlement = facilitator.settle({
      agent: agents[0],
      authorization: {
        payload: authorization.payload,
        signature: "0xtest_signature",
      },
      paymentHeader: authorization.header,
      requirement: challenge.accepts[0],
      resource: resources[0],
    });

    expect(settlement).toMatchObject({
      accepted: true,
      amount: "240000",
      asset: "USDC",
      mode: "http-ready",
      network: "base-sepolia",
      provider: "https://facilitator.example/settle",
      status: "settled",
    });
    expect(settlement.receiptId).toMatch(/^fac_[0-9a-f]+$/);
    expect(settlement.settlementRef).toMatch(/^api_[0-9a-f]+$/);
    expect(settlement.transactionHash).toMatch(/^0x[0-9a-f]+$/);
  });

  it("models wallet signer approval states", () => {
    expect(evaluateSigner("auto", agents[0], resources[0])).toMatchObject({
      status: "approved",
    });
    expect(evaluateSigner("review", agents[0], resources[0])).toMatchObject({
      status: "approved",
    });
    expect(evaluateSigner("reject", agents[0], resources[0])).toMatchObject({
      status: "rejected",
      note: "Wallet signer rejected authorization",
    });
    expect(evaluateSigner("expire", agents[0], resources[0])).toMatchObject({
      status: "expired",
      note: "Wallet signer approval expired",
    });
  });

  it("builds reconciliation events from ledger outcomes", () => {
    const events = buildReconciliationEvents(starterLedger);

    expect(events[0]).toMatchObject({
      paymentId: starterLedger[0].id,
      status: "delivered",
      type: "settlement.received",
    });
    expect(events[2]).toMatchObject({
      paymentId: starterLedger[2].id,
      status: "pending",
      type: "payment.held",
    });
  });

  it("rotates an active merchant API key without changing revoked keys", () => {
    const rotated = rotateApiKey(starterApiKeys, starterApiKeys[0].id);

    expect(rotated[0].status).toBe("rotating");
    expect(rotated[0].prefix).toMatch(/^ak_live_[0-9a-f]+$/);
    expect(rotated[0].prefix).not.toBe(starterApiKeys[0].prefix);
    expect(rotated[1]).toEqual(starterApiKeys[1]);
  });

  it("serves merchant ops state through a backend resource", () => {
    handleMerchantOps({
      body: { action: "reset" },
      method: "POST",
      searchParams: new URLSearchParams(),
    });

    const result = handleMerchantOps({
      method: "GET",
      searchParams: new URLSearchParams(),
    });
    const state = result.body as {
      auditEvents: Array<{ action: string }>;
      ledger: LedgerEntry[];
      storage: { driver: string };
      version: number;
    };

    expect(result.status).toBe(200);
    expect(state.ledger).toHaveLength(starterLedger.length);
    expect(state.auditEvents[0].action).toBe("state.reset");
    expect(state.storage.driver).toBe("memory");
    expect(state.version).toBe(1);
  });

  it("persists merchant ledger entries and exposes server-side CSV export", () => {
    handleMerchantOps({
      body: { action: "reset" },
      method: "POST",
      searchParams: new URLSearchParams(),
    });

    const entry = createLedgerEntry(
      agents[0],
      resources[3],
      "base",
      "settled",
      "Allowlisted agent",
    );
    const append = handleMerchantOps({
      body: { action: "append-ledger", entry },
      method: "POST",
      searchParams: new URLSearchParams(),
    });
    const state = append.body as {
      auditEvents: Array<{ action: string; targetId: string }>;
      ledger: LedgerEntry[];
    };
    const csv = handleMerchantOps({
      method: "GET",
      searchParams: new URLSearchParams("format=csv"),
    });

    expect(append.status).toBe(200);
    expect(state.ledger[0]).toMatchObject({ id: entry.id, resourceId: "fx-route" });
    expect(state.auditEvents[0]).toMatchObject({ action: "ledger.appended", targetId: entry.id });
    expect(csv.status).toBe(200);
    expect(csv.headers["Content-Type"]).toContain("text/csv");
    expect(csv.body).toContain(entry.id);
  });

  it("persists merchant ops state through a file-backed repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "agentpay-desk-"));

    try {
      const filePath = join(directory, "merchant-ops.json");
      const firstRepository = createFileMerchantOpsRepository(filePath);
      const entry = createLedgerEntry(
        agents[1],
        resources[1],
        "polygon",
        "settled",
        "Persisted through file adapter",
      );

      firstRepository.reset();
      firstRepository.appendLedgerEntry(entry);

      const secondRepository = createFileMerchantOpsRepository(filePath);
      const state = secondRepository.readState();
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        ledger: LedgerEntry[];
        schemaVersion: number;
      };

      expect(state.storage).toMatchObject({ driver: "file", durable: true });
      expect(state.ledger[0]).toMatchObject({ id: entry.id, resourceId: entry.resourceId });
      expect(raw.schemaVersion).toBe(1);
      expect(raw.ledger[0].id).toBe(entry.id);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rotates merchant API keys through the merchant ops API", () => {
    handleMerchantOps({
      body: { action: "reset" },
      method: "POST",
      searchParams: new URLSearchParams(),
    });

    const result = handleMerchantOps({
      body: { action: "rotate-key", keyId: starterApiKeys[0].id },
      method: "POST",
      searchParams: new URLSearchParams(),
    });
    const state = result.body as {
      apiKeys: typeof starterApiKeys;
      auditEvents: Array<{ action: string; targetId: string }>;
    };

    expect(result.status).toBe(200);
    expect(state.apiKeys[0].status).toBe("rotating");
    expect(state.apiKeys[0].prefix).toMatch(/^ak_live_[0-9a-f]+$/);
    expect(state.auditEvents[0]).toMatchObject({
      action: "api_key.rotated",
      targetId: starterApiKeys[0].id,
    });
  });
});
