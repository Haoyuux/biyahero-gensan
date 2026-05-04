// ─── Fare Service ─────────────────────────────────────────────────────────────
// Central pricing logic. All fare calculations must go through calculateFare().

import { supabase, supabaseAdmin } from './supabase';

export interface TierPricing {
  baseFare: number;
  perKmRate: number;          // includes maintenance cost internally
  perMinuteRate: number;
  bookingFee: number;
  bookingFeeType: 'static' | 'per_km';  // 'static' = fixed amount, 'per_km' = multiplied by distance
  maintenanceCostPerKm: number; // internal operating cost, not billed to the user
  perKmThresholdEnabled: boolean; // if true, per-km rate only applies beyond perKmThreshold km
  perKmThreshold: number;         // km below this are free of per-km charge
}

export interface PricingConfig {
  moto: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
  teamBookingFeeDiscount: number; // percentage 0-100, applied at remittance time
}

export interface FareBreakdown {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  bookingFee: number;
  totalFare: number;
}

const STORAGE_KEY = 'fetch_pricing_config';

export const DEFAULT_PRICING: PricingConfig = {
  teamBookingFeeDiscount: 0,
  moto: {
    baseFare: 40,
    perKmRate: 12,        // ₱10 revenue + ₱2 maintenance
    perMinuteRate: 2,
    bookingFee: 5,
    bookingFeeType: 'static',
    maintenanceCostPerKm: 2,
    perKmThresholdEnabled: false,
    perKmThreshold: 0,
  },
  eco: {
    baseFare: 60,
    perKmRate: 18,        // ₱15 revenue + ₱3 maintenance
    perMinuteRate: 3,
    bookingFee: 8,
    bookingFeeType: 'static',
    maintenanceCostPerKm: 3,
    perKmThresholdEnabled: false,
    perKmThreshold: 0,
  },
  premium: {
    baseFare: 100,
    perKmRate: 30,        // ₱25 revenue + ₱5 maintenance
    perMinuteRate: 5,
    bookingFee: 12,
    bookingFeeType: 'static',
    maintenanceCostPerKm: 5,
    perKmThresholdEnabled: false,
    perKmThreshold: 0,
  },
};

/**
 * Calculate the full fare breakdown for a ride.
 *
 * Booking fee can be:
 *   - 'static': bookingFee is a flat amount
 *   - 'per_km': bookingFee × distanceKm
 *
 * Total Fare = baseFare + (distanceKm × perKmRate) + (durationMin × perMinuteRate) + computedBookingFee
 */
export function calculateFare(
  tierId: 'moto' | 'eco' | 'premium',
  distanceM: number,
  durationS: number,
  config: PricingConfig = DEFAULT_PRICING,
): FareBreakdown {
  const p = config[tierId];
  const distanceKm = distanceM / 1000;
  const durationMin = durationS / 60;

  const billableKm = p.perKmThresholdEnabled
    ? Math.max(0, distanceKm - (p.perKmThreshold ?? 0))
    : distanceKm;
  const distanceFee = Math.round(billableKm * p.perKmRate * 10) / 10;
  const timeFee     = Math.round(durationMin * p.perMinuteRate * 10) / 10;
  const bookingFee  = p.bookingFeeType === 'per_km'
    ? Math.round(distanceKm * p.bookingFee * 10) / 10
    : p.bookingFee;
  const totalFare   = Math.round(p.baseFare + distanceFee + timeFee + bookingFee);

  return {
    baseFare:    p.baseFare,
    distanceFee,
    timeFee,
    bookingFee,
    totalFare,
  };
}

/** Load saved config from localStorage, merged with defaults for missing keys. */
export function loadPricingConfig(): PricingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PricingConfig>;
      return {
        teamBookingFeeDiscount: parsed.teamBookingFeeDiscount ?? DEFAULT_PRICING.teamBookingFeeDiscount,
        moto:    { ...DEFAULT_PRICING.moto,    ...parsed.moto },
        eco:     { ...DEFAULT_PRICING.eco,     ...parsed.eco },
        premium: { ...DEFAULT_PRICING.premium, ...parsed.premium },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_PRICING;
}

/** Persist config to localStorage and notify same-tab listeners. */
export function savePricingConfig(config: PricingConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event('pricingConfigUpdated'));
}

/** Load pricing config from Supabase DB (app_settings row id=1). Falls back to defaults. */
export async function loadPricingConfigFromDB(): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('pricing_config')
      .eq('id', 1)
      .single();
    if (error || !data?.pricing_config) return loadPricingConfig();
    const saved = data.pricing_config as Partial<PricingConfig>;
    return {
      teamBookingFeeDiscount: saved.teamBookingFeeDiscount ?? DEFAULT_PRICING.teamBookingFeeDiscount,
      moto:    { ...DEFAULT_PRICING.moto,    ...saved.moto },
      eco:     { ...DEFAULT_PRICING.eco,     ...saved.eco },
      premium: { ...DEFAULT_PRICING.premium, ...saved.premium },
    };
  } catch {
    return loadPricingConfig();
  }
}

/** Save pricing config to Supabase DB (super-admin only, uses service role key). */
export async function savePricingConfigToDB(config: PricingConfig): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .update({ pricing_config: config })
    .eq('id', 1);
  if (error) {
    console.error('Error saving pricing config to DB:', error);
    return false;
  }
  return true;
}
