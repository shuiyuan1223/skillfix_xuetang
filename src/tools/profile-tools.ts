/**
 * Profile Tools - MCP tools for user profile management
 *
 * update_user_profile: Save user info collected through conversation
 * complete_onboarding: Finish first-conversation guidance
 */

import { getMemoryManager } from '../memory/index.js';
import { getUserUuid } from '../utils/config.js';
import type { UserProfile } from '../memory/types.js';
import type { PHATool } from './types.js';

export interface UpdateProfileParams {
  nickname?: string;
  gender?: string;
  birthYear?: number;
  height?: number;
  weight?: number;
  location?: string;
  conditions?: string;
  allergies?: string;
  primaryGoal?: string;
  exercisePreference?: string;
  sleepSchedule?: string;
  dietPreference?: string;
}

export const updateUserProfileTool: PHATool<UpdateProfileParams> = {
  name: 'update_user_profile',
  description: '保存对话中收集到的用户档案信息。当用户分享个人信息（姓名、年龄、身高、体重、健康目标等）时调用。',
  displayName: '更新健康档案',
  category: 'profile',
  icon: 'user',
  label: 'Update User Profile',
  inputSchema: {
    type: 'object',
    properties: {
      nickname: { type: 'string', description: "User's preferred name" },
      gender: { type: 'string', description: "Gender: 'male' or 'female'" },
      birthYear: { type: 'number', description: 'Birth year (e.g. 1990)' },
      height: { type: 'number', description: 'Height in cm' },
      weight: { type: 'number', description: 'Weight in kg' },
      location: { type: 'string', description: "City name (e.g. '北京', 'Shanghai')" },
      conditions: { type: 'string', description: 'Health conditions (comma-separated)' },
      allergies: { type: 'string', description: 'Allergies (comma-separated)' },
      primaryGoal: { type: 'string', description: 'Primary health goal' },
      exercisePreference: { type: 'string', description: 'Exercise preference' },
      sleepSchedule: { type: 'string', description: 'Sleep schedule' },
      dietPreference: { type: 'string', description: 'Diet preference' },
    },
  },
  execute: async (params: UpdateProfileParams): Promise<{ success: boolean; updated: string[] }> => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();

    const updates: Partial<UserProfile> = {};
    const updatedFields: string[] = [];

    if (params.nickname !== undefined) {
      updates.nickname = params.nickname;
      updatedFields.push('nickname');
    }
    if (params.gender !== undefined) {
      updates.gender = params.gender === 'male' ? 'male' : 'female';
      updatedFields.push('gender');
    }
    if (params.birthYear !== undefined) {
      updates.birthYear = params.birthYear;
      updatedFields.push('birthYear');
    }
    if (params.height !== undefined) {
      updates.height = params.height;
      updatedFields.push('height');
    }
    if (params.weight !== undefined) {
      updates.weight = params.weight;
      updatedFields.push('weight');
    }
    if (params.location !== undefined) {
      updates.location = params.location;
      updatedFields.push('location');
    }
    if (params.conditions !== undefined) {
      updates.conditions = params.conditions.split(/[,，]/).map((s) => s.trim());
      updatedFields.push('conditions');
    }
    if (params.allergies !== undefined) {
      updates.allergies = params.allergies.split(/[,，]/).map((s) => s.trim());
      updatedFields.push('allergies');
    }
    if (params.primaryGoal !== undefined) {
      updates.goals = { primary: params.primaryGoal };
      updatedFields.push('primaryGoal');
    }
    if (params.exercisePreference !== undefined) {
      updates.lifestyle = {
        ...(updates.lifestyle || {}),
        exercisePreference: params.exercisePreference,
      };
      updatedFields.push('exercisePreference');
    }
    if (params.sleepSchedule !== undefined) {
      updates.lifestyle = { ...(updates.lifestyle || {}), sleepSchedule: params.sleepSchedule };
      updatedFields.push('sleepSchedule');
    }
    if (params.dietPreference !== undefined) {
      updates.lifestyle = { ...(updates.lifestyle || {}), dietPreference: params.dietPreference };
      updatedFields.push('dietPreference');
    }

    if (updatedFields.length > 0) {
      mm.updateProfile(uuid, updates);
    }

    return { success: true, updated: updatedFields };
  },
};

export const completeOnboardingTool: PHATool<Record<string, never>> = {
  name: 'complete_onboarding',
  description:
    '完成首次对话引导。在收集到至少 4 个核心档案字段（性别、出生年份、身高、体重）后调用。此操作会移除 BOOTSTRAP.md 引导文件。',
  displayName: '完成引导',
  category: 'profile',
  icon: 'check',
  label: 'Complete Onboarding',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (): Promise<{ success: boolean; message: string }> => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();

    const deleted = mm.completeOnboarding(uuid);
    if (deleted) {
      return {
        success: true,
        message: 'Onboarding complete. BOOTSTRAP.md removed. Normal conversation mode.',
      };
    }
    return { success: true, message: 'No BOOTSTRAP.md found — already completed.' };
  },
};

export const profileTools = [updateUserProfileTool, completeOnboardingTool];
