import { prisma } from '../src/lib/prisma.js';

type SeedPlan = {
  slug: string;
  name: string;
  blurb: string;
  priceCents: number;
  interval: 'FOREVER' | 'MONTH';
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
    blurb: 'Start a few habits and see if Momentum sticks.',
    priceCents: 0,
    interval: 'FOREVER',
    seatBased: false,
    highlighted: false,
    sortOrder: 0,
    ctaLabel: 'Start free',
    features: ['3 habits', '90-day heatmap', 'Reminders on 1 device', 'CSV export'],
    limits: {
      maxHabits: 3,
      heatmapDays: 90,
      reminders: 'one_device',
      export: ['csv'],
      sharedBoards: false,
      adminSeats: 0,
      stats: false,
    },
  },
  {
    slug: 'pro',
    name: 'Pro',
    blurb: 'Unlimited habits, a full-year chain, and stats that keep you honest.',
    priceCents: 600,
    interval: 'MONTH',
    seatBased: false,
    highlighted: true,
    sortOrder: 1,
    ctaLabel: 'Start with Pro',
    features: [
      'Unlimited habits',
      '364-day year chain',
      'Stats',
      'Reminders on all devices',
      'CSV and JSON export',
    ],
    limits: {
      maxHabits: null,
      heatmapDays: 364,
      reminders: 'all_devices',
      export: ['csv', 'json'],
      sharedBoards: false,
      adminSeats: 0,
      stats: true,
    },
  },
  {
    slug: 'team',
    name: 'Team',
    blurb: 'Everything in Pro, plus shared boards and admin seats.',
    priceCents: 1200,
    interval: 'MONTH',
    seatBased: true,
    highlighted: false,
    sortOrder: 2,
    ctaLabel: 'Contact for Team',
    features: ['Everything in Pro', 'Shared boards', 'Admin seats'],
    limits: {
      maxHabits: null,
      heatmapDays: 364,
      reminders: 'all_devices',
      export: ['csv', 'json'],
      sharedBoards: true,
      adminSeats: null,
      stats: true,
    },
  },
];

async function main() {
  for (const plan of SEED_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { slug: plan.slug } });
    if (existing) continue;

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
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
