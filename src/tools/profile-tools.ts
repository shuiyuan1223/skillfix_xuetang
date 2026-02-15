/**
 * Profile Tools - MCP tools for user profile management
 *
 * update_user_profile: Save user info collected through conversation
 * complete_onboarding: Finish first-conversation guidance
 */

import { getMemoryManager } from "../memory/index.js";
import { getUserUuid } from "../utils/config.js";
import type { UserProfile } from "../memory/types.js";

export interface UpdateProfileParams {
  nickname?: string;
  gender?: string;
  birthYear?: number;
  height?: number;
  weight?: number;
  conditions?: string;
  allergies?: string;
  primaryGoal?: string;
  exercisePreference?: string;
  sleepSchedule?: string;
  dietPreference?: string;
}

export const updateUserProfileTool = {
  name: "update_user_profile",
  description:
    "Save user profile information collected during conversation. Call this whenever the user shares personal info (name, age, height, weight, health goals, etc.).",
  execute: async (
    params: UpdateProfileParams
  ): Promise<{ success: boolean; updated: string[] }> => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();

    const updates: Partial<UserProfile> = {};
    const updatedFields: string[] = [];

    if (params.nickname !== undefined) {
      updates.nickname = params.nickname;
      updatedFields.push("nickname");
    }
    if (params.gender !== undefined) {
      updates.gender = params.gender === "male" ? "male" : "female";
      updatedFields.push("gender");
    }
    if (params.birthYear !== undefined) {
      updates.birthYear = params.birthYear;
      updatedFields.push("birthYear");
    }
    if (params.height !== undefined) {
      updates.height = params.height;
      updatedFields.push("height");
    }
    if (params.weight !== undefined) {
      updates.weight = params.weight;
      updatedFields.push("weight");
    }
    if (params.conditions !== undefined) {
      updates.conditions = params.conditions.split(/[,，]/).map((s) => s.trim());
      updatedFields.push("conditions");
    }
    if (params.allergies !== undefined) {
      updates.allergies = params.allergies.split(/[,，]/).map((s) => s.trim());
      updatedFields.push("allergies");
    }
    if (params.primaryGoal !== undefined) {
      updates.goals = { primary: params.primaryGoal };
      updatedFields.push("primaryGoal");
    }
    if (params.exercisePreference !== undefined) {
      updates.lifestyle = {
        ...(updates.lifestyle || {}),
        exercisePreference: params.exercisePreference,
      };
      updatedFields.push("exercisePreference");
    }
    if (params.sleepSchedule !== undefined) {
      updates.lifestyle = { ...(updates.lifestyle || {}), sleepSchedule: params.sleepSchedule };
      updatedFields.push("sleepSchedule");
    }
    if (params.dietPreference !== undefined) {
      updates.lifestyle = { ...(updates.lifestyle || {}), dietPreference: params.dietPreference };
      updatedFields.push("dietPreference");
    }

    if (updatedFields.length > 0) {
      mm.updateProfile(uuid, updates);
    }

    return { success: true, updated: updatedFields };
  },
};

export const completeOnboardingTool = {
  name: "complete_onboarding",
  description:
    "Complete the first-conversation onboarding. Call this after collecting at least 4 core profile fields (gender, birthYear, height, weight). This removes the BOOTSTRAP.md guidance file.",
  execute: async (): Promise<{ success: boolean; message: string }> => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();

    const deleted = mm.completeOnboarding(uuid);
    if (deleted) {
      return {
        success: true,
        message: "Onboarding complete. BOOTSTRAP.md removed. Normal conversation mode.",
      };
    }
    return { success: true, message: "No BOOTSTRAP.md found — already completed." };
  },
};
