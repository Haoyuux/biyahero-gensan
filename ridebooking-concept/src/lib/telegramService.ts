const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID as string | undefined;

export interface RideRequestPayload {
  passengerName: string;
  pickup: string;
  dropoff: string;
  tier: string;
  totalFare: number;
  rideId: string;
}

const TIER_LABEL: Record<string, string> = {
  moto: "Motorcycle",
  eco: "Economy",
  premium: "Premium",
};

export async function sendRideRequestToTelegram(
  payload: RideRequestPayload,
): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const { passengerName, pickup, dropoff, tier, totalFare, rideId } = payload;
  const tierLabel = TIER_LABEL[tier] ?? tier;

  const text = [
    "🛵 *New Ride Request*",
    "",
    `👤 *Passenger:* ${passengerName}`,
    `📍 *Pickup:* ${pickup}`,
    `🏁 *Dropoff:* ${dropoff}`,
    `🚗 *Tier:* ${tierLabel}`,
    `💰 *Fare:* ₱${totalFare.toFixed(2)}`,
    `🆔 *Ride ID:* \`${rideId}\``,
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch {
    // Non-critical — don't block booking flow on Telegram failure
  }
}
