import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ request }) => {
  await request.post("/api/merchant-ops", {
    data: {
      action: "reset",
    },
  });
});

test("auto signer completes the x402 payment flow", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("run-purchase").click();

  await expect(page.getByTestId("exchange-feed")).toContainText("Payment Required");
  await expect(page.getByTestId("exchange-feed")).toContainText(
    "Wallet signer auto-approved policy-compliant payment",
  );
  await expect(page.getByTestId("exchange-feed")).toContainText("X-PAYMENT");
  await expect(page.getByTestId("exchange-feed")).toContainText("X-PAYMENT-RESPONSE");
  await expect(page.getByTestId("payload-panel")).toContainText("tokenized_treasuries");
  await expect(page.getByTestId("event-list")).toContainText("settlement.received");
  await expect(page.getByTestId("event-list")).toContainText(/api_[0-9a-f]+/);
  await expect(page.getByTestId("audit-list")).toContainText("ledger.appended");
});

test("rejected signer blocks before X-PAYMENT is attached", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("signer-mode-reject").click();
  await page.getByTestId("run-purchase").click();

  await expect(page.getByTestId("exchange-feed")).toContainText("Wallet authorization rejected");
  await expect(page.getByTestId("exchange-feed")).toContainText("Wallet signer rejected authorization");
  await expect(page.getByTestId("ledger-list")).toContainText("Held");
  await expect(page.getByTestId("exchange-feed")).not.toContainText("Signed authorization attached");
  await expect(page.getByTestId("event-list")).toContainText("payment.held");
});

test("review signer completes after manual approval", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("signer-mode-review").click();
  await page.getByTestId("run-purchase").click();

  await expect(page.getByTestId("exchange-feed")).toContainText(
    "Quanta Scout approved Tokenized T-bill yield after manual review",
  );
  await expect(page.getByTestId("exchange-feed")).toContainText("X-PAYMENT-RESPONSE");
  await expect(page.getByTestId("payload-panel")).toContainText("tokenized_treasuries");
});

test("expired signer holds the payment before retry", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("signer-mode-expire").click();
  await page.getByTestId("run-purchase").click();

  await expect(page.getByTestId("exchange-feed")).toContainText("Wallet authorization expired");
  await expect(page.getByTestId("exchange-feed")).toContainText("Wallet signer approval expired");
  await expect(page.getByTestId("ledger-list")).toContainText("Wallet signer approval expired");
  await expect(page.getByTestId("exchange-feed")).not.toContainText("Signed authorization attached");
  await expect(page.getByTestId("event-list")).toContainText("payment.held");
});

test("merchant can rotate an API key", async ({ page }) => {
  await page.goto("/");

  const ops = page.getByTestId("operations-panel");
  await expect(page.getByTestId("storage-adapter")).toContainText("In-memory demo");
  await expect(ops).toContainText("Production data APIs");
  await expect(ops).toContainText("active");

  await page.getByTestId("rotate-key-key_prod_data").click();

  await expect(ops).toContainText("rotating");
  await expect(ops).toContainText(/ak_live_[0-9a-f]{4}/);
  await expect(page.getByTestId("audit-list")).toContainText("api_key.rotated");
});

test("merchant can export the ledger as CSV", async ({ page }) => {
  await page.goto("/");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-ledger").click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();

  const csv = await readFile(csvPath!, "utf8");
  expect(download.suggestedFilename()).toMatch(/^agentpay-ledger-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(csv).toContain(
    "payment_id,created_at,status,agent_name,agent_wallet,resource_name,amount_usd,network,settlement_ref,risk_note",
  );
  expect(csv).toContain("Freelancer invoice scan");
  expect(csv).toContain("Agent is not allowlisted");
});

test("mobile layout avoids horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByText("AgentPay Desk")).toBeVisible();
  await expect(page.getByTestId("signer-mode-auto")).toBeVisible();
  await expect(page.getByTestId("operations-panel")).toContainText("API keys & webhooks");

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});
