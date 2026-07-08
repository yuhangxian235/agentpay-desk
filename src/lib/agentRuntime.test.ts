import { describe, expect, it } from "vitest";
import { agents, resources, starterLedger } from "./x402Simulator";
import { createAgentPaymentPlan, extractBudgetUsd } from "./agentRuntime";

describe("agent runtime", () => {
  it("extracts a user budget from a natural language goal", () => {
    expect(extractBudgetUsd("Get yield data if it costs less than $0.30")).toBe(0.3);
    expect(extractBudgetUsd("Pay up to 2.50 for route data")).toBe(2.5);
    expect(extractBudgetUsd("Find the best paid API")).toBeNull();
  });

  it("plans a tokenized treasury paid API call from a prompt", () => {
    const plan = createAgentPaymentPlan({
      agent: agents[0],
      ledger: starterLedger,
      network: "base-sepolia",
      prompt: "Get tokenized treasury yield data if it costs less than $0.30",
      resources,
      riskSettings: {
        allowlistedOnly: true,
        autopay: true,
        spendCapUsd: 0.25,
      },
      selectedResourceId: resources[1].id,
      signerMode: "auto",
    });

    expect(plan.budgetUsd).toBe(0.3);
    expect(plan.resource.id).toBe("rwa-yield");
    expect(plan.trace[0]).toMatchObject({
      status: "done",
      tool: "parse_user_goal",
    });
    expect(plan.trace.map((step) => step.tool)).toContain("evaluate_payment_policy");
    expect(plan.trace[4].output).toMatchObject({
      decision: "allowed",
    });
  });

  it("marks the policy step blocked when the prompt budget is too low", () => {
    const plan = createAgentPaymentPlan({
      agent: agents[0],
      ledger: starterLedger,
      network: "base-sepolia",
      prompt: "Get tokenized treasury yield data if it costs less than $0.05",
      resources,
      riskSettings: {
        allowlistedOnly: true,
        autopay: true,
        spendCapUsd: 0.25,
      },
      selectedResourceId: resources[0].id,
      signerMode: "auto",
    });

    expect(plan.budgetUsd).toBe(0.05);
    expect(plan.trace[2].output).toMatchObject({
      withinBudget: false,
    });
    expect(plan.trace[4].output).toMatchObject({
      decision: "blocked",
      reason: "Endpoint price exceeds policy cap",
    });
  });
});
