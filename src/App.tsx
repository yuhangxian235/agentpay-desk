import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Copy,
  DatabaseZap,
  Download,
  Play,
  ReceiptText,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import "./App.css";
import {
  type ExchangeLine,
  type LedgerEntry,
  type Network,
  type RiskSettings,
  agents,
  createAuthorization,
  createChallenge,
  createLedgerEntry,
  createPayload,
  evaluateRisk,
  formatTime,
  ledgerToCsv,
  merchant,
  money,
  resources,
  starterLedger,
} from "./lib/x402Simulator";

type Phase = "idle" | "request" | "challenge" | "signature" | "settled" | "blocked";

const networks: Network[] = ["base-sepolia", "base", "polygon"];

const starterExchange: ExchangeLine[] = [
  {
    id: "idle",
    tone: "request",
    label: "Ready",
    title: "Waiting for an agent purchase",
    body: "Select an agent, choose a paid API resource, then run the x402 flow.",
  },
];

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

  async function runPurchase() {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setPayload(null);
    setExchange([]);
    setPhase("request");

    appendExchange({
      tone: "request",
      label: "GET",
      method: "GET",
      title: `${selectedResource.path}`,
      body: JSON.stringify(
        {
          agent: selectedAgent.name,
          wallet: selectedAgent.wallet,
          accept: "application/json",
          payment: null,
        },
        null,
        2,
      ),
    });

    await sleep(500);
    const challenge = createChallenge(selectedAgent, selectedResource, network);
    setPhase("challenge");
    appendExchange({
      tone: "challenge",
      label: "402",
      status: 402,
      title: "Payment Required",
      body: JSON.stringify(challenge, null, 2),
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
      setLedger((items) => [blocked, ...items]);
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
    const authorization = createAuthorization(selectedAgent, requirement);
    setPhase("signature");
    appendExchange({
      tone: "signature",
      label: "X-PAYMENT",
      method: "GET",
      title: "Signed authorization attached",
      body: JSON.stringify(
        {
          header: `${authorization.header.slice(0, 54)}...`,
          payload: authorization.payload,
        },
        null,
        2,
      ),
    });

    await sleep(700);
    const entry = createLedgerEntry(
      selectedAgent,
      selectedResource,
      network,
      "settled",
      risk.note,
    );
    const nextPayload = createPayload(selectedResource, entry.settlementRef);
    setLedger((items) => [entry, ...items]);
    setPayload(nextPayload);
    setPhase("settled");
    appendExchange({
      tone: "success",
      label: "200",
      status: 200,
      title: "Resource delivered",
      body: JSON.stringify(
        {
          "X-PAYMENT-RESPONSE": entry.settlementRef,
          paid: money(entry.amountUsd),
          data: nextPayload,
        },
        null,
        2,
      ),
    });

    setIsRunning(false);
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

  function resetDemo() {
    setLedger(starterLedger);
    setExchange(starterExchange);
    setPayload(null);
    setPhase("idle");
  }

  function exportLedgerCsv() {
    const csv = ledgerToCsv(ledger);
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

          <div className="exchange-feed">
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
            <button className="secondary-action" type="button" onClick={exportLedgerCsv}>
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <span>{ledger.length} records</span>
          </div>

          <div className="ledger-list">
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
        <article className="panel payload-panel">
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

export default App;
