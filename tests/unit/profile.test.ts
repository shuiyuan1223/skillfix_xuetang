/**
 * Tests for Profile File Management
 *
 * Tests parseProfileMd, generateProfileMd, and formatProfileForPrompt.
 */

import { describe, test, expect } from "bun:test";
import { formatProfileForPrompt } from "../../src/memory/profile.js";
import type { UserProfile } from "../../src/memory/types.js";

describe("formatProfileForPrompt", () => {
  test("returns placeholder when profile is empty", () => {
    const result = formatProfileForPrompt({});
    expect(result).toContain("Missing Profile Fields");
    expect(result).toContain("gender");
    expect(result).toContain("birthYear");
  });

  test("shows known fields", () => {
    const profile: UserProfile = {
      nickname: "Alice",
      gender: "female",
      birthYear: 1990,
      height: 165,
      weight: 60,
      location: "Beijing",
    };
    const result = formatProfileForPrompt(profile);
    expect(result).toContain("Nickname: Alice");
    expect(result).toContain("Gender: female");
    expect(result).toContain("Height: 165cm");
    expect(result).toContain("Weight: 60kg");
    expect(result).toContain("Location: Beijing");
    expect(result).toContain("BMI:");
  });

  test("calculates BMI when height and weight present", () => {
    const profile: UserProfile = { height: 170, weight: 70 };
    const result = formatProfileForPrompt(profile);
    // BMI = 70 / (1.7)^2 = 24.2
    expect(result).toContain("BMI: 24.2");
  });

  test("calculates age from birth year", () => {
    const profile: UserProfile = { birthYear: 2000 };
    const result = formatProfileForPrompt(profile);
    const expectedAge = new Date().getFullYear() - 2000;
    expect(result).toContain(`Age: ${expectedAge}`);
    expect(result).toContain("born 2000");
  });

  test("shows conditions and allergies", () => {
    const profile: UserProfile = {
      conditions: ["Hypertension", "Diabetes"],
      allergies: ["Peanuts"],
    };
    const result = formatProfileForPrompt(profile);
    expect(result).toContain("Conditions: Hypertension, Diabetes");
    expect(result).toContain("Allergies: Peanuts");
  });

  test("shows health goal", () => {
    const profile: UserProfile = { goals: { primary: "Lose weight" } };
    const result = formatProfileForPrompt(profile);
    expect(result).toContain("Health goal: Lose weight");
  });

  test("identifies missing core fields", () => {
    const profile: UserProfile = { nickname: "Bob" };
    const result = formatProfileForPrompt(profile);
    expect(result).toContain("**Core:** gender, birthYear, height, weight");
  });

  test("identifies missing optional fields", () => {
    const profile: UserProfile = {
      gender: "male",
      birthYear: 1985,
      height: 180,
      weight: 80,
    };
    const result = formatProfileForPrompt(profile);
    expect(result).toContain("**Optional:** goals.primary, conditions");
    expect(result).not.toContain("**Core:**");
  });

  test("no missing fields section when profile is complete", () => {
    const profile: UserProfile = {
      gender: "male",
      birthYear: 1985,
      height: 180,
      weight: 80,
      conditions: ["None"],
      goals: { primary: "Stay healthy" },
    };
    const result = formatProfileForPrompt(profile);
    expect(result).not.toContain("Missing Profile Fields");
  });

  test("returns empty-profile message when truly empty", () => {
    // All core missing + no known fields at all
    const result = formatProfileForPrompt({});
    expect(result).toContain("Missing Profile Fields");
  });
});
