/**
 * Hybrid Search - Combine vector and keyword search results
 * Based on OpenClaw's implementation
 */

export interface HybridVectorResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  vectorScore: number;
}

export interface HybridKeywordResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  textScore: number;
}

export interface HybridConfig {
  /** Weight for vector search results (default: 0.7) */
  vectorWeight: number;
  /** Weight for keyword search results (default: 0.3) */
  textWeight: number;
  /** Multiplier for candidate retrieval (default: 3) */
  candidateMultiplier: number;
}

export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  vectorWeight: 0.7,
  textWeight: 0.3,
  candidateMultiplier: 3,
};

/**
 * Build FTS5 query from raw text
 * Tokenizes and creates AND query
 */
export function buildFtsQuery(raw: string): string | null {
  // Extract alphanumeric tokens (works for English)
  // For Chinese, we'll use simple character-based matching
  const tokens =
    raw
      .match(/[\u4e00-\u9fa5]+|[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];

  if (tokens.length === 0) {
    return null;
  }

  // Quote each token and join with OR for broader matching
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" OR ");
}

/**
 * Convert BM25 rank to normalized score
 * Lower rank = better match, so we invert it
 */
export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

/**
 * Merge vector and keyword search results with weighted scoring
 */
export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}> {
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      snippet: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  // Add vector results
  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  // Merge keyword results
  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      // Update text score and prefer keyword snippet if available
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      // Add new entry from keyword search
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  // Calculate weighted scores and sort
  const merged = Array.from(byId.values()).map((entry) => {
    const score = params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore;
    return {
      id: entry.id,
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
    };
  });

  return merged.sort((a, b) => b.score - a.score);
}
