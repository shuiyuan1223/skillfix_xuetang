/**
 * Vector Store using sqlite-vec
 * Embedded vector search within the same SQLite database
 */

import { Database } from "bun:sqlite";
import { getEmbeddingProvider, isEmbeddingEnabled, type EmbeddingConfig } from "./embeddings.js";
import type { MemorySearchResult } from "./types.js";

export interface VectorDocument {
  id: string;
  text: string;
  metadata: {
    uuid: string;
    path: string;
    startLine: number;
    endLine: number;
    source: string;
  };
}

/**
 * Vector Store - uses sqlite-vec for in-database vector search
 */
export class VectorStore {
  private embeddingProvider: ReturnType<typeof getEmbeddingProvider> | null = null;
  private initialized = false;

  constructor(
    private db: Database,
    private vecAvailable: boolean,
    embeddingConfig?: EmbeddingConfig
  ) {
    if (!vecAvailable) {
      return;
    }

    if (!isEmbeddingEnabled()) {
      return;
    }

    try {
      this.embeddingProvider = getEmbeddingProvider(embeddingConfig);
      this.initialized = true;
    } catch (error) {
      console.warn("[VectorStore] Failed to initialize embeddings:", error);
    }
  }

  /**
   * Add documents to the store
   */
  async addDocuments(docs: VectorDocument[]): Promise<void> {
    if (!this.embeddingProvider || docs.length === 0 || !this.vecAvailable) return;

    // Group by user
    const byUser = new Map<string, VectorDocument[]>();
    for (const doc of docs) {
      const uuid = doc.metadata.uuid;
      if (!byUser.has(uuid)) {
        byUser.set(uuid, []);
      }
      byUser.get(uuid)!.push(doc);
    }

    for (const [, userDocs] of byUser) {
      try {
        const texts = userDocs.map((d) => d.text);
        const embeddings = await this.embeddingProvider.embedBatch(texts);

        const insert = this.db.prepare(
          `INSERT OR REPLACE INTO vec_chunks (chunk_id, embedding, uuid, path, start_line, end_line)
           VALUES (?, ?, ?, ?, ?, ?)`
        );

        const tx = this.db.transaction(() => {
          for (let i = 0; i < userDocs.length; i++) {
            const doc = userDocs[i];
            const embedding = embeddings[i];
            insert.run(
              doc.id,
              new Float32Array(embedding),
              doc.metadata.uuid,
              doc.metadata.path,
              doc.metadata.startLine,
              doc.metadata.endLine
            );
          }
        });

        tx();
      } catch (error) {
        console.warn("[VectorStore] Failed to add documents:", error);
      }
    }
  }

  /**
   * Search for similar documents
   */
  async search(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    if (!this.embeddingProvider || !this.vecAvailable) {
      return [];
    }

    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.3;

    try {
      const queryEmbedding = await this.embeddingProvider.embed(query);

      // sqlite-vec: distance is cosine distance (0 = identical, 2 = opposite)
      // Convert to score: score = 1 - distance (for cosine metric)
      const rows = this.db
        .query<
          {
            chunk_id: string;
            distance: number;
            path: string;
            start_line: number;
            end_line: number;
          },
          [Float32Array, string, number]
        >(
          `SELECT chunk_id, distance, path, start_line, end_line
           FROM vec_chunks
           WHERE embedding MATCH ? AND uuid = ?
           ORDER BY distance
           LIMIT ?`
        )
        .all(new Float32Array(queryEmbedding), uuid, maxResults);

      return rows
        .map((row) => {
          const score = 1 - row.distance;
          // Look up the text from chunks table
          const chunk = this.db
            .query<{ text: string }, [string]>("SELECT text FROM chunks WHERE id = ?")
            .get(row.chunk_id);

          return {
            path: row.path,
            startLine: row.start_line,
            endLine: row.end_line,
            score,
            snippet: (chunk?.text ?? "").slice(0, 200),
          };
        })
        .filter((r) => r.score >= minScore);
    } catch (error) {
      console.warn("[VectorStore] Search failed:", error);
      return [];
    }
  }

  /**
   * Delete all documents for a user
   */
  deleteUserDocuments(uuid: string): void {
    if (!this.vecAvailable) return;
    try {
      this.db.run("DELETE FROM vec_chunks WHERE uuid = ?", [uuid]);
    } catch (error) {
      console.warn("[VectorStore] Failed to delete documents:", error);
    }
  }

  /**
   * Delete documents by path
   */
  deleteByPath(uuid: string, path: string): void {
    if (!this.vecAvailable) return;
    try {
      this.db.run("DELETE FROM vec_chunks WHERE uuid = ? AND path = ?", [uuid, path]);
    } catch (error) {
      console.warn("[VectorStore] Failed to delete by path:", error);
    }
  }

  /**
   * Check if store is available (has embedding provider + sqlite-vec)
   */
  isAvailable(): boolean {
    return this.initialized && this.vecAvailable && this.embeddingProvider !== null;
  }
}
