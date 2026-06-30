import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  Code2,
  Copy,
  DatabaseZap,
  Download,
  KeyRound,
  Play,
  ReceiptText,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type {
  MerchantAuditEvent,
  MerchantOpsState,
  MerchantOpsStorageInfo,
} from "./lib/merchantOpsStore";
import {
  type ExchangeLine,
  type LedgerEntry,
  type Network,
  type PaymentChallenge,
  type RiskSettings,
  type SignerMode,
  agents,
  buildReconciliationEvents,
  createAuthorization,
  createChallenge,
  createLedgerEntry,
  createPayload,
  evaluateSigner,
  evaluateRisk,
  findDemoApiCredential,
  formatTime,
  ledgerToCsv,
  merchant,
  money,
  resources,
  rotateApiKey,
  starterApiKeys,
  starterLedger,
} from "./lib/x402Simulator";

type Phase = "idle" | "request" | "challenge" | "signature" | "settled" | "blocked";

type SignerState = "approved" | "expired" | "pending" | "ready" | "rejected";

type PaidApiBody = {
  data?: Record<string, unknown>;
  error?: string;
  paid?: number;
  payment?: Record<string, unknown>;
  settlementRef?: string;
};

const networks: Network[] = ["base-sepolia", "base", "polygon"];

const signerModes: Array<{ id: SignerMode; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "review", label: "Review" },
  { id: "reject", label: "Reject" },
  { id: "expire", label: "Expire" },
];

const starterExchange: ExchangeLine[] = [
  {
    id: "idle",
    tone: "request",
    label: "Ready",
    title: "Waiting for an agent purchase",
    body: "Select an agent, choose a paid API resource, then run the x402 flow.",
  },
];

const defaultStorageInfo: MerchantOpsStorageInfo = {
  detail: "Server state has not synced yet",
  driver: "memory",
  durable: false,
  label: "Pending sync",
};

