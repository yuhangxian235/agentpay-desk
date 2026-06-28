import {
  type Network,
  createChallenge,
  createPayload,
  merchant,
  resources,
  agents,
} from "./x402Simulator.js";

type ProtectedResourceInput = {
  agentId: string | null;
  resourceId: string | null;
  network: string | null;
  paymentHeader?: string | null;
};

type ProtectedResourceResult = {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  status: 200 | 400 | 402;
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

  const settlementRef = `api_${Date.now().toString(16).slice(-8)}`;
  const payload = createPayload(resource, settlementRef);

  return {
    status: 200,
    headers: {
      "X-PAYMENT-RESPONSE": settlementRef,
    },
    body: {
      settlementRef,
      paid: resource.priceUsd,
      data: payload,
      payment: {
        validated: true,
        from: decoded.payload.from,
        network: decoded.payload.network,
        value: decoded.payload.value,
        asset: decoded.payload.asset,
      },
    },
  };
}

function decodePaymentHeader(header: string):
  | {
      payload: {
        asset?: string;
        from?: string;
        network?: string;
        to?: string;
        value?: string;
      };
    }
  | null {
  try {
    const decoded = JSON.parse(atob(header)) as {
      payload?: {
        asset?: string;
        from?: string;
        network?: string;
        to?: string;
        value?: string;
      };
    };

    if (!decoded.payload) {
      return null;
    }

    return { payload: decoded.payload };
  } catch {
    return null;
  }
}
