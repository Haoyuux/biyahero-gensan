import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

// Polyfill WebCrypto so Supabase PKCE uses SHA-256 instead of plain
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
  (global as any).crypto = {
    getRandomValues: (array: Uint8Array) => {
      const bytes = Crypto.getRandomBytes(array.length);
      array.set(bytes);
      return array;
    },
    subtle: {
      digest: async (_algorithm: string, data: ArrayBuffer) => {
        const base64 = Buffer.from(data).toString('base64');
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          base64,
          { encoding: Crypto.CryptoEncoding.BASE64 },
        );
        const binary = atob(hash);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      },
    },
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing. Check .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export type UserRole = 'super_admin' | 'admin' | 'team_leader' | 'rider' | 'user';
export type RiderStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  onboarded: boolean;
  profile_completed: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  rider_status: RiderStatus | null;
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_type: string | null;
  vehicle_image_url: string | null;
  sex: string | null;
  birthday: string | null;
  expo_push_token: string | null;
}
