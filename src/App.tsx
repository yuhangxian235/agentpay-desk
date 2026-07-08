import {
  Activity,
  ArrowRight,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  Code2,
  Copy,
  DatabaseZap,
  Download,
  KeyRound,
  LockKeyhole,
  Play,
  ReceiptText,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  type AgentPaymentPlan,
  type AgentTraceStep,
  completeTraceStep,
  createAgentPaymentPlan,
  markTraceStepRunning,
} from "./lib/agentRuntime";
import type {
  MerchantAuditEvent,
  MerchantOpsState,
  MerchantOpsStorageInfo,
} from "./lib/merchantOpsStore";
import {
  type Agent,
  type ApiResource,
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

type Locale = "en" | "zh";

type PaidApiBody = {
  data?: Record<string, unknown>;
  error?: string;
  facilitator?: Record<string, unknown>;
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
    title: "Ready for a paid API call",
    body: "The agent will ask for data, the seller will ask for payment, and the wallet will decide whether to sign.",
  },
];

const defaultStorageInfo: MerchantOpsStorageInfo = {
  detail: "Server state has not synced yet",
  driver: "memory",
  durable: false,
  label: "Pending sync",
};

const localeCopy = {
  en: {
    agentAnswerLabel: "Agent answer",
    agentBuying: "Agent is buying",
    approved: "Approved",
    autopilotDetail:
      "Ask in plain English, then see the price, policy decision, and receipt before the protocol logs.",
    autopilotKicker: "Human-readable agent payment",
    autopilotTitle: "Can this agent safely pay?",
    brandEyebrow: "Stablecoin machine payments",
    budgetLabel: "Budget parsed from task",
    checking: "Checking",
    defaultPrompt: "Get tokenized treasury yield data if the API costs less than $0.30.",
    demoDetail:
      "The default view is for people: task, price, policy, receipt. Open the workbench when you want the HTTP exchange, seller ledger, API keys, and settlement evidence.",
    demoEyebrow: "90 second demo",
    demoTitle: "No checkout page. Just a controlled agent payment.",
    facts: {
      agent: "Agent",
      api: "API",
      price: "Price",
      receipt: "Receipt",
      walletPolicy: "Wallet policy",
    },
    flow: [
      { detail: "The agent turns your sentence into an API request.", label: "Ask" },
      { detail: "The seller returns a payment-required price.", label: "Quote" },
      { detail: "The wallet signs only if budget and allowlist pass.", label: "Policy" },
      { detail: "The paid response is shown with an auditable id.", label: "Receipt" },
    ],
    likelyApiLabel: "Likely API",
    notIssued: "Not issued yet",
    promptLabel: "What should the agent get?",
    ready: "Ready",
    runAgent: "Run agent autopilot",
    stopped: "Stopped",
    story: {
      buyerDetail: `${agents[0].name} requests ${resources[0].name} with a scoped API key.`,
      buyerTitle: "Buyer asks for data",
      receiptDetail:
        "The wallet signs, the facilitator returns a receipt, and the seller records the call.",
      receiptTitle: "Receipt unlocks payload",
      sellerTitle: "Seller asks for payment",
    },
    technicalDetail: "Tool-call trace and agent answer",
    technicalLabel: "Technical evidence",
    traceNote:
      "The trace shows tool calls and observations only. It does not expose private chain-of-thought.",
    waitingAgent: "Waiting for an agent-run paid API call",
    workbenchDetail: "Open manual controls, HTTP exchange, merchant ledger, and ops evidence",
    workbenchLabel: "Protocol workbench",
  },
  zh: {
    agentAnswerLabel: "Agent 回答",
    agentBuying: "Agent 正在购买",
    approved: "已通过",
    autopilotDetail: "用自然语言提出任务，然后先看价格、策略决策和收据，再展开协议日志。",
    autopilotKicker: "给人看的 Agent 支付",
    autopilotTitle: "这个 Agent 可以安全付款吗？",
    brandEyebrow: "稳定币机器支付",
    budgetLabel: "从任务解析出的预算",
    checking: "检查中",
    defaultPrompt: "如果 API 价格低于 0.30 美元，就获取代币化国债收益率数据。",
    demoDetail:
      "默认视图给人看：任务、价格、策略、收据。需要 HTTP 交互、商户账本、API key 和结算证据时，再打开工作台。",
    demoEyebrow: "90 秒演示",
    demoTitle: "没有结账页，只有可控的 Agent 付款。",
    facts: {
      agent: "Agent",
      api: "API",
      price: "价格",
      receipt: "收据",
      walletPolicy: "钱包策略",
    },
    flow: [
      { detail: "Agent 把你的句子转换成 API 请求。", label: "提问" },
      { detail: "商户返回需要付款的报价。", label: "报价" },
      { detail: "只有预算和白名单通过时，钱包才会签名。", label: "策略" },
      { detail: "付费响应会带着可审计的收据编号返回。", label: "收据" },
    ],
    likelyApiLabel: "可能调用的 API",
    notIssued: "尚未生成",
    promptLabel: "你希望 Agent 获取什么？",
    ready: "就绪",
    runAgent: "运行 Agent 自动付款",
    stopped: "已停止",
    story: {
      buyerDetail: `${agents[0].name} 使用受限 API key 请求 ${resources[0].name}。`,
      buyerTitle: "买方请求数据",
      receiptDetail: "钱包签名后，facilitator 返回收据，商户记录这次调用。",
      receiptTitle: "收据解锁数据",
      sellerTitle: "商户要求付款",
    },
    technicalDetail: "工具调用轨迹和 Agent 回答",
    technicalLabel: "技术证据",
    traceNote: "这里展示的是工具调用和观察结果，不暴露私有 chain-of-thought。",
    waitingAgent: "等待 Agent 运行一次付费 API 调用",
    workbenchDetail: "打开手动控制、HTTP 交互、商户账本和运维证据",
    workbenchLabel: "协议工作台",
  },
} as const;

