import bcrypt from 'bcryptjs';

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

const DEMO_USERS = [
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
      },
      create: {
        email: demo.email,
        name: demo.name,
        role: demo.role,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
  }
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
    return;
  }

  await prisma.plan.create({
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
}

async function archiveNonCatalogPlans() {
  await prisma.plan.updateMany({
    where: { slug: { notIn: [...CATALOG_PLAN_SLUGS] } },
    data: { status: 'ARCHIVED' },
  });
}

async function main() {
  await seedDemoUsers();
  await archiveNonCatalogPlans();

  for (const plan of SEED_PLANS) {
    await seedPlan(plan);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
