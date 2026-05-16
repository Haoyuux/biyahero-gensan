export interface TierPricing {
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  bookingFee: number;
  bookingFeeType: 'static' | 'per_km';
  maintenanceCostPerKm: number;
  perKmThresholdEnabled: boolean;
  perKmThreshold: number;
  disabled: boolean;
}

export interface PricingConfig {
  moto: TierPricing;
  tricycle: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
  teamBookingFeeDiscount: number;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  bookingFee: number;
  totalFare: number;
  distanceKm: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  teamBookingFeeDiscount: 0,
  moto: {
    baseFare: 40, perKmRate: 12, perMinuteRate: 2, bookingFee: 5,
    bookingFeeType: 'static', maintenanceCostPerKm: 2,
    perKmThresholdEnabled: false, perKmThreshold: 0, disabled: false,
  },
  tricycle: {
    baseFare: 50, perKmRate: 14, perMinuteRate: 2, bookingFee: 5,
    bookingFeeType: 'static', maintenanceCostPerKm: 2,
    perKmThresholdEnabled: false, perKmThreshold: 0, disabled: false,
  },
  eco: {
    baseFare: 60, perKmRate: 18, perMinuteRate: 3, bookingFee: 8,
    bookingFeeType: 'static', maintenanceCostPerKm: 3,
    perKmThresholdEnabled: false, perKmThreshold: 0, disabled: false,
  },
  premium: {
    baseFare: 100, perKmRate: 30, perMinuteRate: 5, bookingFee: 12,
    bookingFeeType: 'static', maintenanceCostPerKm: 5,
    perKmThresholdEnabled: false, perKmThreshold: 0, disabled: false,
  },
};

export function calculateFare(
  tierId: 'moto' | 'tricycle' | 'eco' | 'premium',
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
  const timeFee = Math.round(durationMin * p.perMinuteRate * 10) / 10;
  const bookingFee = p.bookingFeeType === 'per_km'
    ? Math.round(distanceKm * p.bookingFee * 10) / 10
    : p.bookingFee;
  const totalFare = Math.round(p.baseFare + distanceFee + timeFee + bookingFee);
  return { baseFare: p.baseFare, distanceFee, timeFee, bookingFee, totalFare, distanceKm };
}

export async function loadPricingConfigFromDB(supabase: any): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('config')
      .eq('id', 1)
      .single();
    if (error || !data?.config) return DEFAULT_PRICING;
    const saved = data.config as Partial<PricingConfig>;
    return {
      teamBookingFeeDiscount: saved.teamBookingFeeDiscount ?? DEFAULT_PRICING.teamBookingFeeDiscount,
      moto: { ...DEFAULT_PRICING.moto, ...saved.moto },
      tricycle: { ...DEFAULT_PRICING.tricycle, ...saved.tricycle },
      eco: { ...DEFAULT_PRICING.eco, ...saved.eco },
      premium: { ...DEFAULT_PRICING.premium, ...saved.premium },
    };
  } catch {
    return DEFAULT_PRICING;
  }
}
