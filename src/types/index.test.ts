import { describe, it, expect } from "vitest";
import type {
  QuadrantId,
  WellnessCheckIn,
  Task,
  FocusGoal,
  Connection,
  ActivityLog,
  JournalEntry,
  GratitudeEntry,
  Goal,
  WeeklyReview,
  AgentRole,
  ModelTier,
  AgentTaskStatus,
  Agent,
  AgentTask,
  EscalationEvent,
  ModelRouterConfig,
  RoutingDecision,
  ScheduleItem,
  OctaviusState,
  PersistedState,
} from "./index";

describe("Core types", () => {
  it("should allow creating a valid WellnessCheckIn", () => {
    const checkIn: WellnessCheckIn = {
      id: "1",
      timestamp: new Date().toISOString(),
      mood: 4,
      energy: 3,
      stress: 2,
    };
    expect(checkIn.mood).toBeGreaterThanOrEqual(1);
    expect(checkIn.mood).toBeLessThanOrEqual(5);
  });

  it("should allow creating a valid Task", () => {
    const task: Task = {
      id: "1",
      title: "Ship MVP",
      priority: "high",
      completed: false,
      createdAt: new Date().toISOString(),
    };
    expect(task.completed).toBe(false);
  });

  it("should allow creating a valid ModelRouterConfig", () => {
    const config: ModelRouterConfig = {
      localEndpoint: "http://localhost:11434",
      localModelName: "llama3.2",
      tier1CloudModel: "gemini-flash",
      tier2Model: "claude-sonnet-4-5",
      tier3Model: "claude-opus-4-5",
      researchProvider: "kimi",
      dailyCostBudget: 5.0,
      tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
    };
    expect(config.dailyCostBudget).toBe(5.0);
  });

  it("should allow creating a valid OctaviusState shape", () => {
    const state: OctaviusState = {
      profile: {
        name: "",
        coreValues: "",
        lifeVision: "",
        accentColor: "#7C3AED",
        weeklyReviewDay: 0,
      },
      health: { checkIns: [], metrics: {} },
      career: { tasks: [], focusGoals: [], scheduleItems: [] },
      relationships: { connections: [], activityLog: [] },
      soul: { journalEntries: [], gratitudeEntries: [] },
      goals: [],
      weeklyReviews: [],
      agents: [],
      agentTasks: [],
      escalationLog: [],
      routerConfig: {
        localEndpoint: "http://localhost:11434",
        localModelName: "llama3.2",
        tier1CloudModel: "gemini-flash",
        tier2Model: "claude-sonnet-4-5",
        tier3Model: "claude-opus-4-5",
        researchProvider: "kimi",
        dailyCostBudget: 5.0,
        tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
      },
    };
    expect(state.profile.weeklyReviewDay).toBe(0);
    expect(state.health.checkIns).toHaveLength(0);
  });

  it("should allow creating a valid PersistedState", () => {
    const persisted: PersistedState = {
      version: 1,
      data: {
        profile: {
          name: "Test",
          coreValues: "",
          lifeVision: "",
          accentColor: "#7C3AED",
          weeklyReviewDay: 0,
        },
        health: { checkIns: [], metrics: {} },
        career: { tasks: [], focusGoals: [], scheduleItems: [] },
        relationships: { connections: [], activityLog: [] },
        soul: { journalEntries: [], gratitudeEntries: [] },
        goals: [],
        weeklyReviews: [],
        agents: [],
        agentTasks: [],
        escalationLog: [],
        routerConfig: {
          localEndpoint: "http://localhost:11434",
          localModelName: "llama3.2",
          tier1CloudModel: "gemini-flash",
          tier2Model: "claude-sonnet-4-5",
          tier3Model: "claude-opus-4-5",
          researchProvider: "kimi",
          dailyCostBudget: 5.0,
          tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
        },
      },
    };
    expect(persisted.version).toBe(1);
  });
});
