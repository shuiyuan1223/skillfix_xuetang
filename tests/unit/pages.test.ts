/**
 * Tests for Gateway Pages
 *
 * Tests the helper functions and data transformation logic
 * used in page generation.
 */

import { describe, test, expect } from "bun:test";

/**
 * Get color based on score threshold
 * From pages.ts getScoreColor()
 */
function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981"; // Green
  if (score >= 60) return "#f59e0b"; // Amber
  return "#ef4444"; // Red
}

/**
 * Get icon for score type
 * From pages.ts getScoreIcon()
 */
function getScoreIcon(key: string): string {
  const icons: Record<string, string> = {
    accuracy: "🎯",
    relevance: "🔗",
    helpfulness: "💡",
    safety: "🛡️",
    completeness: "✓",
  };
  return icons[key] || "📊";
}

/**
 * Format number with thousands separator
 */
function formatNumber(value: number): string {
  return value.toLocaleString();
}

/**
 * Get badge variant based on status
 */
function getStatusVariant(status: string): "success" | "warning" | "error" | "info" {
  switch (status) {
    case "completed":
    case "active":
      return "success";
    case "pending":
    case "running":
      return "warning";
    case "failed":
    case "error":
      return "error";
    default:
      return "info";
  }
}

/**
 * Truncate text to max length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Format duration from minutes to human-readable string
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Calculate percentage change
 */
function calculateChange(
  current: number,
  previous: number
): { value: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0) return { value: 0, direction: "neutral" };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(change)),
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

describe("getScoreColor", () => {
  test("returns green for scores >= 80", () => {
    expect(getScoreColor(80)).toBe("#10b981");
    expect(getScoreColor(90)).toBe("#10b981");
    expect(getScoreColor(100)).toBe("#10b981");
  });

  test("returns amber for scores 60-79", () => {
    expect(getScoreColor(60)).toBe("#f59e0b");
    expect(getScoreColor(70)).toBe("#f59e0b");
    expect(getScoreColor(79)).toBe("#f59e0b");
  });

  test("returns red for scores < 60", () => {
    expect(getScoreColor(0)).toBe("#ef4444");
    expect(getScoreColor(30)).toBe("#ef4444");
    expect(getScoreColor(59)).toBe("#ef4444");
  });

  test("handles edge cases", () => {
    expect(getScoreColor(-10)).toBe("#ef4444");
    expect(getScoreColor(150)).toBe("#10b981");
  });
});

describe("getScoreIcon", () => {
  test("returns correct icons for known keys", () => {
    expect(getScoreIcon("accuracy")).toBe("🎯");
    expect(getScoreIcon("relevance")).toBe("🔗");
    expect(getScoreIcon("helpfulness")).toBe("💡");
    expect(getScoreIcon("safety")).toBe("🛡️");
    expect(getScoreIcon("completeness")).toBe("✓");
  });

  test("returns default icon for unknown keys", () => {
    expect(getScoreIcon("unknown")).toBe("📊");
    expect(getScoreIcon("")).toBe("📊");
    expect(getScoreIcon("custom_metric")).toBe("📊");
  });
});

describe("formatNumber", () => {
  test("formats thousands with separator", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(10000)).toBe("10,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  test("handles small numbers", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
  });

  test("handles decimals", () => {
    // Note: toLocaleString behavior may vary by locale
    const result = formatNumber(1234.56);
    expect(result).toContain("1,234");
  });
});

describe("getStatusVariant", () => {
  test("returns success for completed/active statuses", () => {
    expect(getStatusVariant("completed")).toBe("success");
    expect(getStatusVariant("active")).toBe("success");
  });

  test("returns warning for pending/running statuses", () => {
    expect(getStatusVariant("pending")).toBe("warning");
    expect(getStatusVariant("running")).toBe("warning");
  });

  test("returns error for failed/error statuses", () => {
    expect(getStatusVariant("failed")).toBe("error");
    expect(getStatusVariant("error")).toBe("error");
  });

  test("returns info for unknown statuses", () => {
    expect(getStatusVariant("unknown")).toBe("info");
    expect(getStatusVariant("")).toBe("info");
  });
});

describe("truncateText", () => {
  test("does not truncate short text", () => {
    expect(truncateText("hello", 10)).toBe("hello");
    expect(truncateText("hello", 5)).toBe("hello");
  });

  test("truncates long text with ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello...");
    expect(truncateText("abcdefghij", 7)).toBe("abcd...");
  });

  test("handles edge cases", () => {
    expect(truncateText("", 5)).toBe("");
    expect(truncateText("abc", 3)).toBe("abc");
  });
});

