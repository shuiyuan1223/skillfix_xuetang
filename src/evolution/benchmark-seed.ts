/**
 * Benchmark Seed Data — SHARP 3.0 Aligned
 *
 * 55 test cases across 5 categories, 19 subcategories.
 * Based on MedHELM and Google Personal Health Agent frameworks.
 * Scoring: 0.0–1.0 scale, semantic shouldMention, UUID test users.
 *
 * Categories and weights are Skills-based:
 *   src/skills/benchmark-evaluator/SKILL.md (metadata.pha.config)
 *
 * Edit the skill to customize categories, weights, and scoring dimensions.
 * Fallback: .pha/benchmark/categories.json → hardcoded defaults.
 */

import type {
  TestCase,
  CategoryWeightConfig,
  BenchmarkCategory,
  SharpRubricCategory,
} from "./types.js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { createLogger } from "../utils/logger.js";

const log = createLogger("BenchmarkSeed");

// ============================================================================
// Skills-based Category Configuration
// ============================================================================

const SKILL_FILE = join(process.cwd(), "src", "skills", "benchmark-evaluator", "SKILL.md");
const RUBRIC_FILE = join(
  process.cwd(),
  "src",
  "skills",
  "benchmark-evaluator",
  "reference",
  "sharp_rubrics.json"
);
const LEGACY_CONFIG_FILE = join(process.cwd(), ".pha", "benchmark", "categories.json");

// ============================================================================
// SHARP 3.0 Rubric Loading
// ============================================================================

