import type {
  AdminPlan,
  CompareResponse,
  CreatePlanInput,
  ListAdminPlansQuery,
  PlanInterval,
  PlanLimits,
  PlanStatus,
  PricingPackage,
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
import { env } from '../../lib/env.js';
import { invalidatePublishedPlanCache } from '../../lib/entitlements.js';
import { buildCompareFeatureRows, buildPackageFeatures } from '../../lib/plan-feature-catalog.js';
import { CATALOG_PLAN_SLUGS, isCatalogPlanSlug } from '../../lib/plan-catalog.js';
import type { CatalogPlanSlug } from '../../lib/plan-catalog.js';
import { prisma } from '../../lib/prisma.js';
import { notifyAdminsPlanPublished } from '../notification/notification.events.js';

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

const PUBLIC_PLANS_TTL_MS = 30_000;
let publicPlansCache: { expiresAt: number; plans: PublicPlan[] } | null = null;

function invalidatePublicPricingCache(): void {
  publicPlansCache = null;
  invalidatePublishedPlanCache();
}

function parseLimits(value: Prisma.JsonValue): PlanLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = planLimitsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function toPublicPlan(plan: PlanWithFeatures): PublicPlan {
  const limits = parseLimits(plan.limits);
  const slug = plan.slug as CatalogPlanSlug;
  const features = isCatalogPlanSlug(slug) ? buildPackageFeatures(slug, limits) : [];

  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    package: plan.name,
    blurb: plan.blurb,
    priceCents: plan.priceCents,
    price: plan.priceCents / 100,
    currency: plan.currency,
    interval: INTERVAL_FROM_DB[plan.interval],
    intervalCount: plan.intervalCount,
    seatBased: plan.seatBased,
    highlighted: plan.highlighted,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    features,
    limits,
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
    where: { planId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
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
  if (env.NODE_ENV !== 'test' && publicPlansCache && publicPlansCache.expiresAt > Date.now()) {
    return publicPlansCache.plans;
  }

  const plans = await prisma.plan.findMany({
    where: { status: 'PUBLISHED', slug: { in: [...CATALOG_PLAN_SLUGS] } },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  const mapped = plans.map(toPublicPlan);
  publicPlansCache = { expiresAt: Date.now() + PUBLIC_PLANS_TTL_MS, plans: mapped };
  return mapped;
}

export async function getPublishedPlanBySlug(slug: string): Promise<PublicPlan> {
  if (!isCatalogPlanSlug(slug)) throw AppError.notFound('Plan not found');

  const plans = await listPublishedPlans();
  const plan = plans.find((row) => row.slug === slug);
  if (!plan) throw AppError.notFound('Plan not found');
  return plan;
}

export async function listPricingPackages(): Promise<PricingPackage[]> {
  const plans = await listPublishedPlans();
  return plans.map((plan) => ({
    package: plan.package,
    slug: plan.slug,
    price: plan.price,
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: plan.interval,
    highlighted: plan.highlighted,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    blurb: plan.blurb,
    features: plan.features,
  }));
}

export async function getCompareTable(): Promise<CompareResponse> {
  const plans = await listPublishedPlans();

  const slugs = plans.map((plan) => plan.slug as CatalogPlanSlug);
  const limitsBySlug = Object.fromEntries(plans.map((plan) => [plan.slug, plan.limits]));

  return {
    plans: plans.map((plan) => ({
      slug: plan.slug,
      name: plan.name,
      highlighted: plan.highlighted,
      priceCents: plan.priceCents,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      ctaLabel: plan.ctaLabel,
    })),
    features: buildCompareFeatureRows(slugs, limitsBySlug),
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

  invalidatePublicPricingCache();
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

  invalidatePublicPricingCache();
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

  const published = toAdminPlan(plan);
  invalidatePublicPricingCache();
  notifyAdminsPlanPublished(published.name, published.id);
  return published;
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

  invalidatePublicPricingCache();
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

  invalidatePublicPricingCache();
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
  invalidatePublicPricingCache();
}