type PaymentRunOptions = {
  agent?: Agent;
  resource?: ApiResource;
  riskSettings?: RiskSettings;
  source?: "agent" | "guided";
};

function detectInitialLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh";
  }

  return "en";
}

function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
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
  const [agentPrompt, setAgentPrompt] = useState<string>(
    () => localeCopy[detectInitialLocale()].defaultPrompt,
  );
  const [agentPlan, setAgentPlan] = useState<AgentPaymentPlan | null>(null);
  const [agentTrace, setAgentTrace] = useState<AgentTraceStep[]>([]);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedResource =
    resources.find((resource) => resource.id === selectedResourceId) ?? resources[0];
  const copy = localeCopy[locale];

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
  const phaseCopy = phaseExplanation(phase);
  const reconciliationEvents = useMemo(() => buildReconciliationEvents(ledger), [ledger]);
  const agentPreviewPlan = useMemo(
    () =>
      createAgentPaymentPlan({
        agent: selectedAgent,
        ledger,
        network,
        prompt: agentPrompt,
        resources,
        riskSettings,
        selectedResourceId: selectedResource.id,
        signerMode,
      }),
    [agentPrompt, ledger, network, riskSettings, selectedAgent, selectedResource.id, signerMode],
  );
  const displayedAgentPlan = agentPlan ?? agentPreviewPlan;
  const humanDecision = humanDecisionCopy(agentAnswer, isAgentRunning, phase, locale);
  const displayedAgentAnswer =
    locale === "zh" && agentAnswer ? translateAgentAnswer(agentAnswer) : agentAnswer;
  const humanReceipt = agentAnswer?.match(/api_[0-9a-f]+/)?.[0] ?? copy.notIssued;
  const humanPolicy =
    agentAnswer === null
      ? isAgentRunning
        ? copy.checking
        : copy.ready
      : agentAnswer.includes("I paid")
        ? copy.approved
        : copy.stopped;

  useEffect(() => {
    void refreshMerchantState();
  }, []);

  async function runAgentAutopilot() {
    if (isRunning) {
      return;
    }

    const autopilotRiskSettings = {
      ...riskSettings,
      autopay: true,
    };
    const plan = createAgentPaymentPlan({
      agent: selectedAgent,
      ledger,
      network,
      prompt: agentPrompt,
      resources,
      riskSettings: autopilotRiskSettings,
      selectedResourceId: selectedResource.id,
      signerMode,
    });
    const agentRiskSettings = {
      ...autopilotRiskSettings,
      spendCapUsd: plan.budgetUsd,
    };

    setAgentPlan(plan);
    setAgentTrace(plan.trace);
    setAgentAnswer(null);
    setSelectedResourceId(plan.resource.id);
    setRiskSettings(agentRiskSettings);
    setIsAgentRunning(true);

    await sleep(300);
    await runPurchase({
      agent: selectedAgent,
      resource: plan.resource,
      riskSettings: agentRiskSettings,
      source: "agent",
    });
  }

  async function runPurchase(options: PaymentRunOptions = {}) {
    if (isRunning) {
      return;
    }

    const flowAgent = options.agent ?? selectedAgent;
    const flowResource = options.resource ?? selectedResource;
    const flowRiskSettings = options.riskSettings ?? riskSettings;
    const isAgentSource = options.source === "agent";

    setIsRunning(true);
    setPayload(null);
    setExchange([]);
    setPhase("request");
    setSignerState("ready");

    const apiUrl = protectedResourceUrl(flowAgent.id, flowResource.id, network);
    const apiCredential = findDemoApiCredential(flowResource.id);
    const apiKey = apiCredential?.secret ?? "";

    markAgentTrace("request-paid-resource");
    appendExchange({
      tone: "request",
      label: "GET",
      method: "GET",
      title: apiUrl,
      body: JSON.stringify(
        {
          agent: flowAgent.name,
          route: flowResource.path,
          wallet: flowAgent.wallet,
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
        : createChallenge(flowAgent, flowResource, network);
    setPhase("challenge");
    completeAgentTrace("request-paid-resource", {
      status: challengeResponse.status,
      x402Version: challengeResponse.headers.get("X-402-Version") ?? 1,
    });
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
    markAgentTrace("evaluate-policy");
    const risk = evaluateRisk(flowAgent, flowResource, ledger, flowRiskSettings);

    if (!risk.allowed) {
      const blocked = createLedgerEntry(
        flowAgent,
        flowResource,
        network,
        "blocked",
        risk.note,
      );
      await persistLedgerEntry(blocked);
      setPhase("blocked");
      completeAgentTrace(
        "evaluate-policy",
        {
          decision: "blocked",
          reason: risk.note,
        },
        "blocked",
      );
      finishAgentAnswer(
        isAgentSource,
        `I did not pay for ${flowResource.name}: ${risk.note}. No paid payload was released.`,
      );
      appendExchange({
        tone: "blocked",
        label: "Policy",
        status: 403,
        title: "Autopay blocked",
        body: JSON.stringify(
          {
            reason: risk.note,
            spendCap: money(flowRiskSettings.spendCapUsd),
            allowlistedOnly: flowRiskSettings.allowlistedOnly,
          },
          null,
          2,
        ),
      });
      finishRun(isAgentSource);
      return;
    }

    const requirement = challenge.accepts[0];
    setPhase("signature");
    setSignerState("pending");
    completeAgentTrace("evaluate-policy", {
      decision: "allowed",
      price: money(flowResource.priceUsd),
      reason: risk.note,
    });
    markAgentTrace("sign-payment");
    appendExchange({
      tone: "signature",
      label: "Signer",
      title: "Wallet approval pending",
      body: JSON.stringify(
        {
          mode: signerMode,
          wallet: flowAgent.wallet,
          amount: money(flowResource.priceUsd),
          resource: flowResource.name,
          validForSeconds: requirement.maxTimeoutSeconds,
        },
        null,
        2,
      ),
    });

    await sleep(signerMode === "review" ? 900 : 450);
    const signerDecision = evaluateSigner(signerMode, flowAgent, flowResource);

    if (signerDecision.status !== "approved") {
      const blocked = createLedgerEntry(
        flowAgent,
        flowResource,
        network,
        "blocked",
        signerDecision.note,
      );
      await persistLedgerEntry(blocked);
      setSignerState(signerDecision.status);
      setPhase("blocked");
      completeAgentTrace(
        "sign-payment",
        {
          decision: signerDecision.status,
          reason: signerDecision.note,
        },
        "blocked",
      );
      finishAgentAnswer(
        isAgentSource,
        `I stopped before payment: ${signerDecision.note}. The seller recorded a held attempt.`,
      );
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
            wallet: flowAgent.wallet,
          },
          null,
          2,
        ),
      });
      finishRun(isAgentSource);
      return;
    }

    setSignerState("approved");
    const authorization = createAuthorization(flowAgent, requirement);
    completeAgentTrace("sign-payment", {
      decision: "approved",
      header: "X-PAYMENT attached",
      signer: signerDecision.note,
    });
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
    markAgentTrace("retry-with-payment");
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
    const facilitatorReceipt = paidResponse.headers.get("X-FACILITATOR-RECEIPT") ?? "local_receipt";
    const entry = {
      ...createLedgerEntry(flowAgent, flowResource, network, "settled", risk.note),
      settlementRef,
    };
    const nextPayload = paidBody.data ?? createPayload(flowResource, settlementRef);
    await persistLedgerEntry(entry);
    setPayload(nextPayload);
    setPhase("settled");
    completeAgentTrace("retry-with-payment", {
      facilitatorReceipt,
      settlementRef,
      status: paidResponse.status,
    });
    completeAgentTrace("return-answer", {
      cost: money(entry.amountUsd),
      payload: "unlocked",
      receipt: settlementRef,
    });
    finishAgentAnswer(
      isAgentSource,
      `I paid ${money(entry.amountUsd)} for ${flowResource.name}, received ${settlementRef}, and unlocked the paid API response.`,
    );
    appendExchange({
      tone: "success",
      label: "200",
      status: 200,
      title: "Resource delivered",
      body: JSON.stringify(
        {
          status: paidResponse.status,
          "X-FACILITATOR-RECEIPT": facilitatorReceipt,
          "X-PAYMENT-RESPONSE": settlementRef,
          paid: money(entry.amountUsd),
          ...paidBody,
        },
        null,
        2,
      ),
    });

    finishRun(isAgentSource);
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

  function markAgentTrace(id: string) {
    setAgentTrace((items) => markTraceStepRunning(items, id));
  }

  function completeAgentTrace(
    id: string,
    output?: Record<string, unknown>,
    status?: "blocked" | "done",
  ) {
    setAgentTrace((items) => completeTraceStep(items, id, output, status));
  }

  function finishAgentAnswer(isAgentSource: boolean, answer: string) {
    if (isAgentSource) {
      setAgentAnswer(answer);
    }
  }

  function finishRun(isAgentSource: boolean) {
    setIsRunning(false);

    if (isAgentSource) {
      setIsAgentRunning(false);
    }
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

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setAgentPrompt((currentPrompt) =>
      currentPrompt === localeCopy[locale].defaultPrompt
        ? localeCopy[nextLocale].defaultPrompt
        : currentPrompt,
    );
  }

  return (
    <main className="app-shell">
      <header className="desk-header">
        <div className="brand-lockup">
          <div className="brand-mark">402</div>
          <div>
            <p className="eyebrow">{copy.brandEyebrow}</p>
            <h1>AgentPay Desk</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="locale-toggle" role="group" aria-label="Language">
            <button
              className={locale === "zh" ? "active" : ""}
              type="button"
              onClick={() => changeLocale("zh")}
            >
              中文
            </button>
            <button
              className={locale === "en" ? "active" : ""}
              type="button"
              onClick={() => changeLocale("en")}
            >
              EN
            </button>
          </div>
          <div className="merchant-pill">
            <ServerCog size={16} />
            <span>{merchant.name}</span>
          </div>
          <button className="icon-button" type="button" onClick={resetDemo} aria-label="Reset demo">
            <RefreshCcw size={18} />
          </button>
        </div>
      </header>

      <section className="panel autopilot-panel" data-testid="agent-autopilot">
        <PanelHeader
          icon={<Sparkles size={19} />}
          kicker={copy.autopilotKicker}
          title={copy.autopilotTitle}
          detail={copy.autopilotDetail}
        />
        <div className="autopilot-layout">
          <div className="autopilot-command">
            <label htmlFor="agent-prompt">{copy.promptLabel}</label>
            <textarea
              data-testid="agent-prompt"
              id="agent-prompt"
              rows={4}
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
            />
            <div className="autopilot-policy">
              <span>{copy.budgetLabel}</span>
              <strong>{money(displayedAgentPlan.budgetUsd)}</strong>
              <span>{copy.likelyApiLabel}</span>
              <strong>{displayedAgentPlan.resource.name}</strong>
            </div>
            <button
              className="primary-action"
              data-testid="run-agent"
              type="button"
              onClick={() => {
                void runAgentAutopilot();
              }}
              disabled={isRunning}
            >
              <Play size={18} fill="currentColor" />
              <span>{isAgentRunning ? copy.agentBuying : copy.runAgent}</span>
            </button>
          </div>

          <div className={`human-payment-summary ${humanDecision.tone}`}>
            <div className="decision-card">
              <span>Decision</span>
              <strong>{humanDecision.title}</strong>
              <p>{humanDecision.detail}</p>
            </div>

            <div className="human-facts" aria-label="Payment facts">
              <HumanFact label={copy.facts.agent} value={selectedAgent.name} />
              <HumanFact label={copy.facts.api} value={displayedAgentPlan.resource.name} />
              <HumanFact label={copy.facts.price} value={money(displayedAgentPlan.resource.priceUsd)} />
              <HumanFact label={copy.facts.walletPolicy} value={humanPolicy} />
              <HumanFact label={copy.facts.receipt} value={humanReceipt} wide />
            </div>

            <div className="human-flow" aria-label="Human payment flow">
              {copy.flow.map((step, index) => (
                <HumanStep
                  detail={step.detail}
                  key={step.label}
                  label={step.label}
                  marker={String(index + 1)}
                />
              ))}
            </div>
          </div>
        </div>

        <details className="technical-details" open={agentTrace.length > 0}>
          <summary>
            <span>{copy.technicalLabel}</span>
            <strong>{copy.technicalDetail}</strong>
          </summary>
          <div className="technical-layout">
            <div className="agent-trace" data-testid="agent-trace">
              {(agentTrace.length > 0 ? agentTrace : starterAgentTrace()).map((step) => (
                <AgentTraceRow key={step.id} step={step} />
              ))}
            </div>

            <div className="agent-answer" data-testid="agent-answer">
              <span>{copy.agentAnswerLabel}</span>
              <strong>{displayedAgentAnswer ?? copy.waitingAgent}</strong>
              <small>{copy.traceNote}</small>
            </div>
          </div>
        </details>
      </section>

      <section className="demo-brief" data-testid="demo-brief" aria-label="Agent payment overview">
        <div className="brief-copy">
          <p className="eyebrow">{copy.demoEyebrow}</p>
          <h2>{copy.demoTitle}</h2>
          <p>{copy.demoDetail}</p>
          <div className="brief-route" aria-label="Selected payment route">
            <span>{selectedAgent.name}</span>
            <ArrowRight size={16} />
            <span>{selectedResource.name}</span>
            <ArrowRight size={16} />
            <span>{merchant.name}</span>
          </div>
        </div>

        <div className="brief-flow" aria-label="Payment story">
          <StoryStep
            icon={<Bot size={18} />}
            marker="1"
            title={copy.story.buyerTitle}
            detail={
              locale === "zh"
                ? `${selectedAgent.name} 使用受限 API key 请求 ${selectedResource.name}。`
                : `${selectedAgent.name} requests ${selectedResource.name} with a scoped API key.`
            }
          />
          <StoryStep
            icon={<LockKeyhole size={18} />}
            marker="2"
            title={copy.story.sellerTitle}
            detail={
              locale === "zh"
                ? `API 返回 402，因为这次调用价格是 ${money(selectedResource.priceUsd)}。`
                : `The API returns 402 because the call costs ${money(selectedResource.priceUsd)}.`
            }
          />
          <StoryStep
            icon={<ReceiptText size={18} />}
            marker="3"
            title={copy.story.receiptTitle}
            detail={copy.story.receiptDetail}
          />
        </div>
      </section>

      <details className="advanced-workbench" data-testid="advanced-workbench">
        <summary data-testid="advanced-toggle">
          <span>{copy.workbenchLabel}</span>
          <strong>{copy.workbenchDetail}</strong>
        </summary>

      <section className="workspace-grid">
        <aside className="panel buyer-panel">
          <PanelHeader
            icon={<Bot size={19} />}
            kicker="Step 1"
            title="Buyer setup"
            detail="Choose the agent, the API, and how strict the wallet should be"
          />

          <div className="section-block">
            <div className="section-label">Who is buying?</div>
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
            <div className="section-label">What data does it want?</div>
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
            <div className="section-label">Where should payment settle?</div>
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
            <div className="section-label">What does the wallet do?</div>
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
            onClick={() => {
              void runPurchase();
            }}
            disabled={isRunning}
          >
            <Play size={18} fill="currentColor" />
            <span>{isRunning ? "Running payment" : "Run guided payment"}</span>
          </button>
        </aside>

        <section className="panel exchange-panel">
          <PanelHeader
            icon={<Code2 size={19} />}
            kicker="Step 2"
            title="Payment conversation"
            detail="The exact request, payment challenge, signature, and receipt"
          />

          <PhaseRail phase={phase} />
          <div className={`phase-explainer ${phase}`}>
            <BookOpenCheck size={17} />
            <div>
              <strong>{phaseCopy.title}</strong>
              <span>{phaseCopy.detail}</span>
            </div>
          </div>

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
            kicker="Step 3"
            title="Seller receipt book"
            detail="The merchant records paid calls, held calls, and settlement references"
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

      <section className="metrics-strip" aria-label="Merchant payment metrics">
        <Metric
          icon={<CircleDollarSign size={18} />}
          label="Settled revenue"
          value={money(revenue)}
          detail={`${settledLedger.length} paid calls`}
        />
        <Metric
          icon={<Activity size={18} />}
          label="Pay-first responses"
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

      <section className="plain-language-strip" aria-label="Payment terms in plain language">
        <TermChip term="API key" meaning="Who may call this paid endpoint" />
        <TermChip term="402" meaning="The seller says payment is required" />
        <TermChip term="X-PAYMENT" meaning="The wallet-signed payment proof" />
        <TermChip term="Ledger" meaning="The seller's record of what happened" />
      </section>

      <section className="bottom-grid">
        <article className="panel payload-panel" data-testid="payload-panel">
          <PanelHeader
            icon={<DatabaseZap size={19} />}
            kicker="Response"
            title="Paid API result"
            detail="The response appears only after a receipt exists"
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
            title="What becomes real next"
            detail="The places where demo adapters become production services"
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
              <span>Facilitator</span>
              <p>Send `X-PAYMENT` to a live facilitator and store the returned receipt.</p>
            </div>
          </div>
        </article>

        <article className="panel operations-panel" data-testid="operations-panel">
          <PanelHeader
            icon={<KeyRound size={19} />}
            kicker="Merchant ops"
            title="Access keys & settlement proof"
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
      </details>
    </main>
  );
}

function HumanFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`human-fact ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HumanStep({ detail, label, marker }: { detail: string; label: string; marker: string }) {
  return (
    <div className="human-step">
      <b>{marker}</b>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}

function humanDecisionCopy(
  answer: string | null,
  isAgentRunning: boolean,
  phase: Phase,
  locale: Locale,
): { detail: string; title: string; tone: "blocked" | "neutral" | "paid" | "running" } {
  const isZh = locale === "zh";

  if (isAgentRunning || phase === "request" || phase === "challenge" || phase === "signature") {
    return {
      detail: isZh
        ? "Agent 正在检查价格和钱包规则，在发送任何签名付款之前先做策略判断。"
        : "The agent is checking the price and wallet rules before any signed payment is sent.",
      title: isZh ? "正在检查价格和策略" : "Checking price and policy",
      tone: "running",
    };
  }

  if (answer?.includes("I paid")) {
    return {
      detail: isZh ? translateAgentAnswer(answer) : answer,
      title: isZh ? "付费数据已返回" : "Paid data delivered",
      tone: "paid",
    };
  }

  if (answer) {
    return {
      detail: isZh ? translateAgentAnswer(answer) : answer,
      title: isZh ? "资金移动前已停止付款" : "Payment stopped before funds moved",
      tone: "blocked",
    };
  }

  return {
    detail: isZh
      ? "Agent 会先获取 API 报价，与预算比较，然后决定付款或停止。"
      : "The agent will quote the API, compare price with budget, then pay or stop.",
    title: isZh ? "只有策略允许时才会购买" : "Ready to buy only if policy allows",
    tone: "neutral",
  };
}

function translateAgentAnswer(answer: string): string {
  const receipt = answer.match(/api_[0-9a-f]+/)?.[0];

  if (answer.includes("I paid")) {
    return receipt
      ? `我已完成付款并拿到付费数据。收据编号：${receipt}。`
      : "我已完成付款并拿到付费数据。";
  }

  return answer.replace("I did not pay.", "我没有付款。");
}

function AgentTraceRow({ step }: { step: AgentTraceStep }) {
  return (
    <article className={`agent-trace-row ${step.status}`}>
      <div className="trace-status">
        {step.status === "blocked" ? (
          <XCircle size={15} />
        ) : step.status === "done" ? (
          <CheckCircle2 size={15} />
        ) : (
          <Clock3 size={15} />
        )}
      </div>
      <div>
        <div className="trace-title">
          <span>{step.tool}</span>
          <b>{step.status}</b>
        </div>
        <strong>{step.title}</strong>
        <small>{step.detail}</small>
        {step.output ? <pre>{JSON.stringify(step.output, null, 2)}</pre> : null}
      </div>
    </article>
  );
}

function starterAgentTrace(): AgentTraceStep[] {
  return [
    {
      id: "starter-parse",
      detail: "The agent turns the sentence into a resource, budget, and payment policy.",
      status: "pending",
      title: "Understand the task",
      tool: "parse_user_goal",
    },
    {
      id: "starter-request",
      detail: "The agent calls the paid API, receives HTTP 402, signs if policy allows, and retries.",
      status: "pending",
      title: "Call paid tools",
      tool: "request_paid_resource",
    },
    {
      id: "starter-answer",
      detail: "The agent returns data with the cost and settlement receipt.",
      status: "pending",
      title: "Return paid result",
      tool: "return_answer",
    },
  ];
}

function StoryStep({
  detail,
  icon,
  marker,
  title,
}: {
  detail: string;
  icon: React.ReactNode;
  marker: string;
  title: string;
}) {
  return (
    <article className="story-step">
      <div className="story-marker">
        {icon}
        <span>{marker}</span>
      </div>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TermChip({ meaning, term }: { meaning: string; term: string }) {
  return (
    <div className="term-chip">
      <b>{term}</b>
      <span>{meaning}</span>
    </div>
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

function phaseExplanation(phase: Phase): { detail: string; title: string } {
  if (phase === "request") {
    return {
      title: "The agent is asking for the API response",
      detail: "The request includes an API key, but no payment proof yet.",
    };
  }

  if (phase === "challenge") {
    return {
      title: "The seller refuses to serve data until payment exists",
      detail: "HTTP 402 tells the agent the exact price, asset, recipient, and network.",
    };
  }

  if (phase === "signature") {
    return {
      title: "The wallet policy decides whether to sign",
      detail: "If policy allows it, the signed X-PAYMENT header is attached to the retry.",
    };
  }

  if (phase === "settled") {
    return {
      title: "The paid response is unlocked",
      detail: "A facilitator receipt and settlement reference prove why the seller released data.",
    };
  }

  if (phase === "blocked") {
    return {
      title: "The payment was held before funds could move",
      detail: "The merchant still records the attempt, but no paid payload is released.",
    };
  }

  return {
    title: "Start with one guided payment",
    detail: "The feed will show the request, payment challenge, wallet signature, and receipt.",
  };
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
