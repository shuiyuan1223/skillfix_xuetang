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

// Test case for evaluation
export interface TestCase {
  id: string;
  category: string;
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
}
