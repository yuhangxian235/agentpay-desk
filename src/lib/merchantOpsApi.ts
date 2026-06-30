import type { LedgerEntry, Network } from "./x402Simulator";
import { merchantOpsRepository } from "./merchantOpsStore";

export type MerchantOpsResult = {
  body: Record<string, unknown> | string;
  headers: Record<string, string>;
  status: 200 | 400 | 405;
};

type MerchantOpsInput = {
  body?: unknown;
  method: string;
  searchParams: URLSearchParams;
};

export function handleMerchantOps(input: MerchantOpsInput): MerchantOpsResult {
  if (input.method === "GET") {
    if (input.searchParams.get("format") === "csv") {
      return {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="agentpay-ledger-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`,
          "Content-Type": "text/csv;charset=utf-8",
        },
        body: merchantOpsRepository.exportLedgerCsv(),
      };
    }

    return jsonResult(200, merchantOpsRepository.readState());
  }

  if (input.method !== "POST") {
    return jsonResult(405, { error: "Method not allowed" });
  }

  const body = input.body;

  if (!isRecord(body) || typeof body.action !== "string") {
    return jsonResult(400, { error: "Merchant operation action is required" });
  }

  if (body.action === "reset") {
    return jsonResult(200, merchantOpsRepository.reset());
  }

  if (body.action === "rotate-key") {
    if (typeof body.keyId !== "string") {
      return jsonResult(400, { error: "keyId is required" });
    }

    return jsonResult(200, merchantOpsRepository.rotateApiKey(body.keyId));
  }

  if (body.action === "append-ledger") {
    if (!isLedgerEntry(body.entry)) {
      return jsonResult(400, { error: "A valid ledger entry is required" });
    }

    return jsonResult(200, merchantOpsRepository.appendLedgerEntry(body.entry));
  }

  return jsonResult(400, { error: `Unsupported merchant operation: ${body.action}` });
}

function jsonResult(status: MerchantOpsResult["status"], body: Record<string, unknown>): MerchantOpsResult {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
    },
    body,
  };
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.agentId === "string" &&
    typeof value.agentName === "string" &&
    typeof value.resourceId === "string" &&
    typeof value.resourceName === "string" &&
    typeof value.amountUsd === "number" &&
    isNetwork(value.network) &&
    typeof value.wallet === "string" &&
    (value.status === "blocked" || value.status === "settled") &&
    typeof value.createdAt === "string" &&
    typeof value.settlementRef === "string" &&
    typeof value.riskNote === "string"
  );
}

function isNetwork(value: unknown): value is Network {
  return value === "base" || value === "base-sepolia" || value === "polygon";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
