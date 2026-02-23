/**
 * Proactive Store — JSON file storage for recommendations, reminders, calendar events
 *
 * Storage path: .pha/users/{uuid}/proactive/{type}.json
 * This is the internal implementation; production deploys can swap with real APIs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getUserDir } from "../memory/profile.js";
import type { Recommendation, Reminder, CalendarEvent } from "./types.js";

function getProactiveDir(uuid: string): string {
  return join(getUserDir(uuid), "proactive");
}

function ensureDir(uuid: string): string {
  const dir = getProactiveDir(uuid);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJson<T>(filePath: string, fallback: T[]): T[] {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T[];
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, data: T[]): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================================
// Recommendations
// ============================================================================

export function listRecommendations(uuid: string, statusFilter?: string): Recommendation[] {
  const file = join(getProactiveDir(uuid), "recommendations.json");
  let items = readJson<Recommendation>(file, []);

  // Auto-expire
  const now = new Date().toISOString();
  let changed = false;
  for (const item of items) {
    if (item.status === "active" && item.expiresAt && item.expiresAt < now) {
      item.status = "dismissed";
      item.dismissedAt = now;
      changed = true;
    }
  }
  if (changed) writeJson(file, items);

  if (statusFilter) {
    items = items.filter((r) => r.status === statusFilter);
  }
  return items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export function saveRecommendation(uuid: string, rec: Recommendation): void {
  const dir = ensureDir(uuid);
  const file = join(dir, "recommendations.json");
  const items = readJson<Recommendation>(file, []);
  const idx = items.findIndex((r) => r.id === rec.id);
  if (idx >= 0) items[idx] = rec;
  else items.push(rec);
  writeJson(file, items);
}

export function getRecommendation(uuid: string, id: string): Recommendation | null {
  const items = listRecommendations(uuid);
  return items.find((r) => r.id === id) ?? null;
}

// ============================================================================
// Reminders
// ============================================================================

export function listReminders(uuid: string, statusFilter?: string): Reminder[] {
  const file = join(getProactiveDir(uuid), "reminders.json");
  let items = readJson<Reminder>(file, []);

  // Auto-expire past reminders (non-repeating, not completed)
  const now = new Date().toISOString();
  let changed = false;
  for (const item of items) {
    if (item.status === "pending" && item.repeatRule === "none" && item.scheduledAt < now) {
      item.status = "expired";
      changed = true;
    }
  }
  if (changed) writeJson(file, items);

  if (statusFilter) {
    items = items.filter((r) => r.status === statusFilter);
  }
  return items.sort((a, b) => (a.scheduledAt > b.scheduledAt ? 1 : -1));
}

export function saveReminder(uuid: string, reminder: Reminder): void {
  const dir = ensureDir(uuid);
  const file = join(dir, "reminders.json");
  const items = readJson<Reminder>(file, []);
  const idx = items.findIndex((r) => r.id === reminder.id);
  if (idx >= 0) items[idx] = reminder;
  else items.push(reminder);
  writeJson(file, items);
}

export function getReminder(uuid: string, id: string): Reminder | null {
  const items = listReminders(uuid);
  return items.find((r) => r.id === id) ?? null;
}

export function deleteReminder(uuid: string, id: string): boolean {
  const dir = getProactiveDir(uuid);
  const file = join(dir, "reminders.json");
  const items = readJson<Reminder>(file, []);
  const filtered = items.filter((r) => r.id !== id);
  if (filtered.length === items.length) return false;
  writeJson(file, filtered);
  return true;
}

// ============================================================================
// Calendar Events
// ============================================================================

export function listCalendarEvents(
  uuid: string,
  opts?: { from?: string; to?: string; status?: string }
): CalendarEvent[] {
  const file = join(getProactiveDir(uuid), "calendar.json");
  let items = readJson<CalendarEvent>(file, []);

  if (opts?.status) {
    items = items.filter((e) => e.status === opts.status);
  }
  if (opts?.from) {
    items = items.filter((e) => e.startTime >= opts.from!);
  }
  if (opts?.to) {
    items = items.filter((e) => e.startTime <= opts.to!);
  }
  return items.sort((a, b) => (a.startTime > b.startTime ? 1 : -1));
}

export function saveCalendarEvent(uuid: string, event: CalendarEvent): void {
  const dir = ensureDir(uuid);
  const file = join(dir, "calendar.json");
  const items = readJson<CalendarEvent>(file, []);
  const idx = items.findIndex((e) => e.id === event.id);
  if (idx >= 0) items[idx] = event;
  else items.push(event);
  writeJson(file, items);
}

export function getCalendarEvent(uuid: string, id: string): CalendarEvent | null {
  const items = listCalendarEvents(uuid);
  return items.find((e) => e.id === id) ?? null;
}

export function deleteCalendarEvent(uuid: string, id: string): boolean {
  const dir = getProactiveDir(uuid);
  const file = join(dir, "calendar.json");
  const items = readJson<CalendarEvent>(file, []);
  const filtered = items.filter((e) => e.id !== id);
  if (filtered.length === items.length) return false;
  writeJson(file, filtered);
  return true;
}
