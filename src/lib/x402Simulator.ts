export type Network = "base" | "base-sepolia" | "polygon";

export type Agent = {
  id: string;
  name: string;
  role: string;
  wallet: string;
  balanceUsd: number;
  dailyLimitUsd: number;
  trustScore: number;
  allowlisted: boolean;
};

export type ApiResource = {
  id: string;
  name: string;
  path: string;
  category: string;
  priceUsd: number;
  latencyMs: number;
  description: string;
};

export type RiskSettings = {
  allowlistedOnly: boolean;
  autopay: boolean;
  spendCapUsd: number;
};

export type SignerMode = "auto" | "review" | "reject" | "expire";

export type SignerDecision =
  | {
      note: string;
      status: "approved";
    }
  | {
      note: string;
      status: "expired" | "rejected";
    };

export type PaymentRequirement = {
  scheme: "exact";
  network: Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: "application/json";
  payTo: string;
  maxTimeoutSeconds: number;
  asset: "USDC";
  extra: {
    invoiceId: string;
    seller: string;
    endpointId: string;
    createdAt: string;
  };
};

export type PaymentChallenge = {
  x402Version: 1;
  error: string;
  accepts: PaymentRequirement[];
};

export type PaymentAuthorization = {
  header: string;
  payload: {
    from: string;
    to: string;
    value: string;
    network: Network;
    asset: "USDC";
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
};

export type LedgerEntry = {
  id: string;
  agentId: string;
  agentName: string;
  resourceId: string;
  resourceName: string;
  amountUsd: number;
  network: Network;
  wallet: string;
  status: "settled" | "blocked";
  createdAt: string;
  settlementRef: string;
  riskNote: string;
};

export type MerchantApiKey = {
  id: string;
  name: string;
  prefix: string;
  resourceIds: string[];
  status: "active" | "rotating" | "revoked";
  lastUsedAt: string;
  requests30d: number;
};

export type ReconciliationEvent = {
  id: string;
  createdAt: string;
  detail: string;
  paymentId: string;
  resourceName: string;
  status: "delivered" | "pending" | "failed";
  type: "payment.held" | "settlement.received";
};

export type ExchangeLine = {
  id: string;
  tone: "request" | "challenge" | "signature" | "success" | "blocked";
  label: string;
  method?: string;
  status?: number;
  title: string;
  body: string;
};

export const merchant = {
  name: "Northstar Data Market",
  payTo: "0x9f3A...71D4",
  sellerId: "seller_northstar_402",
};

export const agents: Agent[] = [
  {
    id: "quanta-scout",
    name: "Quanta Scout",
    role: "Research agent",
    wallet: "0x71c4...F219",
    balanceUsd: 24.5,
    dailyLimitUsd: 3.5,
    trustScore: 92,
    allowlisted: true,
  },
  {
    id: "ledger-clerk",
    name: "Ledger Clerk",
    role: "Back-office agent",
    wallet: "0x44b8...A031",
    balanceUsd: 11.8,
    dailyLimitUsd: 1.25,
    trustScore: 87,
    allowlisted: true,
  },
  {
    id: "edge-crawler",
    name: "Edge Crawler",
    role: "New data buyer",
    wallet: "0xB09e...8C17",
    balanceUsd: 5.2,
    dailyLimitUsd: 0.4,
    trustScore: 53,
    allowlisted: false,
  },
];

export const resources: ApiResource[] = [
  {
    id: "rwa-yield",
    name: "Tokenized T-bill yield",
    path: "/api/feeds/rwa-yield",
    category: "RWA feed",
    priceUsd: 0.24,
    latencyMs: 220,
    description: "Latest tokenized treasury yield sample with issuer spread.",
  },
  {
    id: "wallet-risk",
    name: "Wallet risk score",
    path: "/api/risk/wallet-score",
    category: "Risk API",
    priceUsd: 0.18,
    latencyMs: 180,
    description: "Counterparty risk score and recent stablecoin flow markers.",
  },
  {
    id: "invoice-scan",
    name: "Freelancer invoice scan",
    path: "/api/payables/invoice-scan",
    category: "Ops API",
    priceUsd: 0.12,
    latencyMs: 150,
    description: "Extracted invoice fields for remote stablecoin payouts.",
  },
  {
    id: "fx-route",
    name: "Stablecoin route quote",
    path: "/api/routes/usdc-quote",
    category: "Payments API",
    priceUsd: 0.08,
    latencyMs: 120,
    description: "Best route quote for a small USDC payout across networks.",
  },
];

export const starterLedger: LedgerEntry[] = [
  {
    id: "pay_402_8471",
    agentId: "ledger-clerk",
    agentName: "Ledger Clerk",
    resourceId: "invoice-scan",
    resourceName: "Freelancer invoice scan",
    amountUsd: 0.12,
    network: "base-sepolia",
    wallet: "0x44b8...A031",
    status: "settled",
    createdAt: minutesAgo(18),
    settlementRef: "set_0x7f12",
    riskNote: "Within per-agent budget",
  },
  {
    id: "pay_402_8416",
    agentId: "quanta-scout",
    agentName: "Quanta Scout",
    resourceId: "wallet-risk",
    resourceName: "Wallet risk score",
    amountUsd: 0.18,
    network: "base",
    wallet: "0x71c4...F219",
    status: "settled",
    createdAt: minutesAgo(41),
    settlementRef: "set_0x2ac9",
    riskNote: "Allowlisted agent",
  },
  {
    id: "pay_402_8360",
    agentId: "edge-crawler",
    agentName: "Edge Crawler",
    resourceId: "rwa-yield",
    resourceName: "Tokenized T-bill yield",
    amountUsd: 0.24,
    network: "polygon",
    wallet: "0xB09e...8C17",
    status: "blocked",
    createdAt: minutesAgo(67),
    settlementRef: "rule_allowlist",
    riskNote: "Agent is not allowlisted",
  },
];

export const starterApiKeys: MerchantApiKey[] = [
  {
    id: "key_prod_data",
    name: "Production data APIs",
    prefix: "ak_live_7Qm9",
    resourceIds: ["rwa-yield", "wallet-risk"],
    status: "active",
    lastUsedAt: minutesAgo(9),
    requests30d: 1842,
  },
  {
    id: "key_ops_payables",
    name: "Payables ops APIs",
    prefix: "ak_live_D4p2",
    resourceIds: ["invoice-scan"],
    status: "active",
    lastUsedAt: minutesAgo(23),
    requests30d: 411,
  },
  {
    id: "key_routes_beta",
    name: "Routes beta",
    prefix: "ak_test_5Vx1",
    resourceIds: ["fx-route"],
    status: "rotating",
    lastUsedAt: minutesAgo(96),
    requests30d: 78,
  },
];

export function createChallenge(
  agent: Agent,
  resource: ApiResource,
  network: Network,
): PaymentChallenge {
  const invoiceId = `inv_${randomToken(8)}`;

  return {
    x402Version: 1,
    error: "X-PAYMENT header is required",
    accepts: [
      {
        scheme: "exact",
        network,
        maxAmountRequired: usdToUnits(resource.priceUsd),
        resource: `https://northstar.example${resource.path}`,
        description: `${resource.name} for ${agent.name}`,
        mimeType: "application/json",
        payTo: merchant.payTo,
        maxTimeoutSeconds: 300,
        asset: "USDC",
        extra: {
          invoiceId,
          seller: merchant.sellerId,
          endpointId: resource.id,
          createdAt: new Date().toISOString(),
        },
      },
    ],
  };
}

export function createAuthorization(
  agent: Agent,
  requirement: PaymentRequirement,
): PaymentAuthorization {
  const now = Date.now();
  const payload = {
    from: agent.wallet,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    network: requirement.network,
    asset: requirement.asset,
    validAfter: new Date(now - 10_000).toISOString(),
    validBefore: new Date(now + requirement.maxTimeoutSeconds * 1000).toISOString(),
    nonce: `0x${randomToken(24)}`,
  };

  return {
    payload,
    header: btoa(JSON.stringify({ payload, signature: `0x${randomToken(96)}` })),
  };
}

export function evaluateRisk(
  agent: Agent,
  resource: ApiResource,
  ledger: LedgerEntry[],
  settings: RiskSettings,
): { allowed: boolean; note: string } {
  const spentToday = ledger
    .filter((entry) => entry.agentId === agent.id && entry.status === "settled")
    .reduce((sum, entry) => sum + entry.amountUsd, 0);

  if (settings.allowlistedOnly && !agent.allowlisted) {
    return { allowed: false, note: "Agent is not allowlisted" };
  }

  if (!settings.autopay) {
    return { allowed: false, note: "Autopay is disabled" };
  }

  if (resource.priceUsd > settings.spendCapUsd) {
    return { allowed: false, note: "Endpoint price exceeds policy cap" };
  }

  if (spentToday + resource.priceUsd > agent.dailyLimitUsd) {
    return { allowed: false, note: "Daily agent budget would be exceeded" };
  }

  if (agent.balanceUsd < resource.priceUsd) {
    return { allowed: false, note: "Agent wallet has insufficient USDC" };
  }

  return { allowed: true, note: agent.allowlisted ? "Allowlisted agent" : "Policy exception approved" };
}

export function evaluateSigner(mode: SignerMode, agent: Agent, resource: ApiResource): SignerDecision {
  if (mode === "reject") {
    return {
      status: "rejected",
      note: "Wallet signer rejected authorization",
    };
  }

  if (mode === "expire") {
    return {
      status: "expired",
      note: "Wallet signer approval expired",
    };
  }

  if (mode === "review") {
    return {
      status: "approved",
      note: `${agent.name} approved ${resource.name} after manual review`,
    };
  }

  return {
    status: "approved",
    note: "Wallet signer auto-approved policy-compliant payment",
  };
}

export function createLedgerEntry(
  agent: Agent,
  resource: ApiResource,
  network: Network,
  status: LedgerEntry["status"],
  riskNote: string,
): LedgerEntry {
  return {
    id: `pay_402_${randomToken(4)}`,
    agentId: agent.id,
    agentName: agent.name,
    resourceId: resource.id,
    resourceName: resource.name,
    amountUsd: resource.priceUsd,
    network,
    wallet: agent.wallet,
    status,
    createdAt: new Date().toISOString(),
    settlementRef: status === "settled" ? `set_0x${randomToken(4)}` : "policy_block",
    riskNote,
  };
}

export function buildReconciliationEvents(entries: LedgerEntry[]): ReconciliationEvent[] {
  return entries.slice(0, 6).map((entry) => {
    if (entry.status === "settled") {
      return {
        id: `evt_${entry.id}`,
        createdAt: entry.createdAt,
        detail: `Settlement ${entry.settlementRef} delivered to merchant ledger`,
        paymentId: entry.id,
        resourceName: entry.resourceName,
        status: "delivered",
        type: "settlement.received",
      };
    }

    return {
      id: `evt_${entry.id}`,
      createdAt: entry.createdAt,
      detail: entry.riskNote,
      paymentId: entry.id,
      resourceName: entry.resourceName,
      status: "pending",
      type: "payment.held",
    };
  });
}

export function rotateApiKey(keys: MerchantApiKey[], keyId: string): MerchantApiKey[] {
  return keys.map((key) => {
    if (key.id !== keyId || key.status === "revoked") {
      return key;
    }

    return {
      ...key,
      prefix: `${key.prefix.slice(0, 8)}${randomToken(4)}`,
      status: "rotating",
      lastUsedAt: new Date().toISOString(),
    };
  });
}

export function createPayload(resource: ApiResource, settlementRef: string) {
  const issuedAt = new Date().toISOString();

  if (resource.id === "rwa-yield") {
    return {
      issuedAt,
      settlementRef,
      market: "tokenized_treasuries",
      netYield: "4.71%",
      issuerSpreadBps: 31,
      liquidity: "$1.8B sample",
    };
  }

  if (resource.id === "wallet-risk") {
    return {
      issuedAt,
      settlementRef,
      score: 82,
      verdict: "low risk",
      recentUsdcVolume: "$148,200",
      flags: ["no sanctions hit", "stablecoin-heavy activity"],
    };
  }

  if (resource.id === "invoice-scan") {
    return {
      issuedAt,
      settlementRef,
      invoiceId: "INV-2026-0619",
      payee: "Remote contributor",
      requestedUsdc: 820,
      dueInDays: 6,
    };
  }

  return {
    issuedAt,
    settlementRef,
    sourceNetwork: "Base",
    destinationNetwork: "Polygon",
    estimatedFeeUsd: 0.03,
    arrivalSeconds: 28,
  };
}

export function ledgerToCsv(entries: LedgerEntry[]): string {
  const headers = [
    "payment_id",
    "created_at",
    "status",
    "agent_name",
    "agent_wallet",
    "resource_name",
    "amount_usd",
    "network",
    "settlement_ref",
    "risk_note",
  ];
  const rows = entries.map((entry) => [
    entry.id,
    entry.createdAt,
    entry.status,
    entry.agentName,
    entry.wallet,
    entry.resourceName,
    entry.amountUsd.toFixed(2),
    entry.network,
    entry.settlementRef,
    entry.riskNote,
  ]);

  return [headers, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1 ? 2 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function usdToUnits(value: number): string {
  return String(Math.round(value * 1_000_000));
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function randomToken(length: number): string {
  const alphabet = "0123456789abcdef";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
