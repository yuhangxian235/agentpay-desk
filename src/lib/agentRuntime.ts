import type { Agent, ApiResource, LedgerEntry, Network, RiskSettings, SignerMode } from "./x402Simulator";
import { evaluateRisk, findDemoApiCredential, money } from "./x402Simulator";

export type AgentTraceStatus = "blocked" | "done" | "pending" | "running";

export type AgentToolName =
  | "parse_user_goal"
  | "list_paid_resources"
  | "quote_paid_resource"
  | "request_paid_resource"
  | "evaluate_payment_policy"
  | "sign_payment"
  | "retry_with_x_payment"
  | "return_answer";

export type AgentTraceStep = {
  id: string;
  detail: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: AgentTraceStatus;
  title: string;
  tool: AgentToolName;
};

export type AgentPaymentPlan = {
  budgetUsd: number;
  goal: string;
  resource: ApiResource;
  trace: AgentTraceStep[];
};

export type AgentRuntimeContext = {
  agent: Agent;
  ledger: LedgerEntry[];
  network: Network;
  prompt: string;
  resources: ApiResource[];
  riskSettings: RiskSettings;
  selectedResourceId: string;
  signerMode: SignerMode;
};

const defaultPrompt = "Get tokenized treasury yield data if the API costs less than $0.30.";

export function createAgentPaymentPlan(context: AgentRuntimeContext): AgentPaymentPlan {
  const prompt = context.prompt.trim() || defaultPrompt;
  const budgetUsd = extractBudgetUsd(prompt) ?? context.riskSettings.spendCapUsd;
  const resource = chooseResource(prompt, context.resources, context.selectedResourceId);
  const credential = findDemoApiCredential(resource.id);
  const policy = evaluateRisk(context.agent, resource, context.ledger, {
    ...context.riskSettings,
    spendCapUsd: budgetUsd,
  });

  return {
    budgetUsd,
    goal: prompt,
    resource,
    trace: [
      {
        id: "parse-goal",
        detail: "Convert the user's sentence into a resource, budget, and policy constraint.",
        input: { prompt },
        output: {
          budget: money(budgetUsd),
          resource: resource.name,
        },
        status: "done",
        title: "Understand the task",
        tool: "parse_user_goal",
      },
      {
        id: "list-resources",
        detail: "Read the paid API catalog and pick the endpoint that matches the task.",
        input: {
          resources: context.resources.map((item) => item.name),
        },
        output: {
          selected: resource.name,
          category: resource.category,
        },
        status: "done",
        title: "Choose a paid tool",
        tool: "list_paid_resources",
      },
      {
        id: "quote-resource",
        detail: "Ask the seller how much the selected API call costs before signing anything.",
        input: {
          endpoint: resource.path,
          network: context.network,
        },
        output: {
          apiKey: credential ? "scoped key available" : "missing scoped key",
          price: money(resource.priceUsd),
          withinBudget: resource.priceUsd <= budgetUsd,
        },
        status: "done",
        title: "Quote the API call",
        tool: "quote_paid_resource",
      },
      {
        id: "request-paid-resource",
        detail: "Call the protected route once without payment proof and expect a 402 challenge.",
        input: {
          "X-API-Key": credential ? "attached" : "missing",
          "X-PAYMENT": null,
          endpoint: resource.path,
        },
        output: {
          expected: "HTTP 402 Payment Required",
        },
        status: "pending",
        title: "Request paid data",
        tool: "request_paid_resource",
      },
      {
        id: "evaluate-policy",
        detail: "Compare the 402 price with wallet policy before signing the payment.",
        input: {
          allowlistedOnly: context.riskSettings.allowlistedOnly,
          budget: money(budgetUsd),
          signerMode: context.signerMode,
        },
        output: {
          decision: policy.allowed ? "allowed" : "blocked",
          reason: policy.note,
        },
        status: "pending",
        title: "Decide whether to pay",
        tool: "evaluate_payment_policy",
      },
      {
        id: "sign-payment",
        detail: "Create the wallet-signed X-PAYMENT header only after policy allows the charge.",
        output: {
          status: "waiting for policy",
        },
        status: "pending",
        title: "Authorize payment",
        tool: "sign_payment",
      },
      {
        id: "retry-with-payment",
        detail: "Retry the same API call with payment proof and wait for a facilitator receipt.",
        output: {
          status: "waiting for signature",
        },
        status: "pending",
        title: "Retry with payment",
        tool: "retry_with_x_payment",
      },
      {
        id: "return-answer",
        detail: "Return the paid data together with cost and settlement proof.",
        output: {
          status: "waiting for paid payload",
        },
        status: "pending",
        title: "Answer with receipt",
        tool: "return_answer",
      },
    ],
  };
}

export function completeTraceStep(
  trace: AgentTraceStep[],
  id: string,
  output?: Record<string, unknown>,
  status: AgentTraceStatus = "done",
): AgentTraceStep[] {
  return trace.map((step) => {
    if (step.id !== id) {
      return step;
    }

    return {
      ...step,
      output: {
        ...step.output,
        ...output,
      },
      status,
    };
  });
}

export function markTraceStepRunning(trace: AgentTraceStep[], id: string): AgentTraceStep[] {
  return trace.map((step) =>
    step.id === id
      ? {
          ...step,
          status: "running",
        }
      : step,
  );
}

export function extractBudgetUsd(prompt: string): number | null {
  const match = prompt.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function chooseResource(
  prompt: string,
  resources: ApiResource[],
  selectedResourceId: string,
): ApiResource {
  const normalized = prompt.toLowerCase();
  const keywordMap: Array<[string[], string]> = [
    [["treasury", "t-bill", "yield", "rwa"], "rwa-yield"],
    [["risk", "wallet", "counterparty"], "wallet-risk"],
    [["invoice", "payable", "freelancer"], "invoice-scan"],
    [["route", "quote", "bridge", "payout"], "fx-route"],
  ];
  const match = keywordMap.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  const resourceId = match?.[1] ?? selectedResourceId;

  return resources.find((resource) => resource.id === resourceId) ?? resources[0];
}
