import { describe, expect, it } from 'vitest';
import { buildPackageFeatures } from '../src/lib/plan-feature-catalog.js';

describe('plan feature catalog', () => {
  const freeLimits = {
    maxHabits: 20,
    heatmapDays: 90,
    reminders: 'one_device' as const,
    export: ['csv' as const],
    stats: false,
    ai: false,
  };

  const proLimits = {
    maxHabits: null,
    heatmapDays: 364,
    reminders: 'all_devices' as const,
    export: ['csv' as const, 'json' as const],
    stats: true,
    ai: true,
  };

  it('returns isActive + name for each package feature row', () => {
    const free = buildPackageFeatures('free', freeLimits);

    expect(free[0]).toEqual({ isActive: true, name: 'Active habits: 20' });
    expect(free[1]).toEqual({ isActive: false, name: 'Today view & logs' });
    expect(free[2]).toEqual({ isActive: false, name: 'History view & logs' });
    expect(free[3]).toEqual({ isActive: false, name: 'Goal view & logs' });
  });

  it('enables pro-year features except lifetime-only goals', () => {
    const proYear = buildPackageFeatures('pro-year', proLimits);

    expect(proYear[0]).toEqual({ isActive: true, name: 'Active habits: Unlimited' });
    expect(proYear[1]?.isActive).toBe(true);
    expect(proYear[2]?.isActive).toBe(true);
    expect(proYear[3]?.isActive).toBe(false);
  });

  it('enables all core rows on pro-lifetime', () => {
    const proLifetime = buildPackageFeatures('pro-lifetime', proLimits);

    expect(proLifetime.slice(0, 4).every((feature) => feature.isActive)).toBe(true);
  });
});
