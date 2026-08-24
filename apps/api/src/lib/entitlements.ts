import type { PlanLimits, UserEntitlements } from '@momentum/types';
import { planLimitsSchema } from '@momentum/types';
import type { Plan, PlanSubscription, Prisma } from '../generated/prisma/client.js';
import { getAuthStatus } from './auth-cache.js';
import { AppError } from './errors.js';
import { prisma } from './prisma.js';
import { FREE_PLAN_SLUG, isProPlanSlug } from './plan-catalog.js';
import { LIVE_SUB_STATUSES } from '../modules/admin/mappers.js';

type PlanWithFeatures = Plan & { features: { label: string; sortOrder: number }[] };

const DEFAULT_FREE_LIMITS: PlanLimits = {
  maxHabits: 20,
  heatmapDays: 90,
  reminders: 'one_device',
  export: ['csv'],
  sharedBoards: false,
  adminSeats: 0,
  stats: false,
  ai: false,
};

const DEFAULT_PRO_LIMITS: PlanLimits = {
  maxHabits: null,
  heatmapDays: 364,
  reminders: 'all_devices',
  export: ['csv', 'json'],
  sharedBoards: false,
  adminSeats: 0,
  stats: true,
  ai: true,
};

function parseLimits(value: Prisma.JsonValue): PlanLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = planLimitsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function mergeLimits(base: PlanLimits, parsed: PlanLimits): PlanLimits {
  return { ...base, ...parsed };
}

function isProSlug(slug: string): boolean {
  return isProPlanSlug(slug);
}

function subscriptionIsActive(sub: Pick<PlanSubscription, 'status' | 'currentPeriodEnd'>): boolean {
  if (!LIVE_SUB_STATUSES.includes(sub.status)) return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) return false;
  return true;
}

async function expireStaleSubscription(sub: PlanSubscription): Promise<void> {
  if (
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd.getTime() <= Date.now() &&
    LIVE_SUB_STATUSES.includes(sub.status)
  ) {
    await prisma.planSubscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED' },
    });
  }
}

const PLAN_CACHE_TTL_MS = 30_000;
const planCache = new Map<string, { expiresAt: number; plan: PlanWithFeatures | null }>();

async function getPublishedPlan(slug: string): Promise<PlanWithFeatures | null> {
  const hit = planCache.get(slug);
  if (hit && hit.expiresAt > Date.now()) return hit.plan;

  const plan = await prisma.plan.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });

  planCache.set(slug, { expiresAt: Date.now() + PLAN_CACHE_TTL_MS, plan });
  return plan;
}

async function getFreePlan(): Promise<PlanWithFeatures> {
  const plan = await getPublishedPlan(FREE_PLAN_SLUG);
  if (plan) return plan;

  return {
    id: '00000000-0000-0000-0000-000000000000',
    slug: FREE_PLAN_SLUG,
    name: 'Free',
    blurb: 'Limited habits and features.',
    priceCents: 0,
    currency: 'USD',
    interval: 'FOREVER',
    intervalCount: 1,
    seatBased: false,
    highlighted: false,
    sortOrder: 0,
    status: 'PUBLISHED',
    ctaLabel: 'Start free',
    ctaHref: '/register',
    limits: DEFAULT_FREE_LIMITS as Prisma.JsonValue,
    publishedAt: new Date(),
    currentVersion: 1,
    createdById: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    features: [{ label: '20 habits', sortOrder: 0 }],
  };
}

async function countActiveHabits(userId: string): Promise<number> {
  return prisma.habit.count({
    where: { userId, archivedAt: null },
  });
}

function buildEntitlements(input: {
  userId: string;
  plan: Pick<Plan, 'slug' | 'name' | 'limits' | 'interval'>;
  source: UserEntitlements['source'];
  activeHabits: number;
  expiresAt: Date | null;
}): UserEntitlements {
  const baseLimits = isProSlug(input.plan.slug) ? DEFAULT_PRO_LIMITS : DEFAULT_FREE_LIMITS;
  const limits = mergeLimits(baseLimits, parseLimits(input.plan.limits));
  const isLifetime =
    input.plan.interval === 'FOREVER' || (input.expiresAt === null && isProSlug(input.plan.slug));

  return {
    planSlug: input.plan.slug,
    planName: input.plan.name,
    tier: isProSlug(input.plan.slug) ? 'pro' : 'free',
    source: input.source,
    limits,
    aiEnabled: limits.ai === true,
    activeHabits: input.activeHabits,
    maxHabits: limits.maxHabits ?? null,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    isLifetime,
  };
}

export async function resolveUserEntitlements(userId: string): Promise<UserEntitlements> {
  const [activeHabits, live] = await Promise.all([
    countActiveHabits(userId),
    prisma.planSubscription.findFirst({
      where: { userId, status: { in: LIVE_SUB_STATUSES } },
      include: { plan: { include: { features: { orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (live) {
    if (!subscriptionIsActive(live)) {
      void expireStaleSubscription(live);
    } else {
      return buildEntitlements({
        userId,
        plan: live.plan,
        source: 'subscription',
        activeHabits,
        expiresAt: live.currentPeriodEnd,
      });
    }
  }

  const auth = await getAuthStatus(userId);
  if (auth?.role === 'ADMIN' && !auth.deletedAt && !auth.bannedAt) {
    const proPlan = await getPublishedPlan('pro-lifetime');
    if (proPlan) {
      return buildEntitlements({
        userId,
        plan: proPlan,
        source: 'complimentary',
        activeHabits,
        expiresAt: null,
      });
    }
  }

  const freePlan = await getFreePlan();
  return buildEntitlements({
    userId,
    plan: freePlan,
    source: 'default',
    activeHabits,
    expiresAt: null,
  });
}

export async function assertCanAddHabit(userId: string): Promise<UserEntitlements> {
  const entitlements = await resolveUserEntitlements(userId);
  if (entitlements.maxHabits !== null && entitlements.activeHabits >= entitlements.maxHabits) {
    throw new AppError(
      `Free plan allows up to ${entitlements.maxHabits} active habits. Upgrade to Pro for unlimited habits and AI suggestions.`,
      403,
      'PLAN_LIMIT',
      [{ field: 'habits', issue: 'max_habits_reached', message: String(entitlements.maxHabits) }],
    );
  }
  return entitlements;
}

export async function assertHasAi(userId: string): Promise<UserEntitlements> {
  const entitlements = await resolveUserEntitlements(userId);
  if (!entitlements.aiEnabled) {
    throw new AppError(
      'AI suggestions are available on Pro plans only.',
      403,
      'FEATURE_REQUIRES_PRO',
    );
  }
  return entitlements;
}

export async function assertHasStats(userId: string): Promise<UserEntitlements> {
  const entitlements = await resolveUserEntitlements(userId);
  if (!entitlements.limits.stats) {
    throw new AppError('Stats are available on Pro plans only.', 403, 'FEATURE_REQUIRES_PRO');
  }
  return entitlements;
}

export { parseLimits, getPublishedPlan, FREE_PLAN_SLUG };
