import {
  type Network,
  createChallenge,
  createPayload,
  merchant,
  resources,
  agents,
  verifyApiKey,
} from "./x402Simulator.js";
import {
  type PaymentAuthorizationEnvelope,
  x402Facilitator,
} from "./x402Facilitator.js";

type ProtectedResourceInput = {
  agentId: string | null;
  apiKeyHeader?: string | null;
  resourceId: string | null;
  network: string | null;
  paymentHeader?: string | null;
};

type ProtectedResourceResult = {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  status: 200 | 400 | 401 | 402 | 403;
};

const networks: Network[] = ["base", "base-sepolia", "polygon"];

export function handleProtectedResource(input: ProtectedResourceInput): ProtectedResourceResult {
  const agent = agents.find((item) => item.id === input.agentId);
  const resource = resources.find((item) => item.id === input.resourceId);
  const network = networks.find((item) => item === input.network);

  if (!agent || !resource || !network) {
    return {
      status: 400,
      headers: {},
      body: {
        error: "Invalid protected resource request",
        acceptedAgentIds: agents.map((item) => item.id),
        acceptedResourceIds: resources.map((item) => item.id),
        acceptedNetworks: networks,
      },
    };
  }

  const apiKeyVerdict = verifyApiKey(input.apiKeyHeader, resource.id);

  if (apiKeyVerdict.allowed === false) {
    const status = apiKeyVerdict.status;

    return {
      status,
      headers:
        status === 401
          ? {
              "WWW-Authenticate": 'ApiKey realm="Northstar Data Market"',
            }
          : {},
      body: {
        error: apiKeyVerdict.note,
        resourceId: resource.id,
        requiredHeader: "X-API-Key",
      },
    };
  }

  const challenge = createChallenge(agent, resource, network);
  const requirement = challenge.accepts[0];

  if (!input.paymentHeader) {
    return {
      status: 402,
      headers: {
        "X-402-Version": "1",
      },
      body: challenge,
    };
  }

  const decoded = decodePaymentHeader(input.paymentHeader);

  if (
    !decoded ||
    decoded.payload.to !== merchant.payTo ||
    decoded.payload.value !== requirement.maxAmountRequired ||
    decoded.payload.network !== network ||
    decoded.payload.asset !== "USDC"
  ) {
    return {
      status: 400,
      headers: {},
      body: {
        error: "Invalid X-PAYMENT authorization",
        expected: {
          payTo: merchant.payTo,
          value: requirement.maxAmountRequired,
          network,
          asset: "USDC",
        },
      },
    };
  }

  const settlement = x402Facilitator.settle({
    agent,
    authorization: decoded,
    paymentHeader: input.paymentHeader,
    requirement,
    resource,
  });
  const settlementRef = settlement.settlementRef;
  const payload = createPayload(resource, settlementRef);

  return {
    status: 200,
    headers: {
      "X-FACILITATOR-RECEIPT": settlement.receiptId,
      "X-PAYMENT-RESPONSE": settlementRef,
    },
    body: {
      settlementRef,
      paid: resource.priceUsd,
      data: payload,
      facilitator: {
        mode: settlement.mode,
        note: settlement.note,
        provider: settlement.provider,
        receiptId: settlement.receiptId,
        status: settlement.status,
        transactionHash: settlement.transactionHash,
        verifiedAt: settlement.verifiedAt,
      },
      apiKey: {
        keyId: apiKeyVerdict.keyId,
        validated: true,
      },
      payment: {
        validated: true,
        from: decoded.payload.from,
        network: decoded.payload.network,
        value: decoded.payload.value,
        asset: decoded.payload.asset,
        facilitatorReceipt: settlement.receiptId,
      },
    },
  };
}

function decodePaymentHeader(header: string): PaymentAuthorizationEnvelope | null {
  try {
    const decoded = JSON.parse(atob(header)) as {
      payload?: {
        asset?: string;
        from?: string;
        network?: string;
        to?: string;
        value?: string;
      };
      signature?: string;
    };

    if (!decoded.payload) {
      return null;
    }

    return { payload: decoded.payload, signature: decoded.signature };
  } catch {
    return null;
  }
}
