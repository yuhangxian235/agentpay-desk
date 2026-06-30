import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type LedgerEntry,
  type MerchantApiKey,
  type ReconciliationEvent,
  buildReconciliationEvents,
  ledgerToCsv,
  rotateApiKey,
  starterApiKeys,
  starterLedger,
} from "./x402Simulator.js";

export type MerchantOpsStorageInfo = {
  detail: string;
  driver: "file" | "memory";
  durable: boolean;
  label: string;
};

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
  storage: MerchantOpsStorageInfo;
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

  return createMerchantOpsRepository({
    readMutableState: () => state,
    storage: {
      detail: "Process-local demo state; set MERCHANT_OPS_STORE=file for local persistence",
      driver: "memory",
      durable: false,
      label: "In-memory demo",
    },
    writeMutableState: (nextState) => {
      state = cloneMutableState(nextState);
    },
  });
}

export function createFileMerchantOpsRepository(filePath = ".agentpay/merchant-ops.json"): MerchantOpsRepository {
  const resolvedPath = resolve(filePath);

  return createMerchantOpsRepository({
    readMutableState: () => readFileState(resolvedPath),
    storage: {
      detail: `Persists merchant state to ${resolvedPath}`,
      driver: "file",
      durable: true,
      label: "File-backed JSON",
    },
    writeMutableState: (nextState) => {
      writeFileState(resolvedPath, nextState);
    },
  });
}

export function createConfiguredMerchantOpsRepository(): MerchantOpsRepository {
  const store = readEnvironment("MERCHANT_OPS_STORE")?.toLowerCase();

  if (store === "file") {
    return createFileMerchantOpsRepository(readEnvironment("MERCHANT_OPS_FILE"));
  }

  return createInMemoryMerchantOpsRepository();
}

export const merchantOpsRepository = createConfiguredMerchantOpsRepository();

type MerchantOpsRepositoryInternals = {
  readMutableState: () => MutableMerchantOpsState;
  storage: MerchantOpsStorageInfo;
  writeMutableState: (state: MutableMerchantOpsState) => void;
};

function createMerchantOpsRepository({
  readMutableState,
  storage,
  writeMutableState,
}: MerchantOpsRepositoryInternals): MerchantOpsRepository {
  return {
    appendLedgerEntry(entry) {
      let state = readMutableState();
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
      writeMutableState(state);

      return snapshot(state, storage);
    },

    exportLedgerCsv() {
      const state = readMutableState();

      return ledgerToCsv(state.ledger);
    },

    readState() {
      return snapshot(readMutableState(), storage);
    },

    reset() {
      const state = {
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
      writeMutableState(state);

      return snapshot(state, storage);
    },

    rotateApiKey(keyId) {
      let state = readMutableState();
      const key = state.apiKeys.find((item) => item.id === keyId);

      if (!key) {
        return snapshot(state, storage);
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
      writeMutableState(state);

      return snapshot(state, storage);
    },
  };
}

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

function snapshot(state: MutableMerchantOpsState, storage: MerchantOpsStorageInfo): MerchantOpsState {
  return {
    apiKeys: state.apiKeys.map(cloneApiKey),
    auditEvents: state.auditEvents.map((event) => ({ ...event })),
    ledger: state.ledger.map(cloneLedgerEntry),
    reconciliationEvents: buildReconciliationEvents(state.ledger),
    storage: { ...storage },
    updatedAt: state.updatedAt,
    version: state.version,
  };
}

function readFileState(filePath: string): MutableMerchantOpsState {
  if (!existsSync(filePath)) {
    const state = createInitialState();
    writeFileState(filePath, state);
    return state;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;

    if (isPersistedMerchantOpsState(parsed)) {
      return cloneMutableState(parsed);
    }
  } catch {
    // Fall through to a seeded recovery state below.
  }

  const recoveredState = {
    ...createInitialState(),
    auditEvents: [
      createAuditEvent({
        action: "state.reset",
        actor: "system",
        detail: "Invalid merchant store recovered from seed data",
        targetId: "merchant_state",
      }),
    ],
  };
  writeFileState(filePath, recoveredState);
  return recoveredState;
}

function writeFileState(filePath: string, state: MutableMerchantOpsState): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.${randomId()}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({ schemaVersion: 1, ...cloneMutableState(state) }, null, 2)}\n`,
    "utf8",
  );
  renameSync(temporaryPath, filePath);
}

function cloneMutableState(state: MutableMerchantOpsState): MutableMerchantOpsState {
  return {
    apiKeys: state.apiKeys.map(cloneApiKey),
    auditEvents: state.auditEvents.map((event) => ({ ...event })),
    ledger: state.ledger.map(cloneLedgerEntry),
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

function isPersistedMerchantOpsState(value: unknown): value is MutableMerchantOpsState {
  return (
    isRecord(value) &&
    Array.isArray(value.apiKeys) &&
    Array.isArray(value.auditEvents) &&
    Array.isArray(value.ledger) &&
    typeof value.updatedAt === "string" &&
    typeof value.version === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readEnvironment(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
