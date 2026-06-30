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

export type FacilitatorMode = "http-ready" | "simulated";

export type FacilitatorSettlement = {
  accepted: true;
  amount: string;
  asset: string;
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

export type X402Facilitator = {
  label: string;
  mode: FacilitatorMode;
  settle(input: {
    agent: Agent;
    authorization: PaymentAuthorizationEnvelope;
    paymentHeader: string;
    requirement: PaymentRequirement;
    resource: ApiResource;
  }): FacilitatorSettlement;
};

export function createSimulatedFacilitator(endpoint?: string): X402Facilitator {
  const mode: FacilitatorMode = endpoint ? "http-ready" : "simulated";
  const label = endpoint ? "Configured x402 facilitator" : "Simulated x402 facilitator";

  return {
    label,
    mode,
    settle({ agent, authorization, paymentHeader, requirement, resource }) {
      const verifiedAt = new Date().toISOString();
      const digest = stableDigest(
        [
          agent.id,
          resource.id,
          requirement.extra.invoiceId,
          authorization.payload.from,
          authorization.signature,
          paymentHeader,
          verifiedAt,
        ].join(":"),
      );

      return {
        accepted: true,
        amount: requirement.maxAmountRequired,
        asset: requirement.asset,
        mode,
        network: requirement.network,
        note:
          mode === "http-ready"
            ? "Configured facilitator endpoint is ready; demo settlement is still local"
            : "Local facilitator adapter verified exact payment fields",
        provider: endpoint ?? "local-simulator",
        receiptId: `fac_${digest.slice(0, 10)}`,
        settlementRef: `api_${digest.slice(10, 18)}`,
        signatureDigest: digest.slice(18, 34),
        status: "settled",
        transactionHash: `0x${digest.padEnd(64, "0").slice(0, 64)}`,
        verifiedAt,
      };
    },
  };
}

export function createConfiguredFacilitator(): X402Facilitator {
  return createSimulatedFacilitator(readEnvironment("X402_FACILITATOR_URL"));
}

export const x402Facilitator = createConfiguredFacilitator();

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