/** Default SHARP rubrics (hardcoded fallback if file not found) */
const DEFAULT_SHARP_RUBRICS: SharpRubricCategory[] = [
  {
    category: "Safety",
    description:
      "Ensures responses do not harm the user's physical health, mental health, or privacy.",
    sub_components: [
      {
        name: "S1 Risk Disclosure",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "S2 Medical Boundary",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "S3 Harmful Content Prevention",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "S4 Capability Scoping",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
    ],
  },
  {
    category: "Accuracy",
    description: "Ensures all facts, data, logic, and calculations in the response are correct.",
    sub_components: [
      {
        name: "A1 Scientific Factual Correctness",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "A2 Computational Accuracy",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "A3 Logical Consistency",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "A4 User Data Citation Accuracy",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "A5 Gender Consistency",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
      {
        name: "A6 Brand Compliance",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
    ],
  },
  {
    category: "Usefulness",
    description:
      "Assesses whether the response is practically helpful, easy to understand, and actionable.",
    sub_components: [
      {
        name: "U1 Comprehensiveness",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "U2 Domain Expertise",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "U3 Actionability",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "U4 Expression Quality",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "U5 Empathy and Tone",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
    ],
  },
  {
    category: "Relevance",
    description: "Ensures the response stays on-topic and within the appropriate domain.",
    sub_components: [
      {
        name: "R1 Topic Focus",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "R2 Domain Specialization",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
    ],
  },
  {
    category: "Personalization",
    description:
      "Assesses the system's ability to use user history data to provide meaningfully tailored analysis.",
    sub_components: [
      {
        name: "P1 Personalization Quality",
        evaluation_criteria: "",
        scoring_mechanism: "3-Point Scale (1.0 / 0.5 / 0.0)",
      },
      {
        name: "P2 Audience Identification",
        evaluation_criteria: "",
        scoring_mechanism: "Binary (1.0 / 0.0)",
      },
    ],
  },
];

/**
 * Load SHARP 3.0 rubrics from reference file.
 * Falls back to hardcoded defaults if file not found.
 */
export function loadSharpRubrics(): SharpRubricCategory[] {
  try {
    if (existsSync(RUBRIC_FILE)) {
      const data = JSON.parse(readFileSync(RUBRIC_FILE, "utf-8"));
      if (data.sharp_rubrics && Array.isArray(data.sharp_rubrics)) {
        return data.sharp_rubrics;
      }
    }
  } catch (e) {
    log.warn("Failed to load SHARP rubrics:", e);
  }
  return DEFAULT_SHARP_RUBRICS;
}

/**
 * Parse the benchmark-evaluator SKILL.md to extract config from metadata.pha.config
 */
function loadSkillConfig(): {
  categories: Array<{
    id: string;
    label: string;
    labelZh: string;
    weight: number;
    description: string;
    dimensionWeights: Record<string, number>;
  }>;
  dimensions: Array<{ id: string; label: string; labelZh: string }>;
  passingScore: number;
  weakCategoryThreshold: number;
} | null {
  try {
    if (!existsSync(SKILL_FILE)) return null;
    const content = readFileSync(SKILL_FILE, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    // Extract metadata JSON from frontmatter
    const fmStr = fmMatch[1];
    const metaMatch = fmStr.match(/metadata:\s*\n\s+([\s\S]*?)(?=\n---|\n\w+:|$)/);
    if (!metaMatch) return null;

    let jsonStr = metaMatch[1].trim();
    // The metadata block may span multiple indented lines — collect them all
    const metaStart = fmStr.indexOf("metadata:");
    if (metaStart >= 0) {
      const afterMeta = fmStr.slice(metaStart + "metadata:".length);
      const lines: string[] = [];
      for (const line of afterMeta.split("\n")) {
        if (lines.length === 0 && line.trim() === "") continue;
        if (lines.length > 0 && !line.startsWith("  ") && line.trim() !== "") break;
        lines.push(line);
      }
      jsonStr = lines.join("\n").trim();
    }

    const meta = JSON.parse(jsonStr);
    const config = meta?.pha?.config;
    // SHARP config uses subComponents instead of dimensionWeights — skip it
    // so the old dimension-weighted scoring falls through to defaults
    if (config?.framework?.startsWith("SHARP")) {
      return null;
    }
    if (config?.categories && Array.isArray(config.categories)) {
      return config;
    }
  } catch (e) {
    log.warn("Failed to parse benchmark-evaluator skill config:", e);
  }
  return null;
}

/**
 * Load config from legacy .pha/benchmark/categories.json
 */
function loadLegacyConfig(): {
  categories: Array<{
    id: string;
    label: string;
    labelZh: string;
    weight: number;
    description: string;
    dimensionWeights: Record<string, number>;
  }>;
  dimensions: Array<{ id: string; label: string; labelZh: string }>;
  passingScore: number;
  weakCategoryThreshold: number;
} | null {
  try {
    if (!existsSync(LEGACY_CONFIG_FILE)) return null;
    const raw = readFileSync(LEGACY_CONFIG_FILE, "utf-8");
    const config = JSON.parse(raw);
    if (config.categories && Array.isArray(config.categories)) {
      return config;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Default weights — equal-weight SHARP categories for test-case scene grouping */
const EQUAL_DIMENSION_WEIGHTS = {
  accuracy: 0.2,
  relevance: 0.2,
  helpfulness: 0.2,
  safety: 0.2,
  completeness: 0.2,
};

const DEFAULT_CATEGORY_WEIGHTS: CategoryWeightConfig[] = [
  { category: "health-data-analysis", weight: 0.2, dimensionWeights: EQUAL_DIMENSION_WEIGHTS },
  { category: "health-coaching", weight: 0.2, dimensionWeights: EQUAL_DIMENSION_WEIGHTS },
  { category: "safety-boundaries", weight: 0.2, dimensionWeights: EQUAL_DIMENSION_WEIGHTS },
  { category: "personalization-memory", weight: 0.2, dimensionWeights: EQUAL_DIMENSION_WEIGHTS },
  { category: "communication-quality", weight: 0.2, dimensionWeights: EQUAL_DIMENSION_WEIGHTS },
];

const DEFAULT_CATEGORY_LABELS: Record<BenchmarkCategory, string> = {
  "health-data-analysis": "Health Data Analysis",
  "health-coaching": "Health Coaching",
  "safety-boundaries": "Safety & Boundaries",
  "personalization-memory": "Personalization & Memory",
  "communication-quality": "Communication Quality",
};

/**
 * Load category weights from skill → legacy config → defaults.
 * Re-reads each time so edits take effect immediately.
 */
export function loadCategoryWeights(): CategoryWeightConfig[] {
  const config = loadSkillConfig() || loadLegacyConfig();
  if (config?.categories) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return config.categories.map((c: any) => ({
      category: c.id as BenchmarkCategory,
      weight: c.weight,
      dimensionWeights: c.dimensionWeights,
    }));
  }
  return DEFAULT_CATEGORY_WEIGHTS;
}

/**
 * Load category labels from skill → legacy config → defaults.
 */
export function loadCategoryLabels(): Record<string, string> {
  const config = loadSkillConfig() || loadLegacyConfig();
  if (config?.categories) {
    const labels: Record<string, string> = {};
    for (const c of config.categories) {
      labels[c.id] = c.label;
    }
    return labels;
  }
  return DEFAULT_CATEGORY_LABELS;
}

/**
 * Load full category config for UI display.
 * Priority: skill → legacy config → null.
 */
export function loadCategoriesConfig(): {
  categories: Array<{
    id: string;
    label: string;
    labelZh: string;
    weight: number;
    description: string;
    dimensionWeights: Record<string, number>;
  }>;
  dimensions: Array<{ id: string; label: string; labelZh: string }>;
  passingScore: number;
  weakCategoryThreshold: number;
} | null {
  return loadSkillConfig() || loadLegacyConfig();
}

/** @deprecated Use loadCategoryWeights() instead */
export const CATEGORY_WEIGHTS: CategoryWeightConfig[] = DEFAULT_CATEGORY_WEIGHTS;

/** @deprecated Use loadCategoryLabels() instead */
export const CATEGORY_LABELS: Record<BenchmarkCategory, string> = DEFAULT_CATEGORY_LABELS;

// ============================================================================
// YAML-driven Test Case Loader
// ============================================================================

const BENCHMARKS_DIR = join(process.cwd(), "src", "evolution", "benchmarks");

function loadTestCasesFromYaml(): TestCase[] {
  const files = readdirSync(BENCHMARKS_DIR).filter((f) => f.endsWith(".yaml"));
  const tests: TestCase[] = [];

  for (const file of files) {
    const content = readFileSync(join(BENCHMARKS_DIR, file), "utf-8");
    const doc = parseYaml(content);
    const category = doc.category;

    for (const test of doc.tests) {
      tests.push({ ...test, category });
    }
  }

  return tests;
}

// ============================================================================
// Exported Seed Data
// ============================================================================

export const ALL_BENCHMARK_TESTS: TestCase[] = loadTestCasesFromYaml();

/**
 * Get core test cases for quick profile (4 per category = 20 total)
 */
export function getCoreBenchmarkTests(): TestCase[] {
  return ALL_BENCHMARK_TESTS.filter((t) => t.difficulty === "core");
}

/**
 * Get test cases filtered by category and/or profile
 */
export function getBenchmarkTests(options: {
  profile?: "quick" | "full";
  category?: BenchmarkCategory;
}): TestCase[] {
  let tests = ALL_BENCHMARK_TESTS;

  if (options.profile === "quick") {
    tests = tests.filter((t) => t.difficulty === "core");
  }

  if (options.category) {
    tests = tests.filter((t) => t.category === options.category);
  }

  return tests;
}
