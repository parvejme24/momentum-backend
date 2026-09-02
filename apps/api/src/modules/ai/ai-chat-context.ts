import {
  addDays,
  completionRate,
  describeSchedule,
  isDue,
  localDate,
  streakFor,
  todayIn,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { STREAK_LOG_SELECT } from '../../lib/log-query.js';
import { prisma } from '../../lib/prisma.js';
import { fromPrismaDate, toPrismaDate } from '../../utils/date-guard.js';

const STREAK_LOOKBACK_DAYS = 120;
const RATE_DAYS = 30;

export type ChatReplyLanguage = 'bangla' | 'banglish' | 'english';

export type ChatHabitRow = {
  id: string;
  title: string;
  type: Habit['type'];
  scheduleLabel: string;
  dueToday: boolean;
  loggedToday: boolean;
  todayStatus: LogStatus | null;
  currentStreak: number;
  rate30: number;
};

export type ChatSnapshot = {
  userName: string;
  today: LocalDate;
  activeHabits: number;
  dueToday: number;
  completedToday: number;
  bestStreakTitle: string | null;
  bestStreak: number;
  overallRate30: number;
  focusedTitle: string | null;
  habitsText: string;
  progressText: string;
  language: ChatReplyLanguage;
};

type ScheduleHabit = Pick<
  Habit,
  | 'id'
  | 'title'
  | 'type'
  | 'scheduleType'
  | 'scheduleDays'
  | 'targetPerWeek'
  | 'intervalDays'
  | 'startDate'
>;

type StreakLog = Pick<HabitLog, 'habitId' | 'localDate' | 'status'>;

const BANGLISH_RE =
  /\b(ami|tumi|apni|kemon|koro|korchi|korbo|koros|achi|acho|aaj|ajke|kalke|hobit|prothom|onek|valo|bhalo|thik|naki|keno|kotha|lagbe|hobe|parbo|parchi|dorkar|kaj|din|ekta|ekhon)\b/i;

function toSchedule(habit: ScheduleHabit): HabitSchedule {
  return {
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    startDate: localDate(habit.startDate),
  };
}

function logsToMap(logs: StreakLog[]): Map<LocalDate, LogStatus> {
  const map = new Map<LocalDate, LogStatus>();
  for (const log of logs) {
    map.set(fromPrismaDate(log.localDate), log.status);
  }
  return map;
}

function groupLogs(logs: StreakLog[]): Map<string, StreakLog[]> {
  const grouped = new Map<string, StreakLog[]>();
  for (const log of logs) {
    const list = grouped.get(log.habitId) ?? [];
    list.push(log);
    grouped.set(log.habitId, list);
  }
  return grouped;
}

function pct(rate: number): number {
  return Math.round(rate * 100);
}

export function detectReplyLanguage(message: string): ChatReplyLanguage {
  if (/[\u0980-\u09FF]/.test(message)) return 'bangla';
  if (BANGLISH_RE.test(message)) return 'banglish';
  return 'english';
}

function todayLabel(status: LogStatus | null, due: boolean): string {
  if (!due) return 'rest day';
  if (status === 'DONE' || status === 'PARTIAL') return status.toLowerCase();
  if (status === 'SKIPPED') return 'skipped';
  return 'not logged';
}

export async function loadChatSnapshot(
  userId: string,
  message: string,
  focusedHabitId: string | undefined,
): Promise<ChatSnapshot> {
  const [user, habits] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { name: true, timezone: true, weekStartsOn: true },
    }),
    prisma.habit.findMany({
      where: { userId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      take: 20,
      select: {
        id: true,
        title: true,
        type: true,
        scheduleType: true,
        scheduleDays: true,
        targetPerWeek: true,
        intervalDays: true,
        startDate: true,
      },
    }),
  ]);

  const timezone = user?.timezone ?? 'Asia/Dhaka';
  const weekStartsOn = user?.weekStartsOn ?? 6;
  const today = todayIn(timezone);
  const rateFrom = addDays(today, -(RATE_DAYS - 1));
  const streakFrom = addDays(today, -STREAK_LOOKBACK_DAYS);
  const habitIds = habits.map((habit) => habit.id);

  const logs: StreakLog[] =
    habitIds.length === 0
      ? []
      : await prisma.habitLog.findMany({
          where: {
            habitId: { in: habitIds },
            localDate: { gte: toPrismaDate(streakFrom) },
          },
          select: STREAK_LOG_SELECT,
        });

  const logsByHabit = groupLogs(logs);
  const rows: ChatHabitRow[] = [];

  for (const habit of habits) {
    const schedule = toSchedule(habit);
    const map = logsToMap(logsByHabit.get(habit.id) ?? []);
    const dueToday = isDue(schedule, today);
    const todayStatus = map.get(today) ?? null;
    const loggedToday = todayStatus === 'DONE' || todayStatus === 'PARTIAL';
    rows.push({
      id: habit.id,
      title: habit.title,
      type: habit.type,
      scheduleLabel: describeSchedule(schedule),
      dueToday,
      loggedToday,
      todayStatus,
      currentStreak: streakFor(schedule, map, today, weekStartsOn),
      rate30: completionRate(schedule, map, rateFrom, today, weekStartsOn),
    });
  }

  const dueRows = rows.filter((row) => row.dueToday);
  const completedToday = dueRows.filter((row) => row.loggedToday).length;
  const best = rows.reduce<ChatHabitRow | null>((lead, row) => {
    if (!lead || row.currentStreak > lead.currentStreak) return row;
    return lead;
  }, null);

  const overallRate30 =
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.rate30, 0) / rows.length;

  const focused = focusedHabitId ? (rows.find((row) => row.id === focusedHabitId) ?? null) : null;

  const habitLines =
    rows.length === 0
      ? 'No active habits yet.'
      : rows
          .map((row) => {
            const mark = focused?.id === row.id ? ' [FOCUSED]' : '';
            return `- ${row.title}${mark} (${row.type}, ${row.scheduleLabel}) | streak ${row.currentStreak} | 30d ${pct(row.rate30)}% | today: ${todayLabel(row.todayStatus, row.dueToday)}`;
          })
          .join('\n');

  const progressLines = [
    `Active habits: ${rows.length}`,
    `Today ${today}: ${completedToday}/${dueRows.length} due habits logged`,
    `Average 30-day completion: ${pct(overallRate30)}%`,
    best && best.currentStreak > 0
      ? `Best current streak: ${best.title} — ${best.currentStreak} days`
      : 'Best current streak: none yet',
    focused
      ? `Focused habit: ${focused.title} | streak ${focused.currentStreak} | 30d ${pct(focused.rate30)}% | today: ${todayLabel(focused.todayStatus, focused.dueToday)}`
      : 'Focused habit: none',
  ];

  return {
    userName: user?.name ?? 'there',
    today,
    activeHabits: rows.length,
    dueToday: dueRows.length,
    completedToday,
    bestStreakTitle: best && best.currentStreak > 0 ? best.title : null,
    bestStreak: best?.currentStreak ?? 0,
    overallRate30,
    focusedTitle: focused?.title ?? null,
    habitsText: habitLines,
    progressText: `${progressLines.join('\n')}\n\nHabits:\n${habitLines}`,
    language: detectReplyLanguage(message),
  };
}

