/**
 * User Store
 *
 * SQLite-based multi-user token storage for OAuth.
 * Stores tokens in .pha/users.db
 */

import { Database } from 'bun:sqlite';
import * as path from 'path';
import { mkdirSync, existsSync } from 'fs';
import { getStateDir, ensureConfigDir } from '../../utils/config.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import type { TokenData } from './huawei-types.js';

const DB_FILE = path.join('db', 'oauth.db');

// Buffer time before token expiry (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface UserToken {
  uuid: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType?: string;
  scope?: string;
  uid?: string;
}

export class UserStore {
  private db: Database;

  constructor(dbPath?: string) {
    ensureConfigDir();
    const finalPath = dbPath || path.join(getStateDir(), DB_FILE);
    const dir = path.dirname(finalPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(finalPath);
    this.init();
  }

  /**
   * Initialize database schema
   */
  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        uuid TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        token_type TEXT,
        scope TEXT,
        uid TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
    // Migration: add uid column if it doesn't exist yet
    try {
      this.db.run('ALTER TABLE users ADD COLUMN uid TEXT');
    } catch {
      // Column already exists — safe to ignore
    }
  }

  /**
   * Save or update token for a user (auto-encrypts token values)
   */
  saveToken(uuid: string, token: TokenData, uid?: string): void {
    const stateDir = getStateDir();
    const stmt = this.db.prepare(`
      INSERT INTO users (uuid, access_token, refresh_token, expires_at, token_type, scope, uid, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        token_type = excluded.token_type,
        scope = excluded.scope,
        uid = COALESCE(excluded.uid, users.uid),
        updated_at = excluded.updated_at
    `);

    stmt.run(
      uuid,
      encrypt(token.accessToken, stateDir),
      encrypt(token.refreshToken, stateDir),
      token.expiresAt,
      token.tokenType || null,
      token.scope || null,
      uid || null,
      Date.now()
    );
  }

  /**
   * Get token for a user (auto-decrypts token values)
   */
  getToken(uuid: string): UserToken | null {
    const stmt = this.db.prepare(`
      SELECT uuid, access_token, refresh_token, expires_at, token_type, scope, uid
      FROM users
      WHERE uuid = ?
    `);

    const row = stmt.get(uuid) as {
      uuid: string;
      access_token: string;
      refresh_token: string;
      expires_at: number;
      token_type: string | null;
      scope: string | null;
      uid: string | null;
    } | null;

    if (!row) {
      return null;
    }

    const stateDir = getStateDir();
    return {
      uuid: row.uuid,
      accessToken: decrypt(row.access_token, stateDir),
      refreshToken: decrypt(row.refresh_token, stateDir),
      expiresAt: row.expires_at,
      tokenType: row.token_type || undefined,
      scope: row.scope || undefined,
      uid: row.uid || undefined,
    };
  }

  /**
   * Delete token for a user
   */
  deleteToken(uuid: string): void {
    const stmt = this.db.prepare('DELETE FROM users WHERE uuid = ?');
    stmt.run(uuid);
  }

  /**
   * Check if token needs refresh (within buffer period)
   */
  needsRefresh(uuid: string): boolean {
    const token = this.getToken(uuid);
    if (!token) {
      return true;
    }
    return Date.now() >= token.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Check if user has a valid (non-expired) token
   */
  hasValidToken(uuid: string): boolean {
    const token = this.getToken(uuid);
    if (!token) {
      return false;
    }
    return Date.now() < token.expiresAt;
  }

  /**
   * Check if user is authenticated (has token, may need refresh)
   */
  isAuthenticated(uuid: string): boolean {
    return this.getToken(uuid) !== null;
  }

  /**
   * Get token as TokenData format (for compatibility)
   */
  getTokenData(uuid: string): TokenData | null {
    const token = this.getToken(uuid);
    if (!token) {
      return null;
    }

    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      tokenType: token.tokenType || 'Bearer',
      scope: token.scope,
    };
  }

  /**
   * List all user UUIDs that have stored tokens.
   */
  listUserUuids(): string[] {
    const stmt = this.db.prepare('SELECT uuid FROM users ORDER BY updated_at DESC');
    return (stmt.all() as Array<{ uuid: string }>).map((row) => row.uuid);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Default singleton instance
let _userStore: UserStore | null = null;

export function getUserStore(): UserStore {
  if (!_userStore) {
    _userStore = new UserStore();
  }
  return _userStore;
}
