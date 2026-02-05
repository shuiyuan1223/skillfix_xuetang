/**
 * Tests for Huawei Types
 *
 * Tests the mapActivityType function and type mappings.
 */

import { describe, test, expect } from "bun:test";
import {
  mapActivityType,
  HuaweiActivityType,
  ACTIVITY_TYPE_MAP,
} from "../../src/data-sources/huawei/huawei-types.js";

describe("mapActivityType", () => {
  test("maps RUNNING (1) to 'running'", () => {
    expect(mapActivityType(HuaweiActivityType.RUNNING)).toBe("running");
    expect(mapActivityType(1)).toBe("running");
  });

  test("maps WALKING (2) to 'walking'", () => {
    expect(mapActivityType(HuaweiActivityType.WALKING)).toBe("walking");
    expect(mapActivityType(2)).toBe("walking");
  });

  test("maps CYCLING (3) to 'cycling'", () => {
    expect(mapActivityType(HuaweiActivityType.CYCLING)).toBe("cycling");
    expect(mapActivityType(3)).toBe("cycling");
  });

  test("maps SWIMMING (4) to 'swimming'", () => {
    expect(mapActivityType(HuaweiActivityType.SWIMMING)).toBe("swimming");
    expect(mapActivityType(4)).toBe("swimming");
  });

  test("maps HIKING (5) to 'hiking'", () => {
    expect(mapActivityType(HuaweiActivityType.HIKING)).toBe("hiking");
    expect(mapActivityType(5)).toBe("hiking");
  });

  test("maps WORKOUT (6) to 'workout'", () => {
    expect(mapActivityType(HuaweiActivityType.WORKOUT)).toBe("workout");
    expect(mapActivityType(6)).toBe("workout");
  });

  test("maps STRENGTH (100) to 'strength'", () => {
    expect(mapActivityType(HuaweiActivityType.STRENGTH)).toBe("strength");
    expect(mapActivityType(100)).toBe("strength");
  });

  test("maps YOGA (101) to 'yoga'", () => {
    expect(mapActivityType(HuaweiActivityType.YOGA)).toBe("yoga");
    expect(mapActivityType(101)).toBe("yoga");
  });

  test("maps unknown activity types to 'other'", () => {
    expect(mapActivityType(0)).toBe("other");
    expect(mapActivityType(-1)).toBe("other");
    expect(mapActivityType(999)).toBe("other");
    expect(mapActivityType(50)).toBe("other");
  });
});

describe("ACTIVITY_TYPE_MAP", () => {
  test("contains all HuaweiActivityType values", () => {
    const activityTypes = [
      HuaweiActivityType.RUNNING,
      HuaweiActivityType.WALKING,
      HuaweiActivityType.CYCLING,
      HuaweiActivityType.SWIMMING,
      HuaweiActivityType.HIKING,
      HuaweiActivityType.WORKOUT,
      HuaweiActivityType.STRENGTH,
      HuaweiActivityType.YOGA,
    ];

    for (const type of activityTypes) {
      expect(ACTIVITY_TYPE_MAP[type]).toBeDefined();
      expect(typeof ACTIVITY_TYPE_MAP[type]).toBe("string");
    }
  });

  test("has exactly 8 mapped activity types", () => {
    expect(Object.keys(ACTIVITY_TYPE_MAP).length).toBe(8);
  });
});
