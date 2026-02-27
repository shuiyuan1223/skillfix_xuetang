/**
 * Manager Search (from OpenClaw)
 *
 * Low-level vector and keyword search using sqlite-vec and FTS5.
 */

import type { DatabaseSyncType } from './compat.js';
import { truncateUtf16Safe } from './compat.js';
import { cosineSimilarity, parseEmbedding } from './internal.js';

const vectorToBlob = (embedding: number[]): Buffer => Buffer.from(new Float32Array(embedding).buffer);

export type SearchSource = string;

export type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

export async function searchVector(params: {
  db: DatabaseSyncType;
  vectorTable: string;
  providerModel: string;
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  ensureVectorReady: (dimensions: number) => Promise<boolean>;
  sourceFilterVec: { sql: string; params: SearchSource[] };
  sourceFilterChunks: { sql: string; params: SearchSource[] };
}): Promise<SearchRowResult[]> {
  if (params.queryVec.length === 0 || params.limit <= 0) {
    return [];
  }
  if (await params.ensureVectorReady(params.queryVec.length)) {
    const rows = params.db
      .prepare(
        `SELECT c.id, c.path, c.start_line, c.end_line, c.text,
       c.source,
       vec_distance_cosine(v.embedding, ?) AS dist
  FROM ${params.vectorTable} v
  JOIN chunks c ON c.id = v.id
 WHERE c.model = ?${params.sourceFilterVec.sql}
 ORDER BY dist ASC
 LIMIT ?`
      )
      .all(
        vectorToBlob(params.queryVec),
        params.providerModel,
        ...params.sourceFilterVec.params,
        params.limit
      ) as Array<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      source: SearchSource;
      dist: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: 1 - row.dist,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    }));
  }

  const candidates = listChunks({
    db: params.db,
    providerModel: params.providerModel,
    sourceFilter: params.sourceFilterChunks,
  });
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(params.queryVec, chunk.embedding),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  return scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit)
    .map((entry) => ({
      id: entry.chunk.id,
      path: entry.chunk.path,
      startLine: entry.chunk.startLine,
      endLine: entry.chunk.endLine,
      score: entry.score,
      snippet: truncateUtf16Safe(entry.chunk.text, params.snippetMaxChars),
      source: entry.chunk.source,
    }));
}

export function listChunks(params: {
  db: DatabaseSyncType;
  providerModel: string;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
  source: SearchSource;
}> {
  const rows = params.db
    .prepare(
      `SELECT id, path, start_line, end_line, text, embedding, source
  FROM chunks
 WHERE model = ?${params.sourceFilter.sql}`
    )
    .all(params.providerModel, ...params.sourceFilter.params) as Array<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: string;
    source: SearchSource;
  }>;

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
    source: row.source,
  }));
}

export async function searchKeyword(params: {
  db: DatabaseSyncType;
  ftsTable: string;
  providerModel: string;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
  buildFtsQuery: (raw: string) => string | null;
  bm25RankToScore: (rank: number) => number;
}): Promise<Array<SearchRowResult & { textScore: number }>> {
  if (params.limit <= 0) {
    return [];
  }

  // 对于中文查询，使用 LIKE 查询代替 MATCH 查询，因为 SQLite 的默认分词器对中文支持不好
  // 如果是英文查询，继续使用 MATCH 查询
  const isChineseQuery = /[\u4e00-\u9fa5]/.test(params.query);

  if (isChineseQuery) {
    const rows = params.db
      .prepare(
        `SELECT id, path, source, start_line, end_line, text,
         0 AS rank
  FROM ${params.ftsTable}
 WHERE text LIKE ? AND model = ?${params.sourceFilter.sql}
 ORDER BY LENGTH(text) ASC
 LIMIT ?`
      )
      .all(`%${params.query}%`, params.providerModel, ...params.sourceFilter.params, params.limit) as Array<{
      id: string;
      path: string;
      source: SearchSource;
      start_line: number;
      end_line: number;
      text: string;
      rank: number;
    }>;

    return rows.map((row) => {
      // 根据匹配位置和文本长度计算分数，提高搜索结果的相关性
      const matchIndex = row.text.indexOf(params.query);
      const textLength = row.text.length;

      // 匹配位置越靠前，分数越高
      const positionScore = 1 - matchIndex / textLength;

      // 文本越短，分数越高（匹配更精确）
      const lengthScore = 1 - Math.min(textLength / 1000, 0.8);

      // 综合分数，权重可以调整
      let textScore = positionScore * 0.7 + lengthScore * 0.3;

      // 提高中文查询的文本分数，确保即使向量搜索没有结果，合并后的分数也能满足 minScore（默认 0.2）
      // 因为合并时使用 vectorWeight 0.7 + textWeight 0.3，所以 textScore 需要至少 0.666 才能使总分 >= 0.2
      if (textScore < 0.7) {
        textScore = 0.7;
      }

      return {
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        score: textScore,
        textScore,
        snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
        source: row.source,
      };
    });
  }

  // 英文查询继续使用 FTS MATCH 查询
  const ftsQuery = params.buildFtsQuery(params.query);
  if (!ftsQuery) {
    return [];
  }

  const rows = params.db
    .prepare(
      `SELECT id, path, source, start_line, end_line, text,
       bm25(${params.ftsTable}) AS rank
  FROM ${params.ftsTable}
 WHERE ${params.ftsTable} MATCH ? AND model = ?${params.sourceFilter.sql}
 ORDER BY rank ASC
 LIMIT ?`
    )
    .all(ftsQuery, params.providerModel, ...params.sourceFilter.params, params.limit) as Array<{
    id: string;
    path: string;
    source: SearchSource;
    start_line: number;
    end_line: number;
    text: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const textScore = params.bm25RankToScore(row.rank);
    return {
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    };
  });
}
