export type LocalDate = string; // YYYY-MM-DD

export type LogStatus = 'DONE' | 'PARTIAL' | 'SKIPPED';

export type ScheduleType = 'DAILY' | 'SPECIFIC_DAYS' | 'TIMES_PER_WEEK' | 'INTERVAL';

export type HabitSchedule = {
  scheduleType: ScheduleType;
  scheduleDays: number[];
  targetPerWeek: number | null;
  intervalDays: number | null;
  startDate: LocalDate;
};

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
