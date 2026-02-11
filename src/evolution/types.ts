/**
 * Evolution System Types
 */

// Trace: A recorded interaction with the agent
export interface Trace {
  id: string;
  timestamp: number;
  sessionId: string;

  // Input
  userMessage: string;
  context?: {
    healthData?: Record<string, unknown>;
    previousMessages?: Array<{ role: string; content: string }>;
  };

  // Output
  agentResponse: string;
  toolCalls?: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;

  // Metadata
  duration: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

// Evaluation result for a single trace
export interface EvaluationResult {
  traceId: string;
  timestamp: number;

  // Scores (0-100)
  scores: {
    accuracy: number; // Factual correctness
    relevance: number; // Response relevance to query
    helpfulness: number; // Actionable and useful
    safety: number; // No harmful advice
    completeness: number; // Addresses all aspects
  };

  // Overall score (weighted average)
  overallScore: number;

  // Qualitative feedback
  feedback: string;

  // Identified issues
  issues: Array<{
    type: "accuracy" | "relevance" | "safety" | "completeness" | "tone";
    description: string;
    severity: "low" | "medium" | "high";
  }>;
}

// Analysis result across multiple evaluations
export interface AnalysisResult {
  timestamp: number;
  period: {
    start: number;
    end: number;
    traceCount: number;
  };

  // Aggregate metrics
  metrics: {
    averageScore: number;
    scoreDistribution: Record<string, number>;
    improvementTrend: number; // positive = improving
  };

  // Identified patterns
  patterns: Array<{
    type: string;
    description: string;
    frequency: number;
    examples: string[];
  }>;

  // Weakness areas
  weaknesses: Array<{
    category: string;
    description: string;
    impact: "low" | "medium" | "high";
    suggestedFix: string;
  }>;
}

// Optimization suggestion
export interface OptimizationSuggestion {
  id: string;
  timestamp: number;

  type: "prompt" | "tool" | "behavior";

  // What to change
  target: string;
  currentValue?: string;
  suggestedValue: string;

  // Why
  rationale: string;
  expectedImprovement: string;

  // Validation
  status: "pending" | "testing" | "validated" | "applied" | "rejected";
  validationResults?: {
    before: number;
    after: number;
    improvement: number;
  };
}

// ============================================================================
// SHARP 2.0 Types
// ============================================================================

/** SHARP 2.0 single sub-component rating */
export interface SharpRating {
  category: string; // "Safety" | "Usefulness" | "Accuracy" | "Relevance" | "Personalization"
  subComponent: string; // "Risk Disclosure" | "Medical Boundary" | ...
  score: number; // 1.0 | 0.5 | 0.0
  scoringType: "binary" | "3-point";
  reason: string;
}

/** SHARP 2.0 evaluation summary */
export interface SharpSummary {
  totalComponents: number; // 16
  perfectScores: number;
  failedComponents: number;
  averageScore: number; // 0.0-1.0
  passRate: number; // 0-100%
  criticalFailures: number; // binary 0.0 count
}

/** SHARP Rubric sub-component definition (loaded from JSON) */
export interface SharpSubComponent {
  name: string;
  evaluation_criteria: string;
  scoring_mechanism: "Binary" | "3-Point Scale";
  scoring_logic: string;
}

/** SHARP Rubric category definition */
export interface SharpRubricCategory {
  category: string;
  description: string;
  sub_components: SharpSubComponent[];
}

// ============================================================================
// Test & Benchmark Types
// ============================================================================

// Test case for evaluation
export interface TestCase {
  id: string;
  category: string;
  subcategory?: string;
  query: string;
  context?: {
    healthData?: Record<string, unknown>;
  };
  expected: {
    shouldMention?: string[];
    shouldNotMention?: string[];
    minScore?: number;
    safetyConcerns?: string[];
  };
  difficulty?: "core" | "easy" | "medium" | "hard";
  mock_context?: Record<string, unknown>;
}

// Benchmark category definitions
export type BenchmarkCategory =
  | "health-data-analysis"
  | "health-coaching"
  | "safety-boundaries"
  | "personalization-memory"
  | "communication-quality";

/** @deprecated Use SHARP 2.0 equal-weight categories instead */
export interface CategoryDimensionWeights {
  accuracy: number;
  relevance: number;
  helpfulness: number;
  safety: number;
  completeness: number;
}

// Benchmark run - a single execution of the benchmark suite
export interface BenchmarkRun {
  id: string;
  timestamp: number;
  versionTag?: string;
  promptVersions: Record<string, string>; // filename -> git hash
  skillVersions: Record<string, string>;
  totalTestCases: number;
  passedCount: number;
  failedCount: number;
  overallScore: number;
  durationMs: number;
  profile: "quick" | "full";
  metadata?: Record<string, unknown>;
}

// Category score within a benchmark run
export interface CategoryScore {
  id: string;
  runId: string;
  category: BenchmarkCategory;
  subcategory?: string;
  score: number;
  testCount: number;
  passedCount: number;
  details?: SharpRating[]; // SHARP 2.0 sub-component details
}

// Individual benchmark result for a test case
export interface BenchmarkResult {
  id: string;
  runId: string;
  testCaseId: string;
  timestamp: number;
  agentResponse: string;
  toolCalls?: Array<{ tool: string; arguments: unknown; result: unknown }>;
  scores: SharpRating[]; // 16 SHARP sub-component ratings
  overallScore: number; // 0.0-1.0 (SHARP 2.0)
  passed: boolean;
  feedback: string;
  issues?: Array<{ type: string; description: string; severity: string }>;
  durationMs: number;
}

// Benchmark profile
export type BenchmarkProfile = "quick" | "full";

// Category weight configuration
export interface CategoryWeightConfig {
  category: BenchmarkCategory;
  weight: number;
  dimensionWeights: CategoryDimensionWeights; // @deprecated - kept for backward compat
}

// Radar chart data point
export interface RadarDataPoint {
  category: BenchmarkCategory;
  label: string;
  score: number;
  maxScore: number;
}

// Version comparison result
export interface VersionComparison {
  run1: BenchmarkRun;
  run2: BenchmarkRun;
  categoryDeltas: Array<{
    category: BenchmarkCategory;
    score1: number;
    score2: number;
    delta: number;
    improved: boolean;
  }>;
  overallDelta: number;
  flippedTests: Array<{
    testCaseId: string;
    wasPass: boolean;
    nowPass: boolean;
  }>;
}

// Auto-loop configuration
export interface AutoLoopConfig {
  maxIterations: number;
  targetScore: number;
  branch: string;
  profile: BenchmarkProfile;
  regressionThreshold: number; // max allowed regression in points
}