export function isHabitRelatedMessage(message: string): boolean {
  return /habit|streak|routine|log|skip|miss|progress|consistency|schedule|reminder|today|gym|read|walk|sleep|অভ্যাস|স্ট্রিক|রুটিন|প্রগ্রেস|আজকে|মিস|স্কিপ|hobit|streek|ajke|kalke|loge|korchi|miss kor|skip kor/.test(
    message.toLowerCase(),
  );
}

export function fallbackChatReply(message: string, snapshot: ChatSnapshot): string {
  const onTopic = isHabitRelatedMessage(message);

  if (snapshot.language === 'bangla') {
    if (!onTopic) {
      return 'আমি শুধু অভ্যাস, স্ট্রিক আর লগ নিয়ে সাহায্য করি। তোমার কোন অভ্যাসটা নিয়ে কথা বলতে চাও?';
    }
    if (snapshot.activeHabits === 0) {
      return 'এখনো কোনো অভ্যাস নেই। একটা ছোট কাজ দিয়ে শুরু করো — দুই মিনিটের কিছু, প্রতিদিন। Create habit থেকে সেভ করতে পারো।';
    }
    const open = snapshot.dueToday - snapshot.completedToday;
    const best =
      snapshot.bestStreakTitle && snapshot.bestStreak > 0
        ? `সেরা স্ট্রিক এখন "${snapshot.bestStreakTitle}" — ${snapshot.bestStreak} দিন।`
        : 'এখনো স্ট্রিক গড়েনি।';
    return `তোমার ${snapshot.activeHabits}টা অ্যাকটিভ অভ্যাস আছে। আজ ${snapshot.completedToday}/${snapshot.dueToday}টা লগ হয়েছে। ৩০ দিনের গড় ${pct(snapshot.overallRate30)}%। ${best}${open > 0 ? ` আজকের চেইন বাঁচাতে আর ${open}টা লগ করো।` : ' আজকের কাজ শেষ — কাল আবার দেখা।'}`;
  }

  if (snapshot.language === 'banglish') {
    if (!onTopic) {
      return 'Ami shudhu habit, streak ar logging niye help kori. Tomar kon habit niye kotha bolte chao?';
    }
    if (snapshot.activeHabits === 0) {
      return 'Ekhon kono habit nai. Ekta chhoto daily action diye start koro — 2 minute er kaj. Create habit theke save korte paro.';
    }
    const open = snapshot.dueToday - snapshot.completedToday;
    const best =
      snapshot.bestStreakTitle && snapshot.bestStreak > 0
        ? `Best streak ekhon "${snapshot.bestStreakTitle}" — ${snapshot.bestStreak} din.`
        : 'Streak ekhono start hoyni.';
    return `Tomar ${snapshot.activeHabits} ta active habit ache. Ajke ${snapshot.completedToday}/${snapshot.dueToday} log hoise. 30-day average ${pct(snapshot.overallRate30)}%. ${best}${open > 0 ? ` Chain rakhte ajke aro ${open} ta log koro.` : ' Ajker kaj sesh — kal abar show up koro.'}`;
  }

  if (!onTopic) {
    return 'I only help with habits, streaks, and logging. Which of your habits do you want to talk about?';
  }
  if (snapshot.activeHabits === 0) {
    return 'You have no habits yet. Start with one tiny daily action — under two minutes — then save it with Create habit.';
  }
  const open = snapshot.dueToday - snapshot.completedToday;
  const best =
    snapshot.bestStreakTitle && snapshot.bestStreak > 0
      ? `Best streak is "${snapshot.bestStreakTitle}" at ${snapshot.bestStreak} days.`
      : 'No streak yet.';
  return `You have ${snapshot.activeHabits} active habits. Today ${snapshot.completedToday}/${snapshot.dueToday} due habits are logged. 30-day average is ${pct(snapshot.overallRate30)}%. ${best}${open > 0 ? ` Log the remaining ${open} to keep the chain.` : ' Today is complete — show up again tomorrow.'}`;
}
