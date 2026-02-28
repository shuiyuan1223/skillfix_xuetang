export type PlanStatus = 'active' | 'paused' | 'completed' | 'archived';
export type GoalStatus = 'on_track' | 'ahead' | 'behind' | 'completed' | 'missed';
export type GoalMetric =
  | 'steps'
  | 'sleep_hours'
  | 'exercise_count'
  | 'heart_rate_resting'
  | 'weight'
  | 'calories'
  | 'active_minutes'
  | 'custom';

export interface PlanGoal {
  id: string;
  metric: GoalMetric;
  label: string;
  targetValue: number;
  unit: string;
  frequency: 'daily' | 'weekly';
  baselineValue?: number;
  currentValue?: number;
  status: GoalStatus;
}

export interface PlanMilestone {
  id: string;
  label: string;
  targetDate: string; // YYYY-MM-DD
  criteria: string;
  completed: boolean;
  completedAt?: string;
}

export interface PlanAdjustment {
  date: string; // ISO timestamp
  reason: string;
  changes: string;
}

export interface ProgressEntry {
  date: string; // YYYY-MM-DD
  goalId: string;
  actualValue: number;
  targetValue: number;
  note?: string;
}

export interface HealthPlan {
  id: string;
  name: string;
  description: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  goals: PlanGoal[];
  milestones: PlanMilestone[];
  adjustments: PlanAdjustment[];
  progress: ProgressEntry[];
  tags?: string[];
}
