import {
  type LedgerEntry,
  type MerchantApiKey,
  type ReconciliationEvent,
  buildReconciliationEvents,
  ledgerToCsv,
  rotateApiKey,
  starterApiKeys,
  starterLedger,
} from "./x402Simulator";

export type MerchantAuditEvent = {
  id: string;
  action: "api_key.rotated" | "ledger.appended" | "state.reset";
  actor: "agent" | "merchant" | "system";
  createdAt: string;
  detail: string;
  targetId: string;
};

export type MerchantOpsState = {
  apiKeys: MerchantApiKey[];
  auditEvents: MerchantAuditEvent[];
  ledger: LedgerEntry[];
  reconciliationEvents: ReconciliationEvent[];
  updatedAt: string;
  version: number;
};

export type MerchantOpsRepository = {
  appendLedgerEntry(entry: LedgerEntry): MerchantOpsState;
  exportLedgerCsv(): string;
  readState(): MerchantOpsState;
  reset(): MerchantOpsState;
  rotateApiKey(keyId: string): MerchantOpsState;
};

type MutableMerchantOpsState = {
  apiKeys: MerchantApiKey[];
  auditEvents: MerchantAuditEvent[];
  ledger: LedgerEntry[];
  updatedAt: string;
  version: number;
};

export function createInMemoryMerchantOpsRepository(): MerchantOpsRepository {
  let state = createInitialState();

  return {
    appendLedgerEntry(entry) {
      state = {
        ...state,
        auditEvents: [
          createAuditEvent({
            action: "ledger.appended",
            actor: entry.status === "settled" ? "agent" : "system",
            detail: `${entry.status} payment for ${entry.resourceName}`,
            targetId: entry.id,
          }),
          ...state.auditEvents,
        ],
        ledger: [cloneLedgerEntry(entry), ...state.ledger],
        updatedAt: new Date().toISOString(),
        version: state.version + 1,
      };

      return snapshot(state);
    },

    exportLedgerCsv() {
      return ledgerToCsv(state.ledger);
    },

    readState() {
      return snapshot(state);
    },

    reset() {
      state = {
        ...createInitialState(),
        auditEvents: [
          createAuditEvent({
            action: "state.reset",
            actor: "system",
            detail: "Demo merchant state restored from seed data",
            targetId: "merchant_state",
          }),
        ],
      };

      return snapshot(state);
    },

    rotateApiKey(keyId) {
      const key = state.apiKeys.find((item) => item.id === keyId);

      if (!key) {
        return snapshot(state);
      }

      state = {
        ...state,
        apiKeys: rotateApiKey(state.apiKeys, keyId),
        auditEvents: [
          createAuditEvent({
            action: "api_key.rotated",
            actor: "merchant",
            detail: `Rotation started for ${key.name}`,
            targetId: key.id,
          }),
          ...state.auditEvents,
        ],
        updatedAt: new Date().toISOString(),
        version: state.version + 1,
      };

      return snapshot(state);
    },
  };
}

export const merchantOpsRepository = createInMemoryMerchantOpsRepository();

function createInitialState(): MutableMerchantOpsState {
  const createdAt = new Date().toISOString();

  return {
    apiKeys: starterApiKeys.map(cloneApiKey),
    auditEvents: [
      {
        id: "audit_seed",
        action: "state.reset",
        actor: "system",
        createdAt,
        detail: "Seed merchant state loaded",
        targetId: "merchant_state",
      },
    ],
    ledger: starterLedger.map(cloneLedgerEntry),
    updatedAt: createdAt,
    version: 1,
  };
}

function snapshot(state: MutableMerchantOpsState): MerchantOpsState {
  return {
    apiKeys: state.apiKeys.map(cloneApiKey),
    auditEvents: state.auditEvents.map((event) => ({ ...event })),
    ledger: state.ledger.map(cloneLedgerEntry),
    reconciliationEvents: buildReconciliationEvents(state.ledger),
    updatedAt: state.updatedAt,
    version: state.version,
  };
}

function cloneApiKey(key: MerchantApiKey): MerchantApiKey {
  return {
    ...key,
    resourceIds: [...key.resourceIds],
  };
}

function cloneLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry };
}

function createAuditEvent(input: Omit<MerchantAuditEvent, "createdAt" | "id">): MerchantAuditEvent {
  return {
    ...input,
    createdAt: new Date().toISOString(),
    id: `audit_${randomId()}`,
  };
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }

  return Math.random().toString(16).slice(2, 10);
}