function App() {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id);
  const [selectedResourceId, setSelectedResourceId] = useState(resources[0].id);
  const [network, setNetwork] = useState<Network>("base-sepolia");
  const [riskSettings, setRiskSettings] = useState<RiskSettings>({
    allowlistedOnly: true,
    autopay: true,
    spendCapUsd: 0.25,
  });
  const [ledger, setLedger] = useState<LedgerEntry[]>(starterLedger);
  const [exchange, setExchange] = useState<ExchangeLine[]>(starterExchange);
  const [phase, setPhase] = useState<Phase>("idle");
  const [isRunning, setIsRunning] = useState(false);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [signerMode, setSignerMode] = useState<SignerMode>("auto");
  const [signerState, setSignerState] = useState<SignerState>("ready");
  const [apiKeys, setApiKeys] = useState(starterApiKeys);
  const [auditEvents, setAuditEvents] = useState<MerchantAuditEvent[]>([]);
  const [opsSyncedAt, setOpsSyncedAt] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<MerchantOpsStorageInfo>(defaultStorageInfo);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedResource =
    resources.find((resource) => resource.id === selectedResourceId) ?? resources[0];

  const settledLedger = useMemo(
    () => ledger.filter((entry) => entry.status === "settled"),
    [ledger],
  );

  const revenue = useMemo(
    () => settledLedger.reduce((sum, entry) => sum + entry.amountUsd, 0),
    [settledLedger],
  );

  const blockedCount = ledger.filter((entry) => entry.status === "blocked").length;
  const spentByAgent = settledLedger
    .filter((entry) => entry.agentId === selectedAgent.id)
    .reduce((sum, entry) => sum + entry.amountUsd, 0);
  const policyPreview = evaluateRisk(selectedAgent, selectedResource, ledger, riskSettings);
  const signerCopy = signerStateCopy(signerState, signerMode);
  const reconciliationEvents = useMemo(() => buildReconciliationEvents(ledger), [ledger]);

  useEffect(() => {
    void refreshMerchantState();
  }, []);

  async function runPurchase() {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setPayload(null);
    setExchange([]);
    setPhase("request");
    setSignerState("ready");

    const apiUrl = protectedResourceUrl(selectedAgent.id, selectedResource.id, network);
    const apiCredential = findDemoApiCredential(selectedResource.id);
    const apiKey = apiCredential?.secret ?? "";

    appendExchange({
      tone: "request",
      label: "GET",
      method: "GET",
      title: apiUrl,
      body: JSON.stringify(
        {
          agent: selectedAgent.name,
          route: selectedResource.path,
          wallet: selectedAgent.wallet,
          "X-API-Key": maskApiKey(apiKey),
          accept: "application/json",
          payment: null,
        },
        null,
        2,
      ),
    });

    await sleep(500);
    const challengeResponse = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    });
    const challenge =
      challengeResponse.status === 402
        ? ((await challengeResponse.json()) as PaymentChallenge)
        : createChallenge(selectedAgent, selectedResource, network);
    setPhase("challenge");
    appendExchange({
      tone: "challenge",
      label: "402",
      status: 402,
      title: "Payment Required",
      body: JSON.stringify(
        {
          status: challengeResponse.status,
          "X-402-Version": challengeResponse.headers.get("X-402-Version"),
          ...challenge,
        },
        null,
        2,
      ),
    });

    await sleep(650);
    const risk = evaluateRisk(selectedAgent, selectedResource, ledger, riskSettings);

    if (!risk.allowed) {
      const blocked = createLedgerEntry(
        selectedAgent,
        selectedResource,
        network,
        "blocked",
        risk.note,
      );
      await persistLedgerEntry(blocked);
      setPhase("blocked");
      appendExchange({
        tone: "blocked",
        label: "Policy",
        status: 403,
        title: "Autopay blocked",
        body: JSON.stringify(
          {
            reason: risk.note,
            spendCap: money(riskSettings.spendCapUsd),
            allowlistedOnly: riskSettings.allowlistedOnly,
          },
          null,
          2,
        ),
      });
      setIsRunning(false);
      return;
    }

    const requirement = challenge.accepts[0];
    setPhase("signature");
    setSignerState("pending");
    appendExchange({
      tone: "signature",
      label: "Signer",
      title: "Wallet approval pending",
      body: JSON.stringify(
        {
          mode: signerMode,
          wallet: selectedAgent.wallet,
          amount: money(selectedResource.priceUsd),
          resource: selectedResource.name,
          validForSeconds: requirement.maxTimeoutSeconds,
        },
        null,
        2,
      ),
    });

    await sleep(signerMode === "review" ? 900 : 450);
    const signerDecision = evaluateSigner(signerMode, selectedAgent, selectedResource);

    if (signerDecision.status !== "approved") {
      const blocked = createLedgerEntry(
        selectedAgent,
        selectedResource,
        network,
        "blocked",
        signerDecision.note,
      );
      await persistLedgerEntry(blocked);
      setSignerState(signerDecision.status);
      setPhase("blocked");
      appendExchange({
        tone: "blocked",
        label: "Signer",
        status: signerDecision.status === "expired" ? 408 : 401,
        title:
          signerDecision.status === "expired"
            ? "Wallet authorization expired"
            : "Wallet authorization rejected",
        body: JSON.stringify(
          {
            mode: signerMode,
            status: signerDecision.status,
            reason: signerDecision.note,
            wallet: selectedAgent.wallet,
          },
          null,
          2,
        ),
      });
      setIsRunning(false);
      return;
    }

    setSignerState("approved");
    const authorization = createAuthorization(selectedAgent, requirement);
    appendExchange({
      tone: "signature",
      label: "X-PAYMENT",
      method: "GET",
      title: "Signed authorization attached",
      body: JSON.stringify(
        {
          signer: signerDecision.note,
          header: `${authorization.header.slice(0, 54)}...`,
          payload: authorization.payload,
        },
        null,
        2,
      ),
    });

    await sleep(700);
    const paidResponse = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
        "X-PAYMENT": authorization.header,
      },
    });
    const paidBody = (await paidResponse.json()) as PaidApiBody;
    const settlementRef =
      paidResponse.headers.get("X-PAYMENT-RESPONSE") ??
      paidBody.settlementRef ??
      `client_${Date.now().toString(16).slice(-8)}`;
    const entry = {
      ...createLedgerEntry(selectedAgent, selectedResource, network, "settled", risk.note),
      settlementRef,
    };
    const nextPayload = paidBody.data ?? createPayload(selectedResource, settlementRef);
    await persistLedgerEntry(entry);
    setPayload(nextPayload);
    setPhase("settled");
    appendExchange({
      tone: "success",
      label: "200",
      status: 200,
      title: "Resource delivered",
      body: JSON.stringify(
        {
          status: paidResponse.status,
          "X-PAYMENT-RESPONSE": settlementRef,
          paid: money(entry.amountUsd),
          ...paidBody,
        },
        null,
        2,
      ),
    });

    setIsRunning(false);
  }

  async function refreshMerchantState() {
    try {
      const response = await fetch("/api/merchant-ops", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Merchant ops state failed to load");
      }

      hydrateMerchantState((await response.json()) as MerchantOpsState);
    } catch {
      setOpsSyncedAt(null);
    }
  }

  async function postMerchantAction(body: Record<string, unknown>): Promise<MerchantOpsState> {
    const response = await fetch("/api/merchant-ops", {
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Merchant operation failed");
    }

    return (await response.json()) as MerchantOpsState;
  }

  async function persistLedgerEntry(entry: LedgerEntry) {
    try {
      hydrateMerchantState(
        await postMerchantAction({
          action: "append-ledger",
          entry,
        }),
      );
    } catch {
      setLedger((items) => {
        const next = [entry, ...items];
        return next;
      });
      setOpsSyncedAt(null);
    }
  }

  function hydrateMerchantState(state: MerchantOpsState) {
    setLedger(state.ledger);
    setApiKeys(state.apiKeys);
    setAuditEvents(state.auditEvents);
    setStorageInfo(state.storage ?? defaultStorageInfo);
    setOpsSyncedAt(state.updatedAt);
  }

  function appendExchange(line: Omit<ExchangeLine, "id">) {
    setExchange((items) => [
      ...items,
      {
        id: `${line.label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...line,
      },
    ]);
  }

  async function resetDemo() {
    setLedger(starterLedger);
    setExchange(starterExchange);
    setPayload(null);
    setPhase("idle");
    setSignerState("ready");
    setApiKeys(starterApiKeys);

    try {
      hydrateMerchantState(
        await postMerchantAction({
          action: "reset",
        }),
      );
    } catch {
      setAuditEvents([]);
      setOpsSyncedAt(null);
    }
  }

  async function exportLedgerCsv() {
    let csv = ledgerToCsv(ledger);

    try {
      const response = await fetch("/api/merchant-ops?format=csv", {
        headers: {
          Accept: "text/csv",
        },
      });

      if (response.ok) {
        csv = await response.text();
      }
    } catch {
      csv = ledgerToCsv(ledger);
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agentpay-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function rotateMerchantKey(keyId: string) {
    try {
      hydrateMerchantState(
        await postMerchantAction({
          action: "rotate-key",
          keyId,
        }),
      );
    } catch {
      setApiKeys((keys) => rotateApiKey(keys, keyId));
      setOpsSyncedAt(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="desk-header">
        <div className="brand-lockup">
          <div className="brand-mark">402</div>
          <div>
            <p className="eyebrow">Stablecoin machine payments</p>
            <h1>AgentPay Desk</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="merchant-pill">
            <ServerCog size={16} />
            <span>{merchant.name}</span>
          </div>
          <button className="icon-button" type="button" onClick={resetDemo} aria-label="Reset demo">
            <RefreshCcw size={18} />
          </button>
        </div>
      </header>

      <section className="metrics-strip" aria-label="Merchant payment metrics">
        <Metric
          icon={<CircleDollarSign size={18} />}
          label="Settled revenue"
          value={money(revenue)}
          detail={`${settledLedger.length} paid calls`}
        />
        <Metric
          icon={<Activity size={18} />}
          label="402 challenges"
          value={String(ledger.length + (phase === "challenge" ? 1 : 0))}
          detail={`${blockedCount} policy blocks`}
        />
        <Metric
          icon={<WalletCards size={18} />}
          label="Agent balance"
          value={money(selectedAgent.balanceUsd - spentByAgent)}
          detail={`${money(selectedAgent.dailyLimitUsd)} daily limit`}
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Policy verdict"
          value={policyPreview.allowed ? "Ready" : "Blocked"}
          detail={policyPreview.note}
          tone={policyPreview.allowed ? "good" : "danger"}
        />
      </section>

      <section className="workspace-grid">
        <aside className="panel buyer-panel">
          <PanelHeader
            icon={<Bot size={19} />}
            kicker="Buyer"
            title="Agent control"
            detail="Autonomous client with a spending policy"
          />

          <div className="section-block">
            <div className="section-label">Agent wallet</div>
            <div className="agent-list">
              {agents.map((agent) => (
                <button
                  className={`agent-row ${agent.id === selectedAgent.id ? "selected" : ""}`}
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                >
                  <span className="agent-avatar">{agent.name.slice(0, 1)}</span>
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{agent.role}</small>
                  </span>
                  <span className="trust-score">{agent.trustScore}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="section-block">
            <div className="section-label">Paid API resource</div>
            <div className="resource-list">
              {resources.map((resource) => (
                <button
                  className={`resource-row ${
                    resource.id === selectedResource.id ? "selected" : ""
                  }`}
                  key={resource.id}
                  type="button"
                  onClick={() => setSelectedResourceId(resource.id)}
                >
                  <DatabaseZap size={17} />
                  <span>
                    <strong>{resource.name}</strong>
                    <small>
                      {resource.category} / {resource.latencyMs} ms
                    </small>
                  </span>
                  <b>{money(resource.priceUsd)}</b>
                </button>
              ))}
            </div>
          </div>

          <div className="section-block">
            <div className="section-label">Settlement network</div>
            <div className="segmented-control" role="group" aria-label="Settlement network">
              {networks.map((item) => (
                <button
                  className={network === item ? "active" : ""}
                  key={item}
                  type="button"
                  onClick={() => setNetwork(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="section-block">
            <div className="section-label">Wallet signer</div>
            <div className="segmented-control signer-control" role="group" aria-label="Wallet signer mode">
              {signerModes.map((mode) => (
                <button
                  className={signerMode === mode.id ? "active" : ""}
                  data-testid={`signer-mode-${mode.id}`}
                  disabled={isRunning}
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setSignerMode(mode.id);
                    setSignerState("ready");
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className={`signer-state ${signerState}`}>
              {signerState === "pending" ? <Clock3 size={16} /> : <KeyRound size={16} />}
              <span>
                <strong>{signerCopy.title}</strong>
                <small>{signerCopy.detail}</small>
              </span>
            </div>
          </div>

          <div className="policy-slab">
            <PolicyToggle
              checked={riskSettings.allowlistedOnly}
              label="Allowlist"
              onChange={() =>
                setRiskSettings((settings) => ({
                  ...settings,
                  allowlistedOnly: !settings.allowlistedOnly,
                }))
              }
            />
            <PolicyToggle
              checked={riskSettings.autopay}
              label="Autopay"
              onChange={() =>
                setRiskSettings((settings) => ({
                  ...settings,
                  autopay: !settings.autopay,
                }))
              }
            />
            <label className="cap-control">
              <span>Cap</span>
              <input
                max="0.5"
                min="0.05"
                onChange={(event) =>
                  setRiskSettings((settings) => ({
                    ...settings,
                    spendCapUsd: Number(event.target.value),
                  }))
                }
                step="0.01"
                type="range"
                value={riskSettings.spendCapUsd}
              />
              <strong>{money(riskSettings.spendCapUsd)}</strong>
            </label>
          </div>

          <button
            className="primary-action"
            data-testid="run-purchase"
            type="button"
            onClick={runPurchase}
            disabled={isRunning}
          >
            <Play size={18} fill="currentColor" />
            <span>{isRunning ? "Running flow" : "Run x402 purchase"}</span>
          </button>
        </aside>

        <section className="panel exchange-panel">
          <PanelHeader
            icon={<Code2 size={19} />}
            kicker="Protocol"
            title="HTTP exchange"
            detail="402 challenge, signed retry, settlement response"
          />

          <PhaseRail phase={phase} />

          <div className="exchange-feed" data-testid="exchange-feed">
            {exchange.map((line) => (
              <article className={`exchange-line ${line.tone}`} key={line.id}>
                <div className="line-meta">
                  <span>{line.label}</span>
                  {line.status ? <b>{line.status}</b> : null}
                </div>
                <div className="line-content">
                  <h3>{line.title}</h3>
                  <pre>{line.body}</pre>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel merchant-panel">
          <PanelHeader
            icon={<ReceiptText size={19} />}
            kicker="Seller"
            title="Merchant ledger"
            detail="Paid API calls and policy outcomes"
          />

          <div className="seller-account">
            <div>
              <span>Pay-to account</span>
              <strong>{merchant.payTo}</strong>
            </div>
            <button className="icon-button small" type="button" aria-label="Copy pay-to account">
              <Copy size={15} />
            </button>
          </div>

          <div className="ledger-toolbar">
            <button
              className="secondary-action"
              data-testid="export-ledger"
              type="button"
              onClick={exportLedgerCsv}
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <span>{ledger.length} records</span>
          </div>

          <div className="ledger-list" data-testid="ledger-list">
            {ledger.map((entry) => (
              <article className="ledger-row" key={entry.id}>
                <div className={`status-dot ${entry.status}`}>
                  {entry.status === "settled" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                </div>
                <div>
                  <strong>{entry.resourceName}</strong>
                  <span>
                    {entry.agentName} / {entry.network} / {formatTime(entry.createdAt)}
                  </span>
                  <small>{entry.riskNote}</small>
                </div>
                <b>{entry.status === "settled" ? money(entry.amountUsd) : "Held"}</b>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="bottom-grid">
        <article className="panel payload-panel" data-testid="payload-panel">
          <PanelHeader
            icon={<DatabaseZap size={19} />}
            kicker="Response"
            title="Purchased payload"
            detail="Data is only released after payment settles"
          />
          {payload ? (
            <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
          ) : (
            <div className="empty-payload">
              <DatabaseZap size={28} />
              <span>No paid response yet</span>
            </div>
          )}
        </article>

        <article className="panel integration-panel">
          <PanelHeader
            icon={<ServerCog size={19} />}
            kicker="Upgrade path"
            title="Production wiring"
            detail="Where the simulator becomes a real x402 integration"
          />
          <div className="integration-steps">
            <div>
              <span>Seller</span>
              <p>Protect paid API routes with x402 middleware and publish exact USDC requirements.</p>
            </div>
            <div>
              <span>Agent</span>
              <p>Wrap fetch with an x402 client, connect a wallet signer, and retry with `X-PAYMENT`.</p>
            </div>
            <div>
              <span>Ledger</span>
              <p>Store `X-PAYMENT-RESPONSE`, invoice metadata, agent policy result, and payload hash.</p>
            </div>
          </div>
        </article>

        <article className="panel operations-panel" data-testid="operations-panel">
          <PanelHeader
            icon={<KeyRound size={19} />}
            kicker="Merchant ops"
            title="API keys & webhooks"
            detail={
              opsSyncedAt
                ? `Server state synced ${formatTime(opsSyncedAt)}`
                : "Access control and settlement reconciliation"
            }
          />

          <div className="ops-stack">
            <div
              className={`storage-adapter ${storageInfo.durable ? "durable" : "demo"}`}
              data-testid="storage-adapter"
            >
              <ServerCog size={16} />
              <div>
                <span>Storage adapter</span>
                <strong>{storageInfo.label}</strong>
                <small>{storageInfo.detail}</small>
              </div>
              <b>{storageInfo.durable ? "Durable" : "Demo"}</b>
            </div>

            <div className="ops-block">
              <div className="ops-heading">
                <span>API keys</span>
                <b>{apiKeys.length} keys</b>
              </div>
              <div className="api-key-list">
                {apiKeys.map((apiKey) => (
                  <article className={`api-key-row ${apiKey.status}`} key={apiKey.id}>
                    <div>
                      <strong>{apiKey.name}</strong>
                      <span>{apiKey.prefix}...</span>
                      <small>{resourceNames(apiKey.resourceIds)}</small>
                    </div>
                    <div className="key-meta">
                      <b>{apiKey.status}</b>
                      <small>{apiKey.requests30d.toLocaleString()} calls</small>
                    </div>
                    <button
                      className="mini-action"
                      data-testid={`rotate-key-${apiKey.id}`}
                      type="button"
                      onClick={() => {
                        void rotateMerchantKey(apiKey.id);
                      }}
                    >
                      Rotate
                    </button>
                  </article>
                ))}
              </div>
            </div>

            <div className="ops-block">
              <div className="ops-heading">
                <span>Webhook events</span>
                <b>{reconciliationEvents.length} recent</b>
              </div>
              <div className="event-list" data-testid="event-list">
                {reconciliationEvents.map((event) => (
                  <article className={`event-row ${event.status}`} key={event.id}>
                    <div>
                      <strong>{event.type}</strong>
                      <span>{event.resourceName}</span>
                      <small>{event.detail}</small>
                    </div>
                    <b>{event.status}</b>
                  </article>
                ))}
              </div>
            </div>

            <div className="ops-block">
              <div className="ops-heading">
                <span>Audit trail</span>
                <b>{auditEvents.length} events</b>
              </div>
              <div className="event-list" data-testid="audit-list">
                {auditEvents.slice(0, 4).map((event) => (
                  <article className="event-row delivered" key={event.id}>
                    <div>
                      <strong>{event.action}</strong>
                      <span>{event.actor}</span>
                      <small>{event.detail}</small>
                    </div>
                    <b>{formatTime(event.createdAt)}</b>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function PanelHeader({
  detail,
  icon,
  kicker,
  title,
}: {
  detail: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="panel-header">
      <div className="header-icon">{icon}</div>
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function Metric({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: React.ReactNode;
  label: string;
  tone?: "good" | "danger";
  value: string;
}) {
  return (
    <article className={`metric ${tone ?? ""}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function PolicyToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      className={`policy-toggle ${checked ? "active" : ""}`}
      type="button"
      onClick={onChange}
      aria-pressed={checked}
    >
      <span />
      {label}
    </button>
  );
}

function PhaseRail({ phase }: { phase: Phase }) {
  const steps: Array<{ id: Phase; label: string }> = [
    { id: "request", label: "GET" },
    { id: "challenge", label: "402" },
    { id: "signature", label: "Pay" },
    { id: phase === "blocked" ? "blocked" : "settled", label: phase === "blocked" ? "Hold" : "200" },
  ];
  const activeIndex = Math.max(
    steps.findIndex((step) => step.id === phase),
    phase === "idle" ? -1 : 0,
  );

  return (
    <div className="phase-rail" aria-label="Payment flow phase">
      {steps.map((step, index) => (
        <div
          className={`phase-step ${
            index <= activeIndex || phase === "settled" ? "complete" : ""
          } ${step.id === phase ? "current" : ""}`}
          key={`${step.id}-${step.label}`}
        >
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function signerStateCopy(
  state: SignerState,
  mode: SignerMode,
): { detail: string; title: string } {
  if (state === "pending") {
    return {
      title: "Signature pending",
      detail: mode === "review" ? "Manual review is simulating wallet approval." : "Signer is checking policy.",
    };
  }

  if (state === "approved") {
    return {
      title: "Payment signed",
      detail: "X-PAYMENT can be attached to the retry request.",
    };
  }

  if (state === "rejected") {
    return {
      title: "Signature rejected",
      detail: "Payment is blocked before funds can move.",
    };
  }

  if (state === "expired") {
    return {
      title: "Approval expired",
      detail: "The authorization window closed before signing.",
    };
  }

  return {
    title: "Signer ready",
    detail: `${modeLabel(mode)} mode controls the next payment approval.`,
  };
}

function modeLabel(mode: SignerMode): string {
  return signerModes.find((item) => item.id === mode)?.label ?? "Auto";
}

function resourceNames(resourceIds: string[]): string {
  return resourceIds
    .map((id) => resources.find((resource) => resource.id === id)?.name ?? id)
    .join(", ");
}

function protectedResourceUrl(agentId: string, resourceId: string, network: Network): string {
  const params = new URLSearchParams({
    agentId,
    resourceId,
    network,
  });

  return `/api/protected-resource?${params.toString()}`;
}

function maskApiKey(value: string): string {
  if (!value) {
    return "missing";
  }

  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

export default App;
