// Money rules: targets, costs, commission, fuel. Pure functions.
//
//   Net = Gross × keep − FixedCosts − FuelPerHour × Hours
//   keep = (1 − commission) × (1 − tax)
//   Gross includes rides AND bonuses (commission is taken from both).
//
// Solving for gross:  Gross = (Net + Fixed + FuelPerHour × Hours) / keep
import type { Settings } from './types';

export function weeklyNetTarget(s: Settings): number {
  return s.target.mode === 'monthly' ? s.target.amount / s.weeksPerMonth : s.target.amount;
}

export function monthlyNetTarget(s: Settings): number {
  return s.target.mode === 'monthly' ? s.target.amount : s.target.amount * s.weeksPerMonth;
}

export function weeklyFixedCosts(s: Settings): number {
  return s.costItems.reduce((acc, c) => acc + (c.period === 'week' ? c.amount : c.amount / s.weeksPerMonth), 0);
}

export function monthlyFixedCosts(s: Settings): number {
  return weeklyFixedCosts(s) * s.weeksPerMonth;
}

/** Fraction of gross the driver keeps after commission and tax. */
export function keepRate(s: Settings): number {
  return (1 - s.commissionPct / 100) * (1 - s.taxPct / 100);
}

/** Estimated fuel cost per driving hour from settings (0 if the LPG price is not set yet). */
export function fuelPerHourEstimate(s: Settings): number {
  if (!s.fuel.pricePerL) return 0;
  return (s.estimates.kmPerHour * s.fuel.consumptionL100 * s.fuel.pricePerL) / 100;
}

export interface GrossNeededInput {
  netTarget: number;
  fixedCosts: number;
  fuelPerHour: number;
  hours: number;
  keep: number;
}

export function grossNeeded(i: GrossNeededInput): number {
  return (i.netTarget + i.fixedCosts + i.fuelPerHour * i.hours) / i.keep;
}

export interface Breakdown {
  gross: number;
  commission: number;
  tax: number;
  fuel: number;
  fixed: number;
  net: number;
}

/** Full breakdown from gross. */
export function breakdown(s: Settings, gross: number, fuel: number, fixed: number): Breakdown {
  const commission = (gross * s.commissionPct) / 100;
  const tax = ((gross - commission) * s.taxPct) / 100;
  return { gross, commission, tax, fuel, fixed, net: gross - commission - tax - fuel - fixed };
}

/** Breakdown of how much gross is needed to hit a net target with the given hours. */
export function targetBreakdown(s: Settings, netTarget: number, fixed: number, fuelPerHour: number, hours: number): Breakdown {
  const gross = grossNeeded({ netTarget, fixedCosts: fixed, fuelPerHour, hours, keep: keepRate(s) });
  return breakdown(s, gross, fuelPerHour * hours, fixed);
}
