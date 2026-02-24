import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { savePlan, loadPlan, listPlans, deletePlan } from "../../src/plans/store.js";
import type { HealthPlan } from "../../src/plans/types.js";

// Use a temp directory for tests
const TEST_STATE_DIR = join(import.meta.dir, "../.test-state-plans");
const TEST_UUID = "test-user-plans";

// Mock getStateDir to use test directory
const origEnv = process.env.PHA_STATE_DIR;

beforeEach(() => {
  process.env.PHA_STATE_DIR = TEST_STATE_DIR;
  mkdirSync(join(TEST_STATE_DIR, "users", TEST_UUID, "plans"), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_STATE_DIR)) {
    rmSync(TEST_STATE_DIR, { recursive: true, force: true });
  }
  if (origEnv) {
    process.env.PHA_STATE_DIR = origEnv;
  } else {
    delete process.env.PHA_STATE_DIR;
  }
});

function makePlan(overrides: Partial<HealthPlan> = {}): HealthPlan {
  return {
    id: "plan_test_001",
    name: "Test Plan",
    description: "A test health plan",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    goals: [
      {
        id: "goal_1",
        metric: "steps",
        label: "Daily Steps",
        targetValue: 10000,
        unit: "steps",
        frequency: "daily",
        status: "on_track",
      },
    ],
    milestones: [],
    adjustments: [],
    progress: [],
    ...overrides,
  };
}

describe("Plan Store", () => {
  test("savePlan + loadPlan roundtrip", () => {
    const plan = makePlan();
    savePlan(TEST_UUID, plan);

    const loaded = loadPlan(TEST_UUID, plan.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(plan.id);
    expect(loaded!.name).toBe("Test Plan");
    expect(loaded!.goals).toHaveLength(1);
    expect(loaded!.goals[0].metric).toBe("steps");
  });

  test("loadPlan returns null for non-existent plan", () => {
    const result = loadPlan(TEST_UUID, "non_existent");
    expect(result).toBeNull();
  });

  test("listPlans returns all plans", () => {
    savePlan(TEST_UUID, makePlan({ id: "plan_1", name: "Plan A" }));
    savePlan(TEST_UUID, makePlan({ id: "plan_2", name: "Plan B" }));

    const plans = listPlans(TEST_UUID);
    expect(plans).toHaveLength(2);
  });

  test("listPlans filters by status", () => {
    savePlan(TEST_UUID, makePlan({ id: "plan_1", status: "active" }));
    savePlan(TEST_UUID, makePlan({ id: "plan_2", status: "completed" }));
    savePlan(TEST_UUID, makePlan({ id: "plan_3", status: "active" }));

    const active = listPlans(TEST_UUID, "active");
    expect(active).toHaveLength(2);

    const completed = listPlans(TEST_UUID, "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe("plan_2");
  });

  test("listPlans returns empty array for no plans", () => {
    const plans = listPlans(TEST_UUID);
    expect(plans).toHaveLength(0);
  });

  test("listPlans returns empty for non-existent user", () => {
    const plans = listPlans("non-existent-user");
    expect(plans).toHaveLength(0);
  });

  test("deletePlan removes the file", () => {
    const plan = makePlan();
    savePlan(TEST_UUID, plan);
    expect(loadPlan(TEST_UUID, plan.id)).not.toBeNull();

    const result = deletePlan(TEST_UUID, plan.id);
    expect(result).toBe(true);
    expect(loadPlan(TEST_UUID, plan.id)).toBeNull();
  });

  test("deletePlan returns false for non-existent plan", () => {
    const result = deletePlan(TEST_UUID, "non_existent");
    expect(result).toBe(false);
  });

  test("savePlan updates updatedAt timestamp", () => {
    const plan = makePlan({ updatedAt: "2020-01-01T00:00:00.000Z" });
    savePlan(TEST_UUID, plan);

    const loaded = loadPlan(TEST_UUID, plan.id);
    expect(loaded!.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    // Should be a recent ISO string
    expect(new Date(loaded!.updatedAt).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  test("listPlans sorts by updatedAt descending", async () => {
    savePlan(TEST_UUID, makePlan({ id: "plan_old" }));
    // Ensure different updatedAt timestamps (savePlan overwrites updatedAt)
    await Bun.sleep(15);
    savePlan(TEST_UUID, makePlan({ id: "plan_new" }));

    const plans = listPlans(TEST_UUID);
    // plan_new was saved later, so its updatedAt is more recent → sorts first
    expect(plans[0].id).toBe("plan_new");
    expect(plans[1].id).toBe("plan_old");
  });

  test("plan with multiple goals and milestones", () => {
    const plan = makePlan({
      goals: [
        {
          id: "goal_1",
          metric: "steps",
          label: "Steps",
          targetValue: 10000,
          unit: "steps",
          frequency: "daily",
          status: "on_track",
        },
        {
          id: "goal_2",
          metric: "sleep_hours",
          label: "Sleep",
          targetValue: 7,
          unit: "hours",
          frequency: "daily",
          baselineValue: 6,
          currentValue: 6.5,
          status: "ahead",
        },
      ],
      milestones: [
        {
          id: "ms_1",
          label: "Week 1",
          targetDate: "2026-01-08",
          criteria: "Average 8000 steps",
          completed: false,
        },
      ],
      tags: ["fitness", "sleep"],
    });

    savePlan(TEST_UUID, plan);
    const loaded = loadPlan(TEST_UUID, plan.id);

    expect(loaded!.goals).toHaveLength(2);
    expect(loaded!.goals[1].currentValue).toBe(6.5);
    expect(loaded!.milestones).toHaveLength(1);
    expect(loaded!.tags).toEqual(["fitness", "sleep"]);
  });
});
