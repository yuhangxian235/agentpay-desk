import { expect, test } from "@playwright/test";

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

test("merchant can rotate an API key", async ({ page }) => {
  await page.goto("/");

  const ops = page.getByTestId("operations-panel");
  await expect(ops).toContainText("Production data APIs");
  await expect(ops).toContainText("active");

  await page.getByTestId("rotate-key-key_prod_data").click();

  await expect(ops).toContainText("rotating");
  await expect(ops).toContainText(/ak_live_[0-9a-f]{4}/);
});
