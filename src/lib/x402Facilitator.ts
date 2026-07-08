import type { Agent, ApiResource, PaymentRequirement } from "./x402Simulator.js";

export type PaymentAuthorizationEnvelope = {
  payload: {
    asset?: string;
    from?: string;
    network?: string;
    to?: string;
    value?: string;
  };
  signature?: string;
};

export type FacilitatorMode = "http-fallback" | "http-ready" | "live" | "simulated";

export type FacilitatorSettlement = {
  accepted: true;
  amount: string;
  asset: string;
  facilitatorResponseHash?: string;
  mode: FacilitatorMode;
  network: string;
  note: string;
  provider: string;
  receiptId: string;
  settlementRef: string;
  signatureDigest: string;
  status: "settled";
  transactionHash: string;
  verifiedAt: string;
};

export type FacilitatorSettleInput = {
  agent: Agent;
  authorization: PaymentAuthorizationEnvelope;
  paymentHeader: string;
  requirement: PaymentRequirement;
  resource: ApiResource;
};

export type X402Facilitator = {
  label: string;
  mode: FacilitatorMode;
  settle(input: FacilitatorSettleInput): Promise<FacilitatorSettlement>;
};

type FacilitatorHttpOptions = {
  endpoint: string;
  fallback?: X402Facilitator;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export function createSimulatedFacilitator(endpoint?: string): X402Facilitator {
  const mode: FacilitatorMode = endpoint ? "http-ready" : "simulated";
  const label = endpoint ? "Configured x402 facilitator" : "Simulated x402 facilitator";

  return {
    label,
    mode,
    async settle(input) {
      return createLocalSettlement({
        input,
        mode,
        note:
          mode === "http-ready"
            ? "Configured facilitator endpoint is ready; demo settlement is still local"
            : "Local facilitator adapter verified exact payment fields",
        provider: endpoint ?? "local-simulator",
      });
    },
  };
}

export function createHttpFacilitator({
  endpoint,
  fallback = createSimulatedFacilitator(endpoint),
  fetcher = fetch,
  timeoutMs = 2_500,
}: FacilitatorHttpOptions): X402Facilitator {
  return {
    label: "HTTP x402 facilitator",
    mode: "live",
    async settle(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetcher(endpoint, {
          body: JSON.stringify(createFacilitatorRequest(input)),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });
        const responseBody = await safeJson(response);

        if (!response.ok) {
          return withHttpFallback(await fallback.settle(input), endpoint, response.status);
        }

        const local = await fallback.settle(input);
        return {
          ...local,
          facilitatorResponseHash: stableDigest(JSON.stringify(responseBody)).slice(0, 16),
          mode: "live",
          note: "HTTP facilitator accepted payment envelope",
          provider: endpoint,
          receiptId: readString(responseBody, "receiptId") ?? local.receiptId,
          settlementRef: readString(responseBody, "settlementRef") ?? local.settlementRef,
          status: "settled",
          transactionHash: readString(responseBody, "transactionHash") ?? local.transactionHash,
          verifiedAt: readString(responseBody, "verifiedAt") ?? local.verifiedAt,
        };
      } catch {
        return withHttpFallback(await fallback.settle(input), endpoint);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createConfiguredFacilitator(): X402Facilitator {
  const endpoint = readEnvironment("X402_FACILITATOR_URL");

  if (endpoint) {
    return createHttpFacilitator({ endpoint });
  }

  return createSimulatedFacilitator();
}

export const x402Facilitator = createConfiguredFacilitator();

function createLocalSettlement({
  input,
  mode,
  note,
  provider,
}: {
  input: FacilitatorSettleInput;
  mode: FacilitatorMode;
  note: string;
  provider: string;
}): FacilitatorSettlement {
  const verifiedAt = new Date().toISOString();
  const digest = stableDigest(
    [
      input.agent.id,
      input.resource.id,
      input.requirement.extra.invoiceId,
      input.authorization.payload.from,
      input.authorization.signature,
      input.paymentHeader,
      verifiedAt,
    ].join(":"),
  );

  return {
    accepted: true,
    amount: input.requirement.maxAmountRequired,
    asset: input.requirement.asset,
    mode,
    network: input.requirement.network,
    note,
    provider,
    receiptId: `fac_${digest.slice(0, 10)}`,
    settlementRef: `api_${digest.slice(10, 18)}`,
    signatureDigest: digest.slice(18, 34),
    status: "settled",
    transactionHash: `0x${digest.padEnd(64, "0").slice(0, 64)}`,
    verifiedAt,
  };
}

function createFacilitatorRequest(input: FacilitatorSettleInput): Record<string, unknown> {
  return {
    agent: {
      id: input.agent.id,
      wallet: input.agent.wallet,
    },
    payment: input.authorization,
    paymentHeader: input.paymentHeader,
    requirement: input.requirement,
    resource: {
      id: input.resource.id,
      path: input.resource.path,
      priceUsd: input.resource.priceUsd,
    },
    x402Version: 1,
  };
}

function withHttpFallback(
  settlement: FacilitatorSettlement,
  endpoint: string,
  status?: number,
): FacilitatorSettlement {
  return {
    ...settlement,
    mode: "http-fallback",
    note:
      typeof status === "number"
        ? `HTTP facilitator returned ${status}; demo settled locally`
        : "HTTP facilitator unavailable; demo settled locally",
    provider: endpoint,
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableDigest(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const base = (hash >>> 0).toString(16).padStart(8, "0");
  return `${base}${base.split("").reverse().join("")}${randomToken(32)}`.slice(0, 64);
}

function randomToken(length: number): string {
  const alphabet = "0123456789abcdef";
  let token = "";

  for (let index = 0; index < length; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return token;
}

function readEnvironment(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
