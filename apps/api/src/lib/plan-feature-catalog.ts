import type { PackageFeature, PlanLimits } from '@momentum/types';
import type { CatalogPlanSlug } from './plan-catalog.js';

export type FeatureCatalogEntry = {
  key: string;
  label: string;
};

/** Same feature names on every package — only isActive and habit count differ. */
export const PLAN_FEATURE_CATALOG: FeatureCatalogEntry[] = [
  { key: 'habits', label: 'Active habits' },
  { key: 'today', label: 'Today view & logs' },
  { key: 'history', label: 'History view & logs' },
  { key: 'goals', label: 'Goal view & logs' },
  { key: 'stats', label: 'Stats & overview' },
  { key: 'ai', label: 'AI habit suggestions' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'export', label: 'Data export' },
];

function habitsFeatureName(limits: PlanLimits): string {
  const max = limits.maxHabits;
  if (max === null || max === undefined) {
    return 'Active habits: Unlimited';
  }
  return `Active habits: ${max}`;
}

function isFeatureActive(key: string, slug: CatalogPlanSlug, limits: PlanLimits): boolean {
  switch (key) {
    case 'habits':
      return true;
    case 'today':
      return isProSlug(slug);
    case 'history':
      return isProSlug(slug);
    case 'goals':
      return slug === 'pro-lifetime';
    case 'stats':
      return limits.stats === true;
    case 'ai':
      return limits.ai === true;
    case 'reminders':
      return limits.reminders === 'all_devices' || limits.reminders === 'one_device';
    case 'export':
      return Boolean(limits.export?.length);
    default:
      return false;
  }
}

function isProSlug(slug: CatalogPlanSlug): boolean {
  return slug === 'pro-year' || slug === 'pro-lifetime';
}

function featureName(key: string, limits: PlanLimits): string {
  switch (key) {
    case 'habits':
      return habitsFeatureName(limits);
    case 'today':
      return 'Today view & logs';
    case 'history':
      return 'History view & logs';
    case 'goals':
      return 'Goal view & logs';
    case 'stats':
      return 'Stats & overview';
    case 'ai':
      return 'AI habit suggestions';
    case 'reminders':
      if (limits.reminders === 'all_devices') return 'Reminders: All devices';
      if (limits.reminders === 'one_device') return 'Reminders: 1 device';
      return 'Reminders';
    case 'export': {
      const formats = limits.export?.map((format) => format.toUpperCase()).join(', ');
      return formats ? `Data export: ${formats}` : 'Data export';
    }
    default:
      return key;
  }
}

/** Per-package feature list — isActive true = check icon, false = close icon. */
export function buildPackageFeatures(slug: CatalogPlanSlug, limits: PlanLimits): PackageFeature[] {
  return PLAN_FEATURE_CATALOG.map(({ key }) => ({
    isActive: isFeatureActive(key, slug, limits),
    name: featureName(key, limits),
  }));
}

export function buildCompareFeatureRows(
  planSlugs: CatalogPlanSlug[],
  limitsBySlug: Record<string, PlanLimits>,
): Array<{ key: string; label: string; values: Record<string, PackageFeature> }> {
  return PLAN_FEATURE_CATALOG.map(({ key, label }) => ({
    key,
    label,
    values: Object.fromEntries(
      planSlugs.map((slug) => {
        const limits = limitsBySlug[slug] ?? {};
        return [
          slug,
          {
            isActive: isFeatureActive(key, slug, limits),
            name: featureName(key, limits),
          },
        ];
      }),
    ),
  }));
}

export function buildFeatureBullets(slug: CatalogPlanSlug, limits: PlanLimits): string[] {
  return buildPackageFeatures(slug, limits)
    .filter((feature) => feature.isActive)
    .map((feature) => feature.name);
}
