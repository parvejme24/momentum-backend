/** The only plans exposed to customers. */
export const CATALOG_PLAN_SLUGS = ['free', 'pro-year', 'pro-lifetime'] as const;

export type CatalogPlanSlug = (typeof CATALOG_PLAN_SLUGS)[number];

export const FREE_PLAN_SLUG: CatalogPlanSlug = 'free';

/** Paid Pro tiers (checkout + grant-access). */
export const PRO_PLAN_SLUGS = ['pro-year', 'pro-lifetime'] as const;

export type ProPlanSlug = (typeof PRO_PLAN_SLUGS)[number];

const catalogSet = new Set<string>(CATALOG_PLAN_SLUGS);
const proSet = new Set<string>(PRO_PLAN_SLUGS);

export function isCatalogPlanSlug(slug: string): slug is CatalogPlanSlug {
  return catalogSet.has(slug);
}

export function isProPlanSlug(slug: string): slug is ProPlanSlug {
  return proSet.has(slug);
}

export function isPurchasablePlanSlug(slug: string): slug is ProPlanSlug {
  return isProPlanSlug(slug);
}
