/**
 * Plan Store — JSON file storage for health plans
 *
 * Storage path: .pha/users/{uuid}/plans/{plan-id}.json
 * Follows the same pattern as profile.ts for user-scoped data.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getUserDir } from '../memory/profile.js';
import type { HealthPlan, PlanStatus } from './types.js';

function getPlansDir(uuid: string): string {
  return join(getUserDir(uuid), 'plans');
}

function ensurePlansDir(uuid: string): string {
  const dir = getPlansDir(uuid);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function savePlan(uuid: string, plan: HealthPlan): void {
  const dir = ensurePlansDir(uuid);
  plan.updatedAt = new Date().toISOString();
  writeFileSync(join(dir, `${plan.id}.json`), JSON.stringify(plan, null, 2));
}

export function loadPlan(uuid: string, planId: string): HealthPlan | null {
  const filePath = join(getPlansDir(uuid), `${planId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as HealthPlan;
}

export function listPlans(uuid: string, statusFilter?: PlanStatus): HealthPlan[] {
  const dir = getPlansDir(uuid);
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const plans: HealthPlan[] = [];

  for (const file of files) {
    try {
      const plan = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as HealthPlan;
      if (!statusFilter || plan.status === statusFilter) {
        plans.push(plan);
      }
    } catch {
      // Skip corrupted files
    }
  }

  // Sort by updatedAt descending (most recent first)
  return plans.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

export function deletePlan(uuid: string, planId: string): boolean {
  const filePath = join(getPlansDir(uuid), `${planId}.json`);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}
