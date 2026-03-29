// ─── Fare Service ─────────────────────────────────────────────────────────────
// Central pricing logic. All fare calculations must go through calculateFare().

export interface TierPricing {
  baseFare: number;
  perKmRate: number;          // includes maintenance cost internally
  perMinuteRate: number;
  bookingFee: number;
  maintenanceCostPerKm: number; // internal operating cost, not billed to the user
}

export interface PricingConfig {
  moto: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
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
  moto: {
    baseFare: 40,
    perKmRate: 12,        // ₱10 revenue + ₱2 maintenance
    perMinuteRate: 2,
    bookingFee: 5,
    maintenanceCostPerKm: 2,
  },
  eco: {
    baseFare: 60,
    perKmRate: 18,        // ₱15 revenue + ₱3 maintenance
    perMinuteRate: 3,
    bookingFee: 8,
    maintenanceCostPerKm: 3,
  },
  premium: {
    baseFare: 100,
    perKmRate: 30,        // ₱25 revenue + ₱5 maintenance
    perMinuteRate: 5,
    bookingFee: 12,
    maintenanceCostPerKm: 5,
  },
};

/**
 * Calculate the full fare breakdown for a ride.
 *
 * Total Fare = baseFare + (distanceKm × perKmRate) + (durationMin × perMinuteRate) + bookingFee
 */
export function calculateFare(
  tierId: keyof PricingConfig,
  distanceM: number,
  durationS: number,
  config: PricingConfig = DEFAULT_PRICING,
): FareBreakdown {
  const p = config[tierId];
  const distanceKm = distanceM / 1000;
  const durationMin = durationS / 60;

  const distanceFee = Math.round(distanceKm * p.perKmRate * 10) / 10;
  const timeFee     = Math.round(durationMin * p.perMinuteRate * 10) / 10;
  const totalFare   = Math.round(p.baseFare + distanceFee + timeFee + p.bookingFee);

  return {
    baseFare:    p.baseFare,
    distanceFee,
    timeFee,
    bookingFee:  p.bookingFee,
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
        moto:    { ...DEFAULT_PRICING.moto,    ...parsed.moto },
        eco:     { ...DEFAULT_PRICING.eco,     ...parsed.eco },
        premium: { ...DEFAULT_PRICING.premium, ...parsed.premium },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_PRICING;
}

/** Persist config to localStorage (called from super-admin panel). */
export function savePricingConfig(config: PricingConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
