/**
 * Analyzer
 *
 * Identifies patterns and weaknesses from evaluation results.
 */

import type { EvaluationResult, AnalysisResult } from './types.js';

export class Analyzer {
  /**
   * Analyze a set of evaluation results
   */
  analyze(evaluations: EvaluationResult[]): AnalysisResult {
    if (evaluations.length === 0) {
      return {
        timestamp: Date.now(),
        period: {
          start: 0,
          end: 0,
          traceCount: 0,
        },
        metrics: {
          averageScore: 0,
          scoreDistribution: {},
          improvementTrend: 0,
        },
        patterns: [],
        weaknesses: [],
      };
    }

    // Calculate time period
    const timestamps = evaluations.map((e) => e.timestamp);
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);

    // Calculate metrics
    const scores = evaluations.map((e) => e.overallScore);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Score distribution
    const distribution: Record<string, number> = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    for (const score of scores) {
      if (score <= 20) {
        distribution['0-20']++;
      } else if (score <= 40) {
        distribution['21-40']++;
      } else if (score <= 60) {
        distribution['41-60']++;
      } else if (score <= 80) {
        distribution['61-80']++;
      } else {
        distribution['81-100']++;
      }
    }

    // Calculate improvement trend (linear regression slope)
    const improvementTrend = this.calculateTrend(evaluations);

    // Identify patterns from issues
    const patterns = this.identifyPatterns(evaluations);

    // Identify weaknesses
    const weaknesses = this.identifyWeaknesses(evaluations);

    return {
      timestamp: Date.now(),
      period: {
        start,
        end,
        traceCount: evaluations.length,
      },
      metrics: {
        averageScore: Math.round(averageScore * 10) / 10,
        scoreDistribution: distribution,
        improvementTrend: Math.round(improvementTrend * 100) / 100,
      },
      patterns,
      weaknesses,
    };
  }

  private calculateTrend(evaluations: EvaluationResult[]): number {
    if (evaluations.length < 2) {
      return 0;
    }

    // Sort by timestamp
    const sorted = [...evaluations].sort((a, b) => a.timestamp - b.timestamp);

    // Simple linear regression
    const n = sorted.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = sorted.reduce((sum, e) => sum + e.overallScore, 0);
    const sumXY = sorted.reduce((sum, e, i) => sum + i * e.overallScore, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return slope;
  }

  private identifyPatterns(evaluations: EvaluationResult[]): AnalysisResult['patterns'] {
    const issueTypes = new Map<string, { count: number; examples: string[] }>();

    for (const evaluation of evaluations) {
      for (const issue of evaluation.issues) {
        const key = `${issue.type}:${issue.severity}`;
        const existing = issueTypes.get(key) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(issue.description);
        }
        issueTypes.set(key, existing);
      }
    }

    return Array.from(issueTypes.entries())
      .filter(([, data]) => data.count >= 2) // Only patterns that appear multiple times
      .map(([key, data]) => {
        const [type, severity] = key.split(':');
        return {
          type: `${type} (${severity})`,
          description: `Recurring ${type} issues with ${severity} severity`,
          frequency: data.count / evaluations.length,
          examples: data.examples,
        };
      })
      .sort((a, b) => b.frequency - a.frequency);
  }

  private identifyWeaknesses(evaluations: EvaluationResult[]): AnalysisResult['weaknesses'] {
    const weaknesses: AnalysisResult['weaknesses'] = [];

    // Aggregate scores by category
    const categories = ['accuracy', 'relevance', 'helpfulness', 'safety', 'completeness'] as const;

    for (const category of categories) {
      const scores = evaluations.map((e) => e.scores[category]);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      if (avgScore < 70) {
        let impact: 'low' | 'medium' | 'high' = 'low';
        if (avgScore < 50) {
          impact = 'high';
        } else if (avgScore < 60) {
          impact = 'medium';
        }

        weaknesses.push({
          category,
          description: `Average ${category} score is ${Math.round(avgScore)}/100`,
          impact,
          suggestedFix: this.getSuggestedFix(category, avgScore),
        });
      }
    }

    return weaknesses.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });
  }

  private getSuggestedFix(category: string, _score: number): string {
    const fixes: Record<string, string> = {
      accuracy:
        'Improve data verification and fact-checking in the system prompt. Consider adding explicit instructions to cross-reference health data.',
      relevance:
        "Enhance query understanding and response targeting. Add instructions to stay focused on the user's specific question.",
      helpfulness: 'Make responses more actionable. Include specific, concrete suggestions rather than general advice.',
      safety:
        'Strengthen safety guidelines. Add explicit instructions to recommend professional help for serious concerns.',
      completeness:
        'Ensure all aspects of queries are addressed. Add instructions to break down complex questions and answer each part.',
    };

    return fixes[category] || 'Review and improve the relevant aspect of the system prompt.';
  }
}

// Default instance
export const analyzer = new Analyzer();
