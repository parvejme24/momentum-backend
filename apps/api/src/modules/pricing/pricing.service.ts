import type {
  AdminPlan,
  CompareResponse,
  CreatePlanInput,
  ListAdminPlansQuery,
  PlanInterval,
  PlanLimits,
  PlanStatus,
  PublicPlan,
  ReorderPlansInput,
  UpdatePlanInput,
  UpdatePlanResponse,
} from '@momentum/types';
import { planLimitsSchema } from '@momentum/types';
import type {
  Plan,
  PlanFeature,
  PlanInterval as DbInterval,
  PlanStatus as DbStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const INTERVAL_TO_DB: Record<PlanInterval, DbInterval> = {
  one_time: 'ONE_TIME',
  month: 'MONTH',
  year: 'YEAR',
  forever: 'FOREVER',
};

const INTERVAL_FROM_DB: Record<DbInterval, PlanInterval> = {
  ONE_TIME: 'one_time',
  MONTH: 'month',
  YEAR: 'year',
  FOREVER: 'forever',
};

const STATUS_TO_DB: Record<PlanStatus, DbStatus> = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
};

const STATUS_FROM_DB: Record<DbStatus, PlanStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

type PlanWithFeatures = Plan & { features: PlanFeature[] };

function parseLimits(value: Prisma.JsonValue): PlanLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = planLimitsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function toPublicPlan(plan: PlanWithFeatures): PublicPlan {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    blurb: plan.blurb,
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: INTERVAL_FROM_DB[plan.interval],
    intervalCount: plan.intervalCount,
    seatBased: plan.seatBased,
    highlighted: plan.highlighted,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    features: [...plan.features].sort((a, b) => a.sortOrder - b.sortOrder).map((f) => f.label),
    limits: parseLimits(plan.limits),
  };
}

function toAdminPlan(plan: PlanWithFeatures): AdminPlan {
  return {
    ...toPublicPlan(plan),
    status: STATUS_FROM_DB[plan.status],
    sortOrder: plan.sortOrder,
    currentVersion: plan.currentVersion,
    publishedAt: plan.publishedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    createdById: plan.createdById,
    updatedById: plan.updatedById,
  };
}

async function requirePlan(id: string): Promise<PlanWithFeatures> {
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!plan) throw AppError.notFound('Plan not found');
  return plan;
}