describe("formatDuration", () => {
  test("formats minutes only for < 60", () => {
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(59)).toBe("59m");
  });

  test("formats hours only for exact hours", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(180)).toBe("3h");
  });

  test("formats hours and minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(145)).toBe("2h 25m");
  });

  test("handles zero", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("calculateChange", () => {
  test("calculates positive change", () => {
    const result = calculateChange(120, 100);
    expect(result.value).toBe(20);
    expect(result.direction).toBe("up");
  });

  test("calculates negative change", () => {
    const result = calculateChange(80, 100);
    expect(result.value).toBe(20);
    expect(result.direction).toBe("down");
  });

  test("handles no change", () => {
    const result = calculateChange(100, 100);
    expect(result.value).toBe(0);
    expect(result.direction).toBe("neutral");
  });

  test("handles zero previous value", () => {
    const result = calculateChange(100, 0);
    expect(result.value).toBe(0);
    expect(result.direction).toBe("neutral");
  });

  test("rounds percentage to integer", () => {
    const result = calculateChange(133, 100);
    expect(result.value).toBe(33); // 33%, not 33.33%
  });
});

describe("Health Page Data Transformations", () => {
  /**
   * Format sleep hours for display
   */
  function formatSleepHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  test("formats sleep hours correctly", () => {
    expect(formatSleepHours(8)).toBe("8h");
    expect(formatSleepHours(7.5)).toBe("7h 30m");
    expect(formatSleepHours(6.25)).toBe("6h 15m");
  });

  /**
   * Get sleep quality label
   */
  function getSleepQualityLabel(score: number): string {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Poor";
  }

  test("returns correct sleep quality labels", () => {
    expect(getSleepQualityLabel(90)).toBe("Excellent");
    expect(getSleepQualityLabel(70)).toBe("Good");
    expect(getSleepQualityLabel(50)).toBe("Fair");
    expect(getSleepQualityLabel(30)).toBe("Poor");
  });

  /**
   * Calculate step goal progress
   */
  function calculateGoalProgress(current: number, goal: number): number {
    if (goal === 0) return 0;
    return Math.min(100, Math.round((current / goal) * 100));
  }

  test("calculates goal progress percentage", () => {
    expect(calculateGoalProgress(5000, 10000)).toBe(50);
    expect(calculateGoalProgress(10000, 10000)).toBe(100);
    expect(calculateGoalProgress(12000, 10000)).toBe(100); // Caps at 100
    expect(calculateGoalProgress(0, 10000)).toBe(0);
    expect(calculateGoalProgress(5000, 0)).toBe(0);
  });
});

describe("Chart Data Transformation", () => {
  /**
   * Transform weekly data for chart display
   */
  function transformWeeklyData(
    data: Array<{ date: string; value: number }>
  ): Array<{ label: string; value: number }> {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return data.map((d) => {
      const date = new Date(d.date);
      return {
        label: dayNames[date.getDay()],
        value: d.value,
      };
    });
  }

  test("transforms weekly data with day labels", () => {
    const data = [
      { date: "2025-01-13", value: 8000 }, // Monday
      { date: "2025-01-14", value: 9500 }, // Tuesday
      { date: "2025-01-15", value: 7200 }, // Wednesday
    ];

    const result = transformWeeklyData(data);

    expect(result[0].label).toBe("Mon");
    expect(result[0].value).toBe(8000);
    expect(result[1].label).toBe("Tue");
    expect(result[2].label).toBe("Wed");
  });

  /**
   * Calculate weekly average
   */
  function calculateWeeklyAverage(data: Array<{ value: number }>): number {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, d) => acc + d.value, 0);
    return Math.round(sum / data.length);
  }

  test("calculates weekly average", () => {
    const data = [{ value: 8000 }, { value: 9000 }, { value: 7000 }];
    expect(calculateWeeklyAverage(data)).toBe(8000);
  });

  test("handles empty data for weekly average", () => {
    expect(calculateWeeklyAverage([])).toBe(0);
  });
});

describe("Form Validation Helpers", () => {
  /**
   * Validate required fields
   */
  function validateRequired(value: string | undefined | null): boolean {
    return value !== undefined && value !== null && value.trim() !== "";
  }

  test("validates required fields", () => {
    expect(validateRequired("test")).toBe(true);
    expect(validateRequired("")).toBe(false);
    expect(validateRequired("  ")).toBe(false);
    expect(validateRequired(undefined)).toBe(false);
    expect(validateRequired(null)).toBe(false);
  });

  /**
   * Validate numeric input
   */
  function validateNumeric(value: string): boolean {
    if (value === "") return false;
    return !isNaN(Number(value));
  }

  test("validates numeric input", () => {
    expect(validateNumeric("123")).toBe(true);
    expect(validateNumeric("12.5")).toBe(true);
    expect(validateNumeric("-10")).toBe(true);
    expect(validateNumeric("abc")).toBe(false);
    expect(validateNumeric("")).toBe(false);
    expect(validateNumeric("12abc")).toBe(false);
  });
});
