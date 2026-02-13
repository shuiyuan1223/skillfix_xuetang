/**
 * User Store - User tracking and preferences management
 * Profile data lives in PROFILE.md files (source of truth), not in SQLite.
 */

import { Database } from "bun:sqlite";
import type { UserPreferences } from "./types.js";

export class UserStore {
  constructor(private db: Database) {}

  /**
   * Ensure user exists
   */
  ensureUser(uuid: string): void {
    this.db.run(
      `INSERT OR IGNORE INTO users (uuid, preferences_json, created_at, updated_at)
       VALUES (?, '{}', strftime('%s', 'now'), strftime('%s', 'now'))`,
      [uuid]
    );
  }

  /**
   * Get user preferences
   */
  getPreferences(uuid: string): UserPreferences {
    const row = this.db
      .query<
        { preferences_json: string },
        [string]
      >("SELECT preferences_json FROM users WHERE uuid = ?")
      .get(uuid);

    if (!row) {
      return {};
    }

    try {
      return JSON.parse(row.preferences_json) as UserPreferences;
    } catch {
      return {};
    }
  }

  /**
   * Update user preferences (merge)
   */
  updatePreferences(uuid: string, updates: Partial<UserPreferences>): void {
    this.ensureUser(uuid);

    const current = this.getPreferences(uuid);
    const merged = { ...current, ...updates };

    this.db.run(
      `UPDATE users SET preferences_json = ?, updated_at = strftime('%s', 'now') WHERE uuid = ?`,
      [JSON.stringify(merged), uuid]
    );
  }

  /**
   * Delete user and all their data
   */
  deleteUser(uuid: string): void {
    this.db.run("DELETE FROM users WHERE uuid = ?", [uuid]);
  }

  /**
   * List all users
   */
  listUsers(): Array<{ uuid: string; createdAt: number; updatedAt: number }> {
    return this.db
      .query<{ uuid: string; created_at: number; updated_at: number }, []>(
        "SELECT uuid, created_at, updated_at FROM users ORDER BY updated_at DESC"
      )
      .all()
      .map((row) => ({
        uuid: row.uuid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }
}
