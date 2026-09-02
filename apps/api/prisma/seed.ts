import bcrypt from 'bcryptjs';

import { DEFAULT_AI_PROMPTS } from '../src/modules/ai/ai-prompt.defaults.js';
import { prisma } from '../src/lib/prisma.js';
import { CATALOG_PLAN_SLUGS } from '../src/lib/plan-catalog.js';

const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 10;

type SeedPlan = {
  slug: string;
  name: string;
  blurb: string;
  priceCents: number;
  interval: 'FOREVER' | 'MONTH' | 'YEAR' | 'ONE_TIME';
  seatBased: boolean;
  highlighted: boolean;
  sortOrder: number;
  ctaLabel: string;
  features: string[];
  limits: Record<string, unknown>;
};

const SEED_PLANS: SeedPlan[] = [
  {
    slug: 'free',
    name: 'Free',
    blurb: 'Track up to 20 habits with the essentials.',
    priceCents: 0,
    interval: 'FOREVER',
    seatBased: false,
    highlighted: false,
    sortOrder: 0,
    ctaLabel: 'Start free',
    features: [
      'Active habits',
      'Today view & logs',
      'Heatmap history',
      'Stats & overview',
      'AI habit suggestions',
      'Reminders',
      'Data export',
    ],
    limits: {
      maxHabits: 20,
      heatmapDays: 90,
      reminders: 'one_device',
      export: ['csv'],
      sharedBoards: false,
      adminSeats: 0,
      stats: false,
      ai: false,
    },
  },
  {
    slug: 'pro-year',
    name: 'Pro — 1 year',
    blurb: 'Unlimited habits, stats, and AI suggestions for one year.',
    priceCents: 4900,
    interval: 'YEAR',
    seatBased: false,
    highlighted: true,
    sortOrder: 1,
    ctaLabel: 'Get Pro for 1 year',
    features: [
      'Active habits',
      'Today view & logs',
      'Heatmap history',
      'Stats & overview',
      'AI habit suggestions',
      'Reminders',
      'Data export',
    ],
    limits: {
      maxHabits: null,
      heatmapDays: 364,
      reminders: 'all_devices',
      export: ['csv', 'json'],
      sharedBoards: false,
      adminSeats: 0,
      stats: true,
      ai: true,
    },
  },
  {
    slug: 'pro-lifetime',
    name: 'Pro — Lifetime',
    blurb: 'Pay once. Unlimited habits, stats, and AI forever.',
    priceCents: 9900,
    interval: 'FOREVER',
    seatBased: false,
    highlighted: false,
    sortOrder: 2,
    ctaLabel: 'Get lifetime Pro',
    features: [
      'Active habits',
      'Today view & logs',
      'Heatmap history',
      'Stats & overview',
      'AI habit suggestions',
      'Reminders',
      'Data export',
    ],
    limits: {
      maxHabits: null,
      heatmapDays: 364,
      reminders: 'all_devices',
      export: ['csv', 'json'],
      sharedBoards: false,
      adminSeats: 0,
      stats: true,
      ai: true,
    },
  },
];

export const DEMO_USERS = [
  {
    email: 'customer@momentum.app',
    name: 'Ayesha Rahman',
    role: 'CUSTOMER' as const,
  },
  {
    email: 'admin@momentum.app',
    name: 'Nafis Karim',
    role: 'ADMIN' as const,
  },
];

/** Extra accounts so the admin console looks populated. Not shown on the login page. */
const CAST_USERS = [
  {
    email: 'sofia.free@momentum.app',
    name: 'Sofia Ahmed',
    role: 'CUSTOMER' as const,
    status: 'active' as const,
  },
  {
    email: 'karim.lifetime@momentum.app',
    name: 'Karim Hossain',
    role: 'CUSTOMER' as const,
    status: 'active' as const,
  },
  {
    email: 'lina.expired@momentum.app',
    name: 'Lina Chowdhury',
    role: 'CUSTOMER' as const,
    status: 'active' as const,
  },
  {
    email: 'rafi.banned@momentum.app',
    name: 'Rafi Hasan',
    role: 'CUSTOMER' as const,
    status: 'banned' as const,
  },
];

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function dayAt(offset: number): Date {
  return addDays(startOfToday(), offset);
}

