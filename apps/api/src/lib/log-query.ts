export const STREAK_LOG_SELECT = {
  habitId: true,
  localDate: true,
  status: true,
} as const;

export const LOG_ENTRY_SELECT = {
  habitId: true,
  localDate: true,
  status: true,
  value: true,
  note: true,
} as const;