async function assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
  const existing = await prisma.plan.findFirst({
    where: {
      slug,
      status: { not: 'ARCHIVED' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) {
    throw AppError.conflict('A plan with this slug already exists');
  }
}

async function publishedCount(excludeId?: string): Promise<number> {
  return prisma.plan.count({
    where: {
      status: 'PUBLISHED',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

async function hasActiveSubscribers(planId: string): Promise<boolean> {
  const count = await prisma.planSubscription.count({
    where: { planId, status: 'ACTIVE' },
  });
  return count > 0;
}

function billingFieldsChanged(plan: Plan, input: UpdatePlanInput): boolean {
  return (
    (input.priceCents !== undefined && input.priceCents !== plan.priceCents) ||
    (input.currency !== undefined && input.currency !== plan.currency) ||
    (input.interval !== undefined && INTERVAL_TO_DB[input.interval] !== plan.interval) ||
    (input.intervalCount !== undefined && input.intervalCount !== plan.intervalCount) ||
    (input.seatBased !== undefined && input.seatBased !== plan.seatBased)
  );
}

function replaceFeatures(planId: string, labels: string[]): Prisma.PlanFeatureCreateManyInput[] {
  return labels.map((label, index) => ({
    planId,
    label,
    sortOrder: index,
  }));
}

export async function listPublishedPlans(): Promise<PublicPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.map(toPublicPlan);
}

export async function getPublishedPlanBySlug(slug: string): Promise<PublicPlan> {
  const plan = await prisma.plan.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!plan) throw AppError.notFound('Plan not found');
  return toPublicPlan(plan);
}

const COMPARE_ROWS: Array<{ key: keyof PlanLimits; label: string }> = [
  { key: 'maxHabits', label: 'Habits' },
  { key: 'heatmapDays', label: 'Heatmap history' },
  { key: 'stats', label: 'Stats' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'export', label: 'Export' },
  { key: 'sharedBoards', label: 'Shared boards' },
  { key: 'adminSeats', label: 'Admin seats' },
];

function formatLimitValue(key: keyof PlanLimits, limits: PlanLimits): string {
  const value = limits[key];
  if (value === undefined) return '—';
  if (value === null) return 'Unlimited';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ').toUpperCase();
  if (value === 'one_device') return '1 device';
  if (value === 'all_devices') return 'All devices';
  return String(value);
}

export async function getCompareTable(): Promise<CompareResponse> {
  const plans = await prisma.plan.findMany({
    where: { status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  return {
    plans: plans.map((p) => ({ slug: p.slug, name: p.name, highlighted: p.highlighted })),
    rows: COMPARE_ROWS.map(({ key, label }) => ({
      key,
      label,
      values: Object.fromEntries(
        plans.map((p) => [p.slug, formatLimitValue(key, parseLimits(p.limits))]),
      ),
    })),
  };
}

export async function listAdminPlans(query: ListAdminPlansQuery): Promise<AdminPlan[]> {
  const plans = await prisma.plan.findMany({
    where: query.status === 'all' ? {} : { status: STATUS_TO_DB[query.status] },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.map(toAdminPlan);
}

export async function getAdminPlan(id: string): Promise<AdminPlan> {
  return toAdminPlan(await requirePlan(id));
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<AdminPlan> {
  await assertSlugAvailable(input.slug);

  const maxSort = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const plan = await prisma.plan.create({
    data: {
      slug: input.slug,
      name: input.name,
      blurb: input.blurb,
      priceCents: input.priceCents,
      currency: input.currency,
      interval: INTERVAL_TO_DB[input.interval],
      intervalCount: input.intervalCount,
      seatBased: input.seatBased,
      highlighted: input.highlighted,
      sortOrder,
      ctaLabel: input.ctaLabel,
      ctaHref: input.ctaHref,
      limits: input.limits,
      createdById: userId,
      updatedById: userId,
      features: {
        create: input.features.map((label, index) => ({ label, sortOrder: index })),
      },
    },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });

  return toAdminPlan(plan);
}

export async function updatePlan(
  userId: string,
  id: string,
  input: UpdatePlanInput,
): Promise<UpdatePlanResponse> {
  const existing = await requirePlan(id);

  if (input.slug !== undefined && input.slug !== existing.slug) {
    if (existing.publishedAt) {
      throw AppError.conflict('Slug cannot change after a plan has been published');
    }
    await assertSlugAvailable(input.slug, existing.id);
  }

  const shouldVersion = existing.status === 'PUBLISHED' && billingFieldsChanged(existing, input);

  const nextHighlighted = input.highlighted ?? existing.highlighted;

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldVersion) {
      await tx.planVersion.create({
        data: {
          planId: existing.id,
          version: existing.currentVersion,
          priceCents: existing.priceCents,
          currency: existing.currency,
          interval: existing.interval,
          intervalCount: existing.intervalCount,
          seatBased: existing.seatBased,
          limits: existing.limits as Prisma.InputJsonValue,
          createdById: userId,
        },
      });
    }

    if (input.features) {
      await tx.planFeature.deleteMany({ where: { planId: existing.id } });
      await tx.planFeature.createMany({
        data: replaceFeatures(existing.id, input.features),
      });
    }

    const plan = await tx.plan.update({
      where: { id: existing.id },
      data: {
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.blurb !== undefined ? { blurb: input.blurb } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.interval !== undefined ? { interval: INTERVAL_TO_DB[input.interval] } : {}),
        ...(input.intervalCount !== undefined ? { intervalCount: input.intervalCount } : {}),
        ...(input.seatBased !== undefined ? { seatBased: input.seatBased } : {}),
        ...(input.highlighted !== undefined ? { highlighted: input.highlighted } : {}),
        ...(input.ctaLabel !== undefined ? { ctaLabel: input.ctaLabel } : {}),
        ...(input.ctaHref !== undefined ? { ctaHref: input.ctaHref } : {}),
        ...(input.limits !== undefined ? { limits: input.limits } : {}),
        ...(shouldVersion ? { currentVersion: existing.currentVersion + 1 } : {}),
        updatedById: userId,
      },
      include: { features: { orderBy: { sortOrder: 'asc' } } },
    });

    if (plan.status === 'PUBLISHED' && nextHighlighted) {
      await tx.plan.updateMany({
        where: { id: { not: plan.id }, status: 'PUBLISHED', highlighted: true },
        data: { highlighted: false },
      });
    }

    return plan;
  });

  return {
    plan: toAdminPlan(updated),
    versionCreated: shouldVersion,
    message: shouldVersion
      ? 'Price/interval change created a new version. Existing subscriptions keep the previous amount until renewal.'
      : null,
  };
}

export async function publishPlan(userId: string, id: string): Promise<AdminPlan> {
  const existing = await requirePlan(id);
  if (existing.status === 'ARCHIVED') {
    throw AppError.conflict('Archived plans cannot be published');
  }

  const plan = await prisma.$transaction(async (tx) => {
    if (existing.highlighted) {
      await tx.plan.updateMany({
        where: { id: { not: existing.id }, status: 'PUBLISHED', highlighted: true },
        data: { highlighted: false },
      });
    }

    return tx.plan.update({
      where: { id: existing.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? new Date(),
        updatedById: userId,
      },
      include: { features: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  return toAdminPlan(plan);
}

export async function archivePlan(userId: string, id: string): Promise<AdminPlan> {
  const existing = await requirePlan(id);
  if (existing.status === 'PUBLISHED') {
    const remaining = await publishedCount(existing.id);
    if (remaining < 1) {
      throw AppError.conflict('Cannot archive the last published plan');
    }
  }

  const plan = await prisma.plan.update({
    where: { id: existing.id },
    data: {
      status: 'ARCHIVED',
      highlighted: false,
      updatedById: userId,
    },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });

  return toAdminPlan(plan);
}

export async function reorderPlans(userId: string, input: ReorderPlansInput): Promise<AdminPlan[]> {
  const plans = await prisma.plan.findMany({ select: { id: true } });
  const known = new Set(plans.map((p) => p.id));
  if (input.ids.length !== known.size || input.ids.some((id) => !known.has(id))) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'ids', issue: 'must include every plan id exactly once' },
    ]);
  }

  await prisma.$transaction(
    input.ids.map((id, index) =>
      prisma.plan.update({
        where: { id },
        data: { sortOrder: index, updatedById: userId },
      }),
    ),
  );

  return listAdminPlans({ status: 'all' });
}

export async function deletePlan(id: string): Promise<void> {
  const existing = await requirePlan(id);

  if (await hasActiveSubscribers(existing.id)) {
    throw AppError.conflict('Plans with active subscribers cannot be deleted — archive instead');
  }

  if (existing.status === 'PUBLISHED') {
    const remaining = await publishedCount(existing.id);
    if (remaining < 1) {
      throw AppError.conflict('Cannot delete the last published plan');
    }
  }

  await prisma.plan.delete({ where: { id: existing.id } });
}