function offsetsFrom(startOffset: number, endOffset = 0): number[] {
  const list: number[] = [];
  for (let offset = startOffset; offset <= endOffset; offset += 1) list.push(offset);
  return list;
}

type SeedLog = {
  habitId: string;
  userId: string;
  localDate: Date;
  status: 'DONE' | 'PARTIAL' | 'SKIPPED';
  value?: number;
  note?: string;
};

function dailyLogs(
  habitId: string,
  userId: string,
  startOffset: number,
  statusFor: (offset: number, weekday: number) => SeedLog['status'] | null,
  valueFor?: (offset: number) => number | undefined,
  endOffset = 0,
): SeedLog[] {
  return offsetsFrom(startOffset, endOffset).flatMap((offset) => {
    const localDate = dayAt(offset);
    const status = statusFor(offset, localDate.getDay());
    if (!status) return [];
    const value = valueFor?.(offset);
    return [
      {
        habitId,
        userId,
        localDate,
        status,
        ...(value !== undefined ? { value } : {}),
      },
    ];
  });
}

async function writeLogs(logs: SeedLog[]) {
  if (logs.length === 0) return;
  await prisma.habitLog.createMany({ data: logs });
}

async function upsertUser(input: {
  email: string;
  name: string;
  role: 'CUSTOMER' | 'ADMIN';
  banned?: boolean;
  lastActiveDaysAgo?: number;
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const bannedAt = input.banned ? addDays(startOfToday(), -12) : null;

  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      passwordHash,
      emailVerifiedAt: new Date(),
      deletedAt: null,
      bannedAt,
      bannedReason: input.banned ? 'Seed: abuse reports on demo account' : null,
      timezone: 'Asia/Dhaka',
      weekStartsOn: 6,
      lastActiveAt: dayAt(-(input.lastActiveDaysAgo ?? 0)),
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      emailVerifiedAt: new Date(),
      timezone: 'Asia/Dhaka',
      weekStartsOn: 6,
      bannedAt,
      bannedReason: input.banned ? 'Seed: abuse reports on demo account' : null,
      lastActiveAt: dayAt(-(input.lastActiveDaysAgo ?? 0)),
    },
  });
}

async function seedDemoUsers() {
  for (const demo of DEMO_USERS) {
    await upsertUser(demo);
  }
  for (const extra of CAST_USERS) {
    await upsertUser({
      email: extra.email,
      name: extra.name,
      role: extra.role,
      banned: extra.status === 'banned',
      lastActiveDaysAgo: extra.status === 'banned' ? 20 : 2,
    });
  }
}

async function resetDemoUserData(userId: string) {
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.payment.deleteMany({ where: { userId } });
  await prisma.planSubscription.deleteMany({ where: { userId } });
  await prisma.habitLog.deleteMany({ where: { userId } });
  await prisma.reminder.deleteMany({
    where: { habit: { userId } },
  });
  await prisma.habit.deleteMany({ where: { userId } });
}

