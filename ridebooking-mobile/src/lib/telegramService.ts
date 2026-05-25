import { getAppSettings } from './settingsService';

const BOT_TOKEN = process.env.EXPO_PUBLIC_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.EXPO_PUBLIC_TELEGRAM_CHAT_ID;

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const settings = await getAppSettings();
    if (settings && !settings.telegram_enabled) return;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch {
    // Non-critical
  }
}

export interface ErrandRequestPayload {
  userName: string;
  errandType: 'buy' | 'pickup_deliver' | 'other';
  vehicleType: 'moto' | 'tricycle';
  pickup: string;
  dropoff: string;
  description: string;
  fare: number;
  errandId: string;
}

const ERRAND_TYPE_LABEL: Record<string, string> = {
  buy: '🛍️ Buy Something',
  pickup_deliver: '📦 Pick Up & Deliver',
  other: '📋 Other',
};

const VEHICLE_LABEL: Record<string, string> = {
  moto: '🏍️ Motorcycle',
  tricycle: '🛺 Tricycle',
};

export async function sendErrandRequestToTelegram(
  payload: ErrandRequestPayload,
): Promise<void> {
  const { userName, errandType, vehicleType, pickup, dropoff, description, fare, errandId } = payload;

  const text = [
    '📦 *New Sugo / Errand Request*',
    '',
    `👤 *User:* ${userName}`,
    `📋 *Type:* ${ERRAND_TYPE_LABEL[errandType] ?? errandType}`,
    `🚗 *Vehicle:* ${VEHICLE_LABEL[vehicleType] ?? vehicleType}`,
    `📍 *Pickup:* ${pickup}`,
    `🏁 *Dropoff:* ${dropoff}`,
    `📝 *Task:* ${description.slice(0, 120)}${description.length > 120 ? '…' : ''}`,
    `💰 *Fare:* ₱${fare.toFixed(2)}`,
    `🆔 *Errand ID:* \`${errandId}\``,
  ].join('\n');

  await sendTelegram(text);
}
