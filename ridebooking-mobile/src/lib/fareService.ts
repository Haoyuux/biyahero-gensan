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

export interface ErrandVehiclePricing {
  baseFare: number;
  perKmRate: number;
  maintenanceCostPerKm: number;
  convenienceFee: number;
  disabled: boolean;
}

export interface ErrandPricing {
  moto: ErrandVehiclePricing;
  tricycle: ErrandVehiclePricing;
  disabled: boolean;
}

export interface ErrandFareBreakdown {
  baseFare: number;
  distanceFee: number;
  convenienceFee: number;
  total: number;
  distanceKm: number;
}

export interface PricingConfig {
  moto: TierPricing;
  tricycle: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
  errand: ErrandPricing;
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
  errand: {
    disabled: false,
    moto: { baseFare: 35, perKmRate: 10, maintenanceCostPerKm: 2, convenienceFee: 15, disabled: false },
    tricycle: { baseFare: 45, perKmRate: 12, maintenanceCostPerKm: 2, convenienceFee: 15, disabled: false },
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

export function calculateErrandFare(
  errandType: 'buy' | 'pickup_deliver' | 'other',
  vehicleType: 'moto' | 'tricycle',
  distanceM: number,
  config: PricingConfig = DEFAULT_PRICING,
): ErrandFareBreakdown {
  const p = config.errand[vehicleType];
  const distanceKm = distanceM / 1000;
  const distanceFee = Math.round(distanceKm * p.perKmRate * 10) / 10;
  const convenienceFee = errandType === 'pickup_deliver' ? 0 : p.convenienceFee;
  const total = Math.round(p.baseFare + distanceFee + convenienceFee);
  return { baseFare: p.baseFare, distanceFee, convenienceFee, total, distanceKm };
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
      errand: saved.errand ? {
        disabled: saved.errand.disabled ?? false,
        moto: { ...DEFAULT_PRICING.errand.moto, ...saved.errand.moto },
        tricycle: { ...DEFAULT_PRICING.errand.tricycle, ...saved.errand.tricycle },
      } : DEFAULT_PRICING.errand,
    };
  } catch {
    return DEFAULT_PRICING;
  }
}