async function seedDemoCustomerData(customerId: string, plans: Record<string, string>) {
  await resetDemoUserData(customerId);

  const today = startOfToday();
  const periodEnd = addDays(today, 351);

  const subscription = await prisma.planSubscription.create({
    data: {
      userId: customerId,
      planId: plans['pro-year'],
      status: 'ACTIVE',
      seats: 1,
      currentPeriodStart: addDays(today, -14),
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        userId: customerId,
        planId: plans['pro-year'],
        subscriptionId: subscription.id,
        amountCents: 4900,
        currency: 'USD',
        status: 'SUCCEEDED',
        method: 'OTHER',
        provider: 'sslcommerz',
        providerRef: 'seed-ayesha-pro-year',
        description: 'Pro — 1 year',
        paidAt: addDays(today, -14),
      },
    ],
  });

  const reading = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Morning reading',
      description: 'Twenty quiet minutes with a book before the day starts.',
      icon: '📖',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      targetValue: 20,
      unit: 'minutes',
      startDate: dayAt(-90),
      sortOrder: 0,
    },
  });

  const water = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Drink 8 glasses of water',
      description: 'Keep a bottle at the desk; log glasses as they go.',
      icon: '💧',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      targetValue: 8,
      unit: 'glasses',
      startDate: dayAt(-75),
      sortOrder: 1,
    },
  });

  const walk = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Evening walk',
      description: 'A short walk after dinner — Mon, Wed, Fri.',
      icon: '🚶',
      color: '#2F9E6E',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [1, 3, 5],
      startDate: dayAt(-60),
      sortOrder: 2,
    },
  });

  const journal = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Evening journal',
      description: 'Three lines about what moved the day forward.',
      icon: '✍️',
      color: '#7C5CBF',
      type: 'BUILD',
      scheduleType: 'DAILY',
      startDate: dayAt(-45),
      sortOrder: 3,
    },
  });

  const scrolling = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Less late scrolling',
      description: 'Phone down by 10pm.',
      icon: '🌙',
      color: '#E24B2A',
      type: 'BREAK',
      scheduleType: 'DAILY',
      startDate: dayAt(-30),
      sortOrder: 4,
    },
  });

  const stretch = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Stretch 10 minutes',
      description: 'Three sessions a week after work.',
      icon: '✨',
      color: '#E8B931',
      type: 'BUILD',
      scheduleType: 'TIMES_PER_WEEK',
      targetPerWeek: 3,
      startDate: dayAt(-28),
      sortOrder: 5,
    },
  });

  await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Couch to 5K',
      description: 'Paused after travel season — kept for the archive.',
      icon: '🔥',
      color: '#E24B2A',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [2, 4, 6],
      startDate: dayAt(-120),
      archivedAt: dayAt(-18),
      sortOrder: 6,
    },
  });

  await writeLogs([
    ...dailyLogs(reading.id, customerId, -90, (offset) => {
      if (offset === 0 || offset === -1) return 'DONE';
      if (offset === -2) return 'SKIPPED';
      if (offset % 9 === -3 || offset % 9 === 6) return null;
      return 'DONE';
    }),
    ...dailyLogs(
      water.id,
      customerId,
      -75,
      (offset) => {
        if (offset === 0) return 'DONE';
        if (offset === -4) return 'PARTIAL';
        if (offset % 10 === 0) return null;
        return 'DONE';
      },
      (offset) => 6 + Math.abs(offset % 3),
    ),
    ...dailyLogs(walk.id, customerId, -60, (offset, weekday) => {
      if (![1, 3, 5].includes(weekday)) return null;
      if (offset === -8) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(journal.id, customerId, -45, (offset) => {
      if (offset % 7 === -1) return null;
      return offset === -3 ? 'PARTIAL' : 'DONE';
    }),
    ...dailyLogs(scrolling.id, customerId, -30, (offset) => {
      if (offset === -5 || offset === -12) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(stretch.id, customerId, -28, (_offset, weekday) => {
      if (![1, 3, 5].includes(weekday)) return null;
      return 'DONE';
    }),
  ]);

  await prisma.reminder.createMany({
    data: [
      {
        habitId: reading.id,
        timeLocal: '07:30',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
      {
        habitId: water.id,
        timeLocal: '11:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
      {
        habitId: walk.id,
        timeLocal: '19:00',
        daysOfWeek: [1, 3, 5],
        enabled: true,
      },
      {
        habitId: journal.id,
        timeLocal: '21:30',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: customerId,
        audience: 'USER',
        type: 'WELCOME',
        title: 'Welcome to Momentum',
        body: 'Ayesha’s demo logbook is ready — open Today to keep the chain going.',
      },
      {
        userId: customerId,
        audience: 'USER',
        type: 'SUBSCRIPTION_STARTED',
        title: 'Pro is active',
        body: 'Unlimited habits, stats, and AI coaching for one year.',
      },
      {
        userId: customerId,
        audience: 'USER',
        type: 'HABIT_STREAK',
        title: 'Morning reading is on a roll',
        body: 'A long chain of quiet mornings — protect it today.',
      },
      {
        userId: customerId,
        audience: 'USER',
        type: 'HABIT_CREATED',
        title: 'Stretch 10 minutes added',
        body: 'Three sessions a week. Mark the first one when you can.',
      },
    ],
  });
}

async function seedDemoAdminWorkspace(adminId: string) {
  await resetDemoUserData(adminId);

  const review = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Review pull requests',
      description: 'Ship feedback before standup.',
      icon: '💻',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [1, 2, 3, 4, 5],
      startDate: dayAt(-90),
      sortOrder: 0,
    },
  });

  const deepWork = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Deep work block',
      description: 'Ninety minutes with notifications off.',
      icon: '⏱️',
      color: '#7C5CBF',
      type: 'BUILD',
      scheduleType: 'DAILY',
      targetValue: 90,
      unit: 'minutes',
      startDate: dayAt(-80),
      sortOrder: 1,
    },
  });

  const walk = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Lunch walk',
      description: 'Leave the desk, even for ten minutes.',
      icon: '☀️',
      color: '#2F9E6E',
      type: 'BUILD',
      scheduleType: 'DAILY',
      startDate: dayAt(-60),
      sortOrder: 2,
    },
  });

  const reading = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Read 20 pages',
      description: 'Fiction or a technical paper — either counts.',
      icon: '📖',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      targetValue: 20,
      unit: 'pages',
      startDate: dayAt(-75),
      sortOrder: 3,
    },
  });

  const strength = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Strength training',
      description: 'Compound lifts — Mon, Wed, Sat.',
      icon: '🏋️',
      color: '#E8B931',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [1, 3, 6],
      startDate: dayAt(-70),
      sortOrder: 4,
    },
  });

  const notes = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Write ship notes',
      description: 'Three short posts a week on what shipped.',
      icon: '✍️',
      color: '#7C5CBF',
      type: 'BUILD',
      scheduleType: 'TIMES_PER_WEEK',
      targetPerWeek: 3,
      startDate: dayAt(-45),
      sortOrder: 5,
    },
  });

  const slack = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'No Slack after 8pm',
      description: 'Work chat stays closed after dinner.',
      icon: '📵',
      color: '#E24B2A',
      type: 'BREAK',
      scheduleType: 'DAILY',
      startDate: dayAt(-35),
      sortOrder: 6,
    },
  });

  const water = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Drink 2L water',
      description: 'Bottle on the desk. The chain broke — rebuild it.',
      icon: '💧',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      targetValue: 2,
      unit: 'litres',
      startDate: dayAt(-50),
      sortOrder: 7,
    },
  });

  const inbox = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Inbox sweep',
      description: 'Clear the queue every other day.',
      icon: '🗂️',
      color: '#2F9E6E',
      type: 'BUILD',
      scheduleType: 'INTERVAL',
      intervalDays: 2,
      startDate: dayAt(-40),
      sortOrder: 8,
    },
  });

  const openSource = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Open-source Friday',
      description: 'Paused while the product sprint is on.',
      icon: '🌍',
      color: '#2F9E6E',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [5],
      startDate: dayAt(-120),
      archivedAt: dayAt(-14),
      sortOrder: 9,
    },
  });

  const spanish = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Learn 5 Spanish words',
      description: 'Weekday flashcards — archived after travel.',
      icon: '🗣️',
      color: '#E8B931',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [1, 2, 3, 4, 5],
      startDate: dayAt(-100),
      archivedAt: dayAt(-32),
      sortOrder: 10,
    },
  });

  const coldShower = await prisma.habit.create({
    data: {
      userId: adminId,
      title: 'Morning cold shower',
      description: 'Kept the history; dropped the ritual.',
      icon: '🚿',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      startDate: dayAt(-90),
      archivedAt: dayAt(-21),
      sortOrder: 11,
    },
  });

  await writeLogs([
    ...dailyLogs(review.id, adminId, -90, (_offset, weekday) => {
      if (weekday === 0 || weekday === 6) return null;
      return 'DONE';
    }),
    ...dailyLogs(
      deepWork.id,
      adminId,
      -80,
      (offset) => {
        if (offset === 0) return 'DONE';
        if (offset === -6) return 'PARTIAL';
        if (offset % 8 === 0) return null;
        return 'DONE';
      },
      () => 90,
    ),
    ...dailyLogs(walk.id, adminId, -60, (offset) => {
      if (offset === -3) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(
      reading.id,
      adminId,
      -75,
      (offset) => {
        if (offset === 0 || offset === -1) return 'DONE';
        if (offset === -11) return 'SKIPPED';
        if (offset % 12 === -4) return null;
        return 'DONE';
      },
      (offset) => 18 + Math.abs(offset % 5),
    ),
    ...dailyLogs(strength.id, adminId, -70, (offset, weekday) => {
      if (![1, 3, 6].includes(weekday)) return null;
      if (offset === -10) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(notes.id, adminId, -45, (offset, weekday) => {
      if (![1, 3, 5].includes(weekday)) return null;
      return offset === -8 ? 'PARTIAL' : 'DONE';
    }),
    ...dailyLogs(slack.id, adminId, -35, (offset) => {
      if (offset === -5 || offset === -18) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(
      water.id,
      adminId,
      -50,
      (offset) => {
        if (offset === 0 || offset === -1 || offset === -2) return null;
        if (offset === -7) return 'PARTIAL';
        if (offset % 9 === 0) return 'SKIPPED';
        return 'DONE';
      },
      (offset) => 1 + (Math.abs(offset) % 2),
    ),
    ...dailyLogs(inbox.id, adminId, -40, (offset) => {
      if ((offset + 40) % 2 !== 0) return null;
      if (offset === -6) return 'SKIPPED';
      return 'DONE';
    }),
    ...dailyLogs(
      openSource.id,
      adminId,
      -120,
      (_offset, weekday) => (weekday === 5 ? 'DONE' : null),
      undefined,
      -14,
    ),
    ...dailyLogs(
      spanish.id,
      adminId,
      -100,
      (offset, weekday) => {
        if (weekday === 0 || weekday === 6) return null;
        if (offset % 11 === 0) return 'SKIPPED';
        return 'DONE';
      },
      undefined,
      -33,
    ),
    ...dailyLogs(
      coldShower.id,
      adminId,
      -90,
      (offset) => {
        if (offset % 7 === -2) return 'SKIPPED';
        return 'DONE';
      },
      undefined,
      -22,
    ),
  ]);

  await prisma.reminder.createMany({
    data: [
      {
        habitId: review.id,
        timeLocal: '09:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        enabled: true,
      },
      {
        habitId: deepWork.id,
        timeLocal: '09:30',
        daysOfWeek: [1, 2, 3, 4, 5],
        enabled: true,
      },
      {
        habitId: walk.id,
        timeLocal: '13:15',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
      {
        habitId: reading.id,
        timeLocal: '21:30',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
      {
        habitId: strength.id,
        timeLocal: '17:30',
        daysOfWeek: [1, 3, 6],
        enabled: true,
      },
      {
        habitId: water.id,
        timeLocal: '11:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      },
    ],
  });
}

async function seedDemoAdminData(adminId: string, customerId: string) {
  await prisma.notification.deleteMany({ where: { userId: adminId } });

  await prisma.notification.createMany({
    data: [
      {
        userId: adminId,
        audience: 'ADMIN',
        type: 'ADMIN_NEW_USER',
        title: 'Demo customer ready',
        body: 'Ayesha Rahman (customer@momentum.app) is the public customer walkthrough.',
        data: { userId: customerId },
      },
      {
        userId: adminId,
        audience: 'ADMIN',
        type: 'ADMIN_NEW_PAYMENT',
        title: 'Pro year payment recorded',
        body: 'SSLCommerz demo payment for Ayesha’s Pro — 1 year plan.',
      },
      {
        userId: adminId,
        audience: 'ADMIN',
        type: 'ADMIN_SUBSCRIPTION_CANCELED',
        title: 'Lina’s year plan expired',
        body: 'lina.expired@momentum.app is on Free again — useful for the subscriptions table.',
      },
      {
        userId: adminId,
        audience: 'ADMIN',
        type: 'ADMIN_USER_BANNED',
        title: 'Rafi Hasan banned',
        body: 'Seeded banned account so the Users list shows every status.',
      },
      {
        userId: adminId,
        audience: 'USER',
        type: 'WELCOME',
        title: 'Your personal habits are ready',
        body: 'Admin complimentary Pro is on. Open Today — nine live habits plus three in the archive.',
      },
      {
        userId: adminId,
        audience: 'USER',
        type: 'HABIT_STREAK',
        title: 'Pull-request reviews are on a roll',
        body: 'Weekday feedback before standup — protect the chain today.',
      },
      {
        userId: adminId,
        audience: 'USER',
        type: 'HABIT_CREATED',
        title: 'Inbox sweep added',
        body: 'Every other day. Mark the next one when the queue is clear.',
      },
    ],
  });
}

async function seedCastWorkspace(
  userId: string,
  plans: Record<string, string>,
  kind: 'free' | 'lifetime' | 'expired' | 'banned',
) {
  await resetDemoUserData(userId);
  const today = startOfToday();

  if (kind === 'lifetime') {
    const subscription = await prisma.planSubscription.create({
      data: {
        userId,
        planId: plans['pro-lifetime'],
        status: 'ACTIVE',
        seats: 1,
        currentPeriodStart: addDays(today, -80),
        currentPeriodEnd: null,
      },
    });
    await prisma.payment.create({
      data: {
        userId,
        planId: plans['pro-lifetime'],
        subscriptionId: subscription.id,
        amountCents: 9900,
        currency: 'USD',
        status: 'SUCCEEDED',
        method: 'CARD',
        provider: 'stripe',
        providerRef: 'seed-karim-lifetime',
        description: 'Pro — Lifetime',
        paidAt: addDays(today, -80),
      },
    });
  }

  if (kind === 'expired') {
    const subscription = await prisma.planSubscription.create({
      data: {
        userId,
        planId: plans['pro-year'],
        status: 'EXPIRED',
        seats: 1,
        currentPeriodStart: addDays(today, -400),
        currentPeriodEnd: addDays(today, -35),
        canceledAt: addDays(today, -40),
      },
    });
    await prisma.payment.create({
      data: {
        userId,
        planId: plans['pro-year'],
        subscriptionId: subscription.id,
        amountCents: 4900,
        currency: 'USD',
        status: 'SUCCEEDED',
        method: 'OTHER',
        provider: 'sslcommerz',
        providerRef: 'seed-lina-expired-year',
        description: 'Pro — 1 year (expired)',
        paidAt: addDays(today, -400),
      },
    });
  }

  const title =
    kind === 'free'
      ? 'Make the bed'
      : kind === 'lifetime'
        ? 'Write 500 words'
        : kind === 'expired'
          ? 'Language practice'
          : 'Inbox zero';

  const habit = await prisma.habit.create({
    data: {
      userId,
      title,
      description: 'Seed habit so this account is not an empty row.',
      icon: '✅',
      color: '#2B4CE0',
      type: 'BUILD',
      scheduleType: 'DAILY',
      startDate: dayAt(-20),
      sortOrder: 0,
    },
  });

  await writeLogs(
    dailyLogs(habit.id, userId, -20, (offset) => {
      if (kind === 'banned' && offset > -10) return null;
      return offset % 4 === 0 ? null : 'DONE';
    }),
  );
}

async function seedPlan(plan: SeedPlan) {
  const existing = await prisma.plan.findUnique({ where: { slug: plan.slug } });

  if (existing) {
    await prisma.plan.update({
      where: { id: existing.id },
      data: {
        name: plan.name,
        blurb: plan.blurb,
        priceCents: plan.priceCents,
        interval: plan.interval,
        highlighted: plan.highlighted,
        sortOrder: plan.sortOrder,
        ctaLabel: plan.ctaLabel,
        limits: plan.limits,
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });

    await prisma.planFeature.deleteMany({ where: { planId: existing.id } });
    await prisma.planFeature.createMany({
      data: plan.features.map((label, sortOrder) => ({
        planId: existing.id,
        label,
        sortOrder,
      })),
    });
    return existing.id;
  }

  const created = await prisma.plan.create({
    data: {
      slug: plan.slug,
      name: plan.name,
      blurb: plan.blurb,
      priceCents: plan.priceCents,
      currency: 'USD',
      interval: plan.interval,
      intervalCount: 1,
      seatBased: plan.seatBased,
      highlighted: plan.highlighted,
      sortOrder: plan.sortOrder,
      status: 'PUBLISHED',
      ctaLabel: plan.ctaLabel,
      ctaHref: '/register',
      limits: plan.limits,
      publishedAt: new Date(),
      features: {
        create: plan.features.map((label, sortOrder) => ({ label, sortOrder })),
      },
    },
  });
  return created.id;
}

async function archiveNonCatalogPlans() {
  await prisma.plan.updateMany({
    where: { slug: { notIn: [...CATALOG_PLAN_SLUGS] } },
    data: { status: 'ARCHIVED' },
  });
}

async function seedAiPrompts() {
  const featureToDb = {
    chat: 'CHAT',
    generate_habit: 'GENERATE_HABIT',
    create_habit: 'CREATE_HABIT',
    suggestions: 'SUGGESTIONS',
    habit_message: 'HABIT_MESSAGE',
  } as const;

  for (const prompt of DEFAULT_AI_PROMPTS) {
    await prisma.aiPrompt.upsert({
      where: { slug: prompt.slug },
      update: {
        name: prompt.name,
        description: prompt.description,
        feature: featureToDb[prompt.feature],
        body: prompt.body,
        sortOrder: prompt.sortOrder,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      create: {
        slug: prompt.slug,
        name: prompt.name,
        description: prompt.description,
        feature: featureToDb[prompt.feature],
        body: prompt.body,
        sortOrder: prompt.sortOrder,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }
}

async function main() {
  await seedDemoUsers();
  await archiveNonCatalogPlans();

  const planIds: Record<string, string> = {};
  for (const plan of SEED_PLANS) {
    planIds[plan.slug] = await seedPlan(plan);
  }

  await seedAiPrompts();

  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_USERS[0].email },
    select: { id: true },
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_USERS[1].email },
    select: { id: true },
  });

  await seedDemoCustomerData(customer.id, planIds);
  await seedDemoAdminWorkspace(admin.id);
  await seedDemoAdminData(admin.id, customer.id);

  const sofia = await prisma.user.findUniqueOrThrow({
    where: { email: 'sofia.free@momentum.app' },
    select: { id: true },
  });
  const karim = await prisma.user.findUniqueOrThrow({
    where: { email: 'karim.lifetime@momentum.app' },
    select: { id: true },
  });
  const lina = await prisma.user.findUniqueOrThrow({
    where: { email: 'lina.expired@momentum.app' },
    select: { id: true },
  });
  const rafi = await prisma.user.findUniqueOrThrow({
    where: { email: 'rafi.banned@momentum.app' },
    select: { id: true },
  });

  await seedCastWorkspace(sofia.id, planIds, 'free');
  await seedCastWorkspace(karim.id, planIds, 'lifetime');
  await seedCastWorkspace(lina.id, planIds, 'expired');
  await seedCastWorkspace(rafi.id, planIds, 'banned');

  console.log('\nMomentum demo seed complete\n');
  for (const demo of DEMO_USERS) {
    console.log(`  ${demo.role.padEnd(8)}  ${demo.email}  /  ${DEMO_PASSWORD}`);
  }
  console.log(
    '\n  Customer (Ayesha): Pro year, 6 live habits + archive, heatmap, reminders, payment',
  );
  console.log(
    '  Admin (Nafis):     complimentary Pro, 9 live + 3 archived habits, heatmap, reminders, console data\n',
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
