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
    name: 'Demo Customer',
    role: 'CUSTOMER' as const,
  },
  {
    email: 'admin@momentum.app',
    name: 'Demo Admin',
    role: 'ADMIN' as const,
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

async function seedDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  for (const demo of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {
        name: demo.name,
        role: demo.role,
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: null,
        bannedAt: null,
        bannedReason: null,
        timezone: 'Asia/Dhaka',
        weekStartsOn: 6,
      },
      create: {
        email: demo.email,
        name: demo.name,
        role: demo.role,
        passwordHash,
        emailVerifiedAt: new Date(),
        timezone: 'Asia/Dhaka',
        weekStartsOn: 6,
      },
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

async function seedDemoCustomerData(customerId: string, proYearPlanId: string) {
  await resetDemoUserData(customerId);

  const today = startOfToday();
  const periodEnd = addDays(today, 365);

  const subscription = await prisma.planSubscription.create({
    data: {
      userId: customerId,
      planId: proYearPlanId,
      status: 'ACTIVE',
      seats: 1,
      currentPeriodStart: today,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.payment.create({
    data: {
      userId: customerId,
      planId: proYearPlanId,
      subscriptionId: subscription.id,
      amountCents: 4900,
      currency: 'USD',
      status: 'SUCCEEDED',
      method: 'OTHER',
      provider: 'sslcommerz',
      providerRef: 'seed-demo-customer-pro-year',
      description: 'Pro — 1 year (demo seed)',
      paidAt: addDays(today, -14),
    },
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
      startDate: addDays(today, -30),
      sortOrder: 0,
    },
  });

  const walk = await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Evening walk',
      description: 'A short walk after dinner.',
      icon: '🏋️',
      color: '#2F9E6E',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [1, 3, 5],
      startDate: addDays(today, -21),
      sortOrder: 1,
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
      startDate: addDays(today, -14),
      sortOrder: 2,
    },
  });

  await prisma.habit.create({
    data: {
      userId: customerId,
      title: 'Less late scrolling',
      description: 'Phone down by 10pm.',
      icon: '🚫',
      color: '#E24B2A',
      type: 'BREAK',
      scheduleType: 'DAILY',
      startDate: addDays(today, -7),
      sortOrder: 3,
    },
  });

  for (let offset = -13; offset <= 0; offset += 1) {
    const localDate = addDays(today, offset);
    await prisma.habitLog.create({
      data: {
        habitId: reading.id,
        userId: customerId,
        localDate,
        status: offset === -2 ? 'SKIPPED' : 'DONE',
      },
    });
  }

  for (const offset of [-6, -4, -1, 0]) {
    await prisma.habitLog.create({
      data: {
        habitId: walk.id,
        userId: customerId,
        localDate: addDays(today, offset),
        status: 'DONE',
      },
    });
  }

  await prisma.habitLog.create({
    data: {
      habitId: journal.id,
      userId: customerId,
      localDate: today,
      status: 'DONE',
    },
  });

  await prisma.reminder.create({
    data: {
      habitId: reading.id,
      timeLocal: '07:30',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
    },
  });

  await prisma.reminder.create({
    data: {
      habitId: walk.id,
      timeLocal: '19:00',
      daysOfWeek: [1, 3, 5],
      enabled: true,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: customerId,
        audience: 'USER',
        type: 'WELCOME',
        title: 'Welcome to Momentum',
        body: 'Your demo habits are ready on Today.',
      },
      {
        userId: customerId,
        audience: 'USER',
        type: 'SUBSCRIPTION_STARTED',
        title: 'Pro is active',
        body: 'Demo seed activated Pro for one year.',
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
        body: 'customer@momentum.app signed up via seed data.',
        data: { userId: customerId },
      },
      {
        userId: adminId,
        audience: 'ADMIN',
        type: 'ADMIN_NEW_PAYMENT',
        title: 'Seed payment recorded',
        body: 'Demo SSLCommerz payment for Pro — 1 year.',
      },
    ],
  });
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

  await seedDemoCustomerData(customer.id, planIds['pro-year']);
  await seedDemoAdminData(admin.id, customer.id);

  console.log('\nMomentum demo seed complete\n');
  for (const demo of DEMO_USERS) {
    console.log(`  ${demo.role.padEnd(8)}  ${demo.email}  /  ${DEMO_PASSWORD}`);
  }
  console.log('\n  Customer: Pro plan, 4 habits, logs, reminders, payment');
  console.log('  Admin:    complimentary Pro + admin notifications\n');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
