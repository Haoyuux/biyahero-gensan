import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import {
  Car, Bike, CreditCard, Menu, User, Clock, Star,
  ChevronLeft, Search, Phone, MessageSquare, MoreHorizontal,
  Home, Briefcase, ThumbsUp, X, Send, Bell, Shield, Users, Activity,
  BarChart, TrendingUp, CheckCircle, LogOut, MapPin, Navigation,
  DollarSign, Settings, Camera, Calendar, Phone as PhoneIcon, Edit3,
  FileText, Upload, AlertCircle, Eye
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Session } from '@supabase/supabase-js';
import { supabase, signInWithGoogle, signOut, getProfile, updateProfile, uploadImage, getRiderProfiles, setRiderStatus, type Profile, type RiderStatus } from '@/src/lib/supabase';
import { calculateFare, loadPricingConfig, savePricingConfig, DEFAULT_PRICING, type PricingConfig, type FareBreakdown } from '@/src/lib/fareService';
import { sendMessage, fetchMessages, subscribeToMessages, fetchUserConversations, fetchRiderConversations, deleteConversation, type ChatMessage, type ConversationSummary } from '@/src/lib/chatService';
import { requestNotificationPermission, pushNotification } from '@/src/lib/notificationService';

// localStorage keys for persisting active ride state across refresh / disconnects
const USER_RIDE_KEY  = 'fetch_user_ride';
const RIDER_RIDE_KEY = 'fetch_rider_ride';

interface FavoritePlace {
  id: string;
  name: string;
  label: string;
  coords: [number, number];
}
const FAVORITES_KEY = 'fetch_favorites';

// Safe unique-ID that works in both HTTPS and plain HTTP dev environments.
// genId() is only available in secure contexts (HTTPS / localhost).
const genId = () =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// ─── Map Icons ───────────────────────────────────────────────────────────────

const currentLocationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-5 h-5 bg-blue-500 border-4 border-white rounded-full shadow-md"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});

const destinationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-6 h-6 bg-emerald-500 border-4 border-white rounded-full shadow-md flex items-center justify-center"><div class="w-1.5 h-1.5 bg-white rounded-full"></div></div>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});

const riderIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-6 h-6 bg-blue-600 border-4 border-white rounded-full shadow-lg flex items-center justify-center"><div class="w-1.5 h-1.5 bg-white rounded-full"></div></div>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});

const pickupIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-6 h-6 bg-orange-500 border-4 border-white rounded-full shadow-lg flex items-center justify-center"><div class="w-1.5 h-1.5 bg-white rounded-full"></div></div>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});

const draggablePickupIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="position:relative;cursor:grab"><div style="width:28px;height:28px;background:#3b82f6;border:4px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center"><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M13 6V11H18V8.75L21.25 12L18 15.25V13H13V18H15.25L12 21.25L8.75 18H11V13H6V15.25L2.75 12L6 8.75V11H11V6H8.75L12 2.75L15.25 6H13Z"/></svg></div></div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

const draggableDestIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="position:relative;cursor:grab"><div style="width:28px;height:28px;background:#10b981;border:4px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center"><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M13 6V11H18V8.75L21.25 12L18 15.25V13H13V18H15.25L12 21.25L8.75 18H11V13H6V15.25L2.75 12L6 8.75V11H11V6H8.75L12 2.75L15.25 6H13Z"/></svg></div></div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const d = await r.json();
    const parts = (d.display_name as string)?.split(',');
    return parts ? parts.slice(0, 2).join(', ').trim() : 'Pinned location';
  } catch {
    return 'Pinned location';
  }
}

const RIDE_OPTIONS = [
  { id: 'moto', name: 'Motorcycle', time: '2 min', price: 45, icon: Bike, capacity: 1 },
  { id: 'eco',  name: 'Economy Car', time: '4 min', price: 120, icon: Car, capacity: 4 },
  { id: 'premium', name: 'Premium Car', time: '6 min', price: 250, icon: Car, capacity: 4 },
];

function MapBounds({ start, routeCoords, step }: { start: [number, number], routeCoords: [number, number][] | null, step: string }) {
  const map = useMap();
  useEffect(() => {
    if (routeCoords && routeCoords.length > 0 && step !== 'home') {
      map.fitBounds(L.latLngBounds(routeCoords), { padding: [50, 50], animate: true });
    } else if (step === 'home') {
      map.setView(start, 15, { animate: true });
    }
  }, [map, start, routeCoords, step]);
  return null;
}

// ─── Root Auth Shell ──────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        getProfile(session.user.id).then(p => { setProfile(p); setAuthLoading(false); });
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getProfile(session.user.id).then(setProfile);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading || (session && !profile)) return <SplashScreen />;
  if (!session || !profile) return <LoginScreen />;
  if (!profile.onboarded) return <OnboardingScreen profile={profile} onComplete={setProfile} />;
  if (!profile.profile_completed && (profile.role === 'user' || profile.role === 'rider'))
    return <ProfileSetupScreen profile={profile} onComplete={setProfile} />;
  if (profile.role === 'rider') return <RiderDashboard profile={profile} />;
  if (profile.role === 'admin') return <AdminDashboard profile={profile} isSuperAdmin={false} />;
  if (profile.role === 'super_admin') return <AdminDashboard profile={profile} isSuperAdmin={true} />;
  return <UserApp profile={profile} />;
}

// ─── Splash Screen ────────────────────────────────────────────────────────────

const SplashScreen = () => (
  <div className="w-full h-[100dvh] bg-[#080808] flex flex-col items-center justify-center font-sans">
    <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mb-8">
      <Car size={22} className="text-white" />
    </div>
    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);

// ─── Login Screen ─────────────────────────────────────────────────────────────

const LoginScreen = () => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="relative w-full h-[100dvh] bg-[#080808] flex flex-col items-center justify-center font-sans overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(16,185,129,0.07),transparent)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center px-8 w-full max-w-[320px]"
      >
        <div className="mb-14 text-center">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mb-10 mx-auto">
            <Car size={22} className="text-white" />
          </div>
          <h1 className="text-[3.25rem] font-black text-white tracking-tight leading-none mb-3">Fetch</h1>
          <p className="text-gray-500 text-sm font-medium tracking-wide">Your ride, on demand</p>
        </div>

        <button
          onClick={async () => { setLoading(true); await signInWithGoogle(); setLoading(false); }}
          disabled={loading}
          className="w-full bg-white text-[#080808] font-semibold py-[15px] px-6 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] disabled:opacity-50"
        >
          {loading ? (
            <div className="w-4 h-4 border-[2px] border-gray-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span className="text-[15px]">{loading ? 'Signing in…' : 'Continue with Google'}</span>
        </button>

        <p className="text-gray-700 text-[11px] mt-7 text-center leading-relaxed">
          By continuing you agree to our Terms &amp; Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
};

// ─── Onboarding Screen ────────────────────────────────────────────────────────

const OnboardingScreen = ({ profile, onComplete }: { profile: Profile, onComplete: (p: Profile) => void }) => {
  const [loading, setLoading] = useState<'rider' | 'user' | null>(null);

  const handleSelect = async (role: 'rider' | 'user') => {
    setLoading(role);
    const updated = await updateProfile(profile.id, { role, onboarded: true });
    if (updated) onComplete(updated);
    setLoading(null);
  };

  return (
    <div className="w-full min-h-[100dvh] bg-white flex flex-col items-center justify-center font-sans px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-[360px]"
      >
        <div className="mb-10">
          <p className="text-xs font-semibold text-emerald-600 tracking-widest uppercase mb-4">Welcome to Fetch</p>
          <h1 className="text-[2rem] font-black text-gray-950 tracking-tight leading-tight mb-2">
            Hey {profile.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-gray-400 text-[15px]">How will you be using the app?</p>
        </div>

        <div className="space-y-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('user')}
            disabled={!!loading}
            className="w-full bg-gray-950 text-white rounded-2xl p-5 text-left flex items-center gap-4 hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 group"
          >
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
              <MapPin size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-[15px] leading-tight">I'm a Passenger</p>
              <p className="text-gray-400 text-xs mt-0.5">Book rides around the city</p>
            </div>
            {loading === 'user'
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
              : <ChevronLeft size={16} className="text-gray-500 rotate-180 shrink-0" />}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('rider')}
            disabled={!!loading}
            className="w-full bg-white border border-gray-100 shadow-sm text-gray-900 rounded-2xl p-5 text-left flex items-center gap-4 hover:border-gray-200 hover:shadow-md transition-all duration-150 disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
              <Navigation size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-[15px] leading-tight">I'm a Driver</p>
              <p className="text-gray-400 text-xs mt-0.5">Accept trips and earn money</p>
            </div>
            {loading === 'rider'
              ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
              : <ChevronLeft size={16} className="text-gray-300 rotate-180 shrink-0" />}
          </motion.button>
        </div>

        <p className="text-center text-[11px] text-gray-300 mt-8">Contact support to change your role later.</p>
      </motion.div>
    </div>
  );
};

// ─── Profile Setup Screen ────────────────────────────────────────────────────

const ProfileSetupScreen = ({ profile, onComplete }: { profile: Profile, onComplete: (p: Profile) => void }) => {
  const [firstName, setFirstName] = useState(profile.first_name || '');
  const [lastName, setLastName] = useState(profile.last_name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [birthday, setBirthday] = useState(profile.birthday || '');
  const [sex, setSex] = useState(profile.sex || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(profile.cover_photo_url || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'avatar') setAvatarUploading(true);
    else setCoverUploading(true);

    const url = await uploadImage(type === 'avatar' ? 'avatars' : 'covers', profile.id, file);
    if (url) {
      if (type === 'avatar') setAvatarUrl(url);
      else setCoverUrl(url);
    }
    if (type === 'avatar') setAvatarUploading(false);
    else setCoverUploading(false);
  };

  const handleSave = async () => {
    if (!firstName.trim()) { setError('First name is required.'); return; }
    if (!lastName.trim()) { setError('Last name is required.'); return; }
    if (!phone.trim()) { setError('Phone number is required.'); return; }
    if (!birthday) { setError('Birthday is required.'); return; }
    if (!sex) { setError('Please select your sex.'); return; }

    setSaving(true);
    setError('');
    const updated = await updateProfile(profile.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim(),
      birthday,
      sex,
      avatar_url: avatarUrl || profile.avatar_url,
      cover_photo_url: coverUrl || null,
      profile_completed: true,
    });
    setSaving(false);
    if (updated) onComplete(updated);
    else setError('Failed to save. Please try again.');
  };

  return (
    <div className="w-full min-h-[100dvh] bg-gray-100 font-sans overflow-y-auto">
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-[100dvh] md:shadow-xl">
      {/* Cover Photo */}
      <div className="relative h-48 bg-gradient-to-br from-emerald-400 to-emerald-600 overflow-hidden">
        {coverUrl && <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />}
        <label className="absolute inset-0 flex items-center justify-center cursor-pointer group">
          <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
          <div className="bg-black/40 group-hover:bg-black/60 transition-colors rounded-xl px-4 py-2 flex items-center gap-2 text-white text-sm font-bold">
            {coverUploading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Camera size={16} />}
            {coverUrl ? 'Change Cover Photo' : 'Add Cover Photo'}
          </div>
        </label>
      </div>

      {/* Profile Picture */}
      <div className="px-6 pb-6">
        <div className="relative -mt-14 mb-4 w-28 h-28">
          <div className="w-28 h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-200">
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><User size={40} className="text-gray-400" /></div>}
          </div>
          <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-emerald-600 transition-colors">
            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'avatar')} />
            {avatarUploading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Camera size={14} className="text-white" />}
          </label>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Complete Your Profile</h1>
          <p className="text-gray-500 text-sm font-medium mt-1">Fill in your details before you start booking rides.</p>
        </div>

        {/* Form */}
        <div className="space-y-4 max-w-lg">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">First Name *</label>
              <input
                value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="Juan"
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Last Name *</label>
              <input
                value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="Dela Cruz"
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Phone Number *</label>
            <div className="relative">
              <PhoneIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+63 917 123 4567"
                type="tel"
                className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Birthday */}
          <div>
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Birthday *</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={birthday} onChange={e => setBirthday(e.target.value)}
                type="date"
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Sex */}
          <div>
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Sex *</label>
            <div className="grid grid-cols-3 gap-2">
              {['Male', 'Female', 'Prefer not to say'].map(option => (
                <button
                  key={option} type="button"
                  onClick={() => setSex(option)}
                  className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all ${sex === option ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'}`}
                >
                  {option === 'Prefer not to say' ? 'Prefer not' : option}
                </button>
              ))}
            </div>
          </div>

          {/* Email (read only) */}
          <div>
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Email</label>
            <input
              value={profile.email} readOnly
              className="w-full bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-400 outline-none cursor-not-allowed"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave} disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-emerald-500/30 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {saving
              ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              : 'Save & Continue'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

// ─── User Profile Screen ─────────────────────────────────────────────────────

const UserProfileScreen = ({ profile, onBack, onUpdate }: { profile: Profile, onBack: () => void, onUpdate: (p: Profile) => void }) => {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name || '');
  const [lastName, setLastName] = useState(profile.last_name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [birthday, setBirthday] = useState(profile.birthday || '');
  const [sex, setSex] = useState(profile.sex || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(profile.cover_photo_url || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'avatar') setAvatarUploading(true); else setCoverUploading(true);
    const url = await uploadImage(type === 'avatar' ? 'avatars' : 'covers', profile.id, file);
    if (url) { if (type === 'avatar') setAvatarUrl(url); else setCoverUrl(url); }
    if (type === 'avatar') setAvatarUploading(false); else setCoverUploading(false);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !birthday || !sex) {
      setError('All fields are required.'); return;
    }
    setSaving(true); setError('');
    const updated = await updateProfile(profile.id, {
      first_name: firstName.trim(), last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim(), birthday, sex,
      avatar_url: avatarUrl || profile.avatar_url,
      cover_photo_url: coverUrl || null,
    });
    setSaving(false);
    if (updated) { onUpdate(updated); setEditing(false); }
    else setError('Failed to save. Please try again.');
  };

  const handleCancel = () => {
    setFirstName(profile.first_name || '');
    setLastName(profile.last_name || '');
    setPhone(profile.phone || '');
    setBirthday(profile.birthday || '');
    setSex(profile.sex || '');
    setAvatarUrl(profile.avatar_url || '');
    setCoverUrl(profile.cover_photo_url || '');
    setError('');
    setEditing(false);
  };

  const formatBirthday = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 240 }}
      className="w-full min-h-[100dvh] bg-gray-100 font-sans overflow-y-auto"
    >
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-[100dvh] md:shadow-xl">
      {/* Cover Photo */}
      <div className="relative h-52 bg-gradient-to-br from-emerald-400 to-emerald-600 overflow-hidden">
        {coverUrl && <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />}
        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute top-5 left-5 w-10 h-10 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
        {/* Edit / Sign out */}
        <div className="absolute top-5 right-5 flex items-center gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="bg-black/30 hover:bg-black/50 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Edit3 size={13} /> Edit Profile
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="bg-black/30 hover:bg-red-500/70 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
        {/* Cover photo upload in edit mode */}
        {editing && (
          <label className="absolute inset-0 flex items-center justify-center cursor-pointer group">
            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
            <div className="bg-black/40 group-hover:bg-black/60 transition-colors rounded-xl px-4 py-2 flex items-center gap-2 text-white text-sm font-bold">
              {coverUploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={16} />}
              {coverUrl ? 'Change Cover' : 'Add Cover Photo'}
            </div>
          </label>
        )}
      </div>

      {/* Profile Picture + Info */}
      <div className="px-5 pb-10">
        <div className="flex items-end justify-between -mt-14 mb-4">
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-200">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><User size={40} className="text-gray-400" /></div>}
            </div>
            {editing && (
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-emerald-600 transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'avatar')} />
                {avatarUploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={14} className="text-white" />}
              </label>
            )}
          </div>
        </div>

        {/* Name + role badge */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">
            {profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.full_name || 'User'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-500 text-sm font-medium">{profile.email}</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full uppercase">{profile.role}</span>
          </div>
        </div>

        {/* View Mode */}
        {!editing ? (
          <div className="space-y-3 max-w-lg">
            {[
              { label: 'First Name', value: profile.first_name },
              { label: 'Last Name', value: profile.last_name },
              { label: 'Phone', value: profile.phone },
              { label: 'Birthday', value: formatBirthday(profile.birthday || '') },
              { label: 'Sex', value: profile.sex },
              { label: 'Email', value: profile.email },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="font-bold text-gray-800">{value || '—'}</p>
              </div>
            ))}
          </div>
        ) : (
          /* Edit Mode */
          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">First Name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan"
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Last Name *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Dela Cruz"
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Phone *</label>
              <div className="relative">
                <PhoneIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+63 917 123 4567" type="tel"
                  className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Birthday *</label>
              <div className="relative">
                <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={birthday} onChange={e => setBirthday(e.target.value)} type="date"
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Sex *</label>
              <div className="grid grid-cols-3 gap-2">
                {['Male', 'Female', 'Prefer not to say'].map(option => (
                  <button key={option} type="button" onClick={() => setSex(option)}
                    className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all ${sex === option ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'}`}>
                    {option === 'Prefer not to say' ? 'Prefer not' : option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Email</label>
              <input value={profile.email} readOnly
                className="w-full bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-400 outline-none cursor-not-allowed" />
            </div>
            {error && <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm font-medium text-red-600">{error}</div>}
            <div className="flex gap-3 pt-2">
              <button onClick={handleCancel} className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-emerald-500/30 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </motion.div>
  );
};

// ─── In-App Notification Bell ─────────────────────────────────────────────────

interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: number; // Date.now()
  read: boolean;
}

const NotificationsPanel = ({
  notifications,
  onClose,
  onClear,
}: {
  notifications: AppNotification[];
  onClose: () => void;
  onClear: () => void;
}) => {
  const fmt = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col font-sans">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-black text-gray-900">Notifications</h2>
          <p className="text-xs text-gray-400 font-medium">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</p>
        </div>
        {notifications.length > 0 && (
          <button onClick={onClear} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-50 transition-colors">
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 px-8 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <Bell size={36} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-semibold">No notifications yet</p>
            <p className="text-gray-400 text-sm">Ride updates will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map(n => (
              <div key={n.id} className={`px-4 py-4 flex items-start gap-3 ${n.read ? 'bg-white' : 'bg-emerald-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.read ? 'bg-gray-100' : 'bg-emerald-100'}`}>
                  <Bell size={18} className={n.read ? 'text-gray-400' : 'text-emerald-600'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{n.title}</p>
                  <p className="text-gray-500 text-sm font-medium mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-400 font-medium mt-1">{fmt(n.time)}</p>
                </div>
                {!n.read && <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Connection Status ────────────────────────────────────────────────────────

/**
 * Tracks network connectivity and returns:
 * - `connectionState`: 'online' | 'offline' | 'reconnecting'
 * - `reconnectTick`: increments every time the network fully recovers — use as
 *   a useEffect dependency to re-subscribe Supabase channels on reconnect.
 */
function useConnectionStatus() {
  const [connectionState, setConnectionState] = useState<'online' | 'offline' | 'reconnecting'>(
    () => (navigator.onLine ? 'online' : 'offline'),
  );
  const [reconnectTick, setReconnectTick] = useState(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConnectionState('offline');
    };

    const handleOnline = () => {
      setConnectionState('reconnecting');
      timerRef.current = setTimeout(() => {
        setConnectionState('online');
        setReconnectTick(t => t + 1);
      }, 1500);
    };

    // Re-check when tab becomes visible again (handles sleep / tab switching)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        setReconnectTick(t => t + 1);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return { connectionState, reconnectTick };
}

const ConnectionBanner = ({ state }: { state: 'online' | 'offline' | 'reconnecting' }) => {
  const [visible, setVisible] = useState(false);
  const prevState = React.useRef<string>('online');

  useEffect(() => {
    if (state === 'offline' || state === 'reconnecting') {
      setVisible(true);
    } else if (state === 'online' && prevState.current !== 'online') {
      // Just recovered — show "Back online" briefly then hide
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      prevState.current = state;
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
    prevState.current = state;
  }, [state]);

  if (!visible) return null;

  const cfg = {
    offline:      { bg: 'bg-red-500',     label: 'No internet connection',   spin: false },
    reconnecting: { bg: 'bg-amber-500',   label: 'Reconnecting…',            spin: true  },
    online:       { bg: 'bg-emerald-500', label: 'Back online',              spin: false },
  }[state];

  return (
    <motion.div
      key={state}
      initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className={`fixed top-0 inset-x-0 z-[9999] ${cfg.bg} text-white text-sm font-bold flex items-center justify-center gap-2 py-2.5 px-4 shadow-lg`}
    >
      {cfg.spin
        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
        : <div className={`w-2 h-2 rounded-full ${state === 'offline' ? 'bg-red-300' : 'bg-white'}`} />}
      <span>{cfg.label}</span>
    </motion.div>
  );
};

// ─── User App (Ridebooking) ───────────────────────────────────────────────────

const UserApp = ({ profile: initialProfile }: { profile: Profile }) => {
  const [currentProfile, setCurrentProfile] = useState<Profile>(initialProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [step, setStep] = useState<'home' | 'select' | 'searching' | 'matched' | 'review'>('home');
  const [completedRider, setCompletedRider] = useState<any>(null);
  const [pickup, setPickup] = useState('Current Location');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [selectedRide, setSelectedRide] = useState('eco');
  const [deviceLocation, setDeviceLocation] = useState<[number, number] | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: number } | null>(null);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [activeRider, setActiveRider] = useState<any>(null);
  const [pricingConfig] = useState<PricingConfig>(() => loadPricingConfig());
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showRideHistory, setShowRideHistory] = useState(false);
  const [favorites, setFavorites] = useState<FavoritePlace[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [riderLocation, setRiderLocation] = useState<[number, number] | null>(null);
  // Ref keeps latest ride data accessible in stale closures inside channel useEffect
  const completionDataRef = React.useRef({ pickup: '', dropoff: '', fareBreakdown: null as FareBreakdown | null, selectedRide: 'eco', activeRider: null as any });

  // Keep completion ref in sync every render (avoids stale closures in channel useEffect)
  completionDataRef.current = { pickup, dropoff, fareBreakdown, selectedRide, activeRider };

  const { connectionState, reconnectTick } = useConnectionStatus();
  const wasOfflineRef = React.useRef(false);

  useEffect(() => { requestNotificationPermission(); }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const pushAppNotification = (title: string, body: string) => {
    setAppNotifications(prev => [{ id: genId(), title, body, time: Date.now(), read: false }, ...prev]);
  };

  const saveFavorite = (place: FavoritePlace) => {
    setFavorites(prev => {
      if (prev.some(f => f.label === place.label)) return prev;
      const next = [...prev, place];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const removeFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.filter(f => f.id !== id);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Active-ride persistence (survives refresh / internet loss) ──────────────
  // Restore on mount — batched setState so there's no partial-render flash
  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_RIDE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s.currentRideId) return;
      setCurrentRideId(s.currentRideId);
      setStep(s.step || 'searching');
      if (s.pickup)             setPickup(s.pickup);
      if (s.pickupCoords)       setPickupCoords(s.pickupCoords);
      if (s.dropoff)            setDropoff(s.dropoff);
      if (s.destinationCoords)  setDestinationCoords(s.destinationCoords);
      if (s.selectedRide)       setSelectedRide(s.selectedRide);
      if (s.fareBreakdown)      setFareBreakdown(s.fareBreakdown);
      if (s.activeRider)        setActiveRider(s.activeRider);
      showNotification('Resumed your active booking');
    } catch { /* ignore malformed data */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // Save whenever the active-ride state changes.
  // When the user navigates back to 'home' while a ride is active, preserve the booking
  // by saving the *effective* step (matched / searching) so restore works correctly.
  useEffect(() => {
    if (!currentRideId || step === 'review') {
      localStorage.removeItem(USER_RIDE_KEY);
      return;
    }
    // If somehow at 'home' with an active ride, derive the real step from state
    const effectiveStep = step === 'home'
      ? (activeRider ? 'matched' : 'searching')
      : step;
    try {
      localStorage.setItem(USER_RIDE_KEY, JSON.stringify({
        currentRideId, step: effectiveStep, pickup, pickupCoords,
        dropoff, destinationCoords, selectedRide, fareBreakdown, activeRider,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [currentRideId, step, pickup, pickupCoords, dropoff, destinationCoords, selectedRide, fareBreakdown, activeRider]);


  // Track offline state and notify on recovery
  useEffect(() => {
    if (connectionState === 'offline') {
      wasOfflineRef.current = true;
    }
  }, [connectionState]);

  useEffect(() => {
    if (reconnectTick > 0 && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      pushAppNotification('Back online ✓', 'Connection restored. Ride updates are live again.');
    }
  }, [reconnectTick]);

  const handleCancelBooking = (broadcast = false) => {
    if (broadcast && currentRideId) {
       supabase.channel('rides').send({ type: 'broadcast', event: 'CANCEL_RIDE', payload: { rideId: currentRideId } });
       // Mark ride as cancelled in DB so riders coming online don't see it
       supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRideId).eq('status', 'pending');
    }
    localStorage.removeItem(USER_RIDE_KEY);
    setStep('home');
    setPickup('Current Location');
    setPickupCoords(null);
    setDropoff('');
    setDestinationCoords(null);
    setCurrentRideId(null);
    setActiveRider(null);
    setCompletedRider(null);
    setFareBreakdown(null);
    setRiderLocation(null);
  };

  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setDeviceLocation([pos.coords.latitude, pos.coords.longitude]),
        () => setDeviceLocation([14.5547, 121.0244]),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setDeviceLocation([14.5547, 121.0244]);
    }
  }, []);

  const startLoc = pickupCoords || deviceLocation;
  const endLoc = destinationCoords;

  useEffect(() => {
    const channel = supabase.channel('rides');
    
    channel.on('broadcast', { event: 'RIDE_ACCEPTED' }, (payload) => {
      if (payload.payload.rideId === currentRideId) {
        setActiveRider(payload.payload.rider);
        setStep('matched');
        showNotification('Rider accepted your booking!');
        pushNotification('Rider on the way 🛵', 'Your rider accepted the booking and is heading to you.');
        pushAppNotification('Rider on the way 🛵', 'Your rider accepted the booking and is heading to you.');
      }
    });

    channel.on('broadcast', { event: 'RIDER_ARRIVED' }, (payload) => {
      if (payload.payload.rideId === currentRideId) {
        showNotification('Your rider has arrived at the pickup location!');
        pushNotification('Rider arrived 📍', 'Your rider is now at the pickup location.');
        pushAppNotification('Rider arrived 📍', 'Your rider is now at the pickup location.');
      }
    });

    channel.on('broadcast', { event: 'RIDER_LOCATION' }, (payload) => {
      if (payload.payload.rideId === currentRideId) {
        setRiderLocation([payload.payload.lat, payload.payload.lng]);
      }
    });

    channel.on('broadcast', { event: 'RIDE_COMPLETED' }, async (payload) => {
      if (payload.payload.rideId === currentRideId) {
        const d = completionDataRef.current;
        const rider = d.activeRider;
        // Persist to ride history
        await supabase.from('rides').upsert({
          id: currentRideId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          rider_id: rider?.id ?? null,
          rider_name: rider ? `${rider.first_name || ''} ${rider.last_name || ''}`.trim() || null : null,
          rider_avatar: rider?.avatar_url ?? null,
          vehicle_info: rider ? `${rider.vehicle_make || ''} ${rider.vehicle_model || ''} • ${rider.vehicle_plate || ''}`.trim() : null,
          pickup_label: d.pickup,
          dropoff_label: d.dropoff,
          fare: d.fareBreakdown?.totalFare ?? 0,
          fare_breakdown: d.fareBreakdown,
          ride_type: d.selectedRide,
          status: 'completed',
          completed_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        pushNotification('Ride completed ✅', 'Hope you had a great ride! Please rate your experience.');
        pushAppNotification('Ride completed ✅', 'Hope you had a great ride! Please rate your experience.');
        localStorage.removeItem(USER_RIDE_KEY);
        setCompletedRider(rider);
        setStep('review');
      }
    });

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  // reconnectTick forces channel teardown+recreate on network recovery
  }, [currentRideId, reconnectTick]);

  useEffect(() => {
    if (startLoc && endLoc) {
      fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc[1]},${startLoc[0]};${endLoc[1]},${endLoc[0]}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(data => {
          if (data.routes?.length > 0) {
            setRouteCoords(data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]));
            setRouteInfo({ distance: data.routes[0].distance, duration: data.routes[0].duration });
          } else {
            setRouteCoords([startLoc, endLoc]);
            setRouteInfo(null);
          }
        })
        .catch(() => { setRouteCoords([startLoc, endLoc]); setRouteInfo(null); });
    } else {
      setRouteCoords(null);
      setRouteInfo(null);
    }
  }, [startLoc, endLoc, step]);

  if (!startLoc) return <SplashScreen />;

  if (showProfile) {
    return (
      <UserProfileScreen
        profile={currentProfile}
        onBack={() => setShowProfile(false)}
        onUpdate={setCurrentProfile}
      />
    );
  }

  if (showChatHistory) {
    return (
      <ChatHistoryScreen
        userId={currentProfile.id}
        userName={currentProfile.first_name || currentProfile.full_name || 'User'}
        onBack={() => setShowChatHistory(false)}
      />
    );
  }

  if (showNotifications) {
    return (
      <NotificationsPanel
        notifications={appNotifications}
        onClose={() => {
          setShowNotifications(false);
          setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
        }}
        onClear={() => setAppNotifications([])}
      />
    );
  }

  if (showRideHistory) {
    return (
      <RideHistoryScreen
        userId={currentProfile.id}
        onBack={() => setShowRideHistory(false)}
      />
    );
  }

  return (
    <div className="w-full h-[100dvh] overflow-hidden flex flex-col md:flex-row font-sans text-gray-900">
      <ConnectionBanner state={connectionState} />
      <NotificationToast message={notification} />

      {/* ── Floating nav — mobile only, overlays the map ── */}
      <div className="absolute top-0 inset-x-0 z-30 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex justify-between items-center pointer-events-none md:hidden">
        <div className="flex items-center gap-2">
          {step === 'home' ? (
            <button className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto">
              <Menu size={22} />
            </button>
          ) : step === 'matched' ? (
            <button onClick={() => setStep('home')} className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto">
              <ChevronLeft size={22} />
            </button>
          ) : (
            <button onClick={() => handleCancelBooking(step === 'searching')} className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto">
              <ChevronLeft size={22} />
            </button>
          )}
          <button onClick={() => setShowChatHistory(true)} className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto relative">
            <MessageSquare size={20} />
          </button>
          {step === 'home' && (
            <button onClick={() => setShowRideHistory(true)} className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto">
              <Clock size={20} />
            </button>
          )}
          <button
            onClick={() => { setShowNotifications(true); setAppNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
            className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto relative"
          >
            <Bell size={20} />
            {appNotifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-black flex items-center justify-center leading-none">
                {appNotifications.filter(n => !n.read).length > 9 ? '9+' : appNotifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={() => setShowProfile(true)}
          className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden border-2 border-white cursor-pointer hover:scale-105 transition-transform pointer-events-auto"
        >
          {currentProfile.avatar_url
            ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            : <User size={22} className="text-gray-600" />}
        </button>
      </div>

      {/* ── Sidebar — below map on mobile (flex-none), left panel on desktop ── */}
      <div className="
        flex flex-col flex-none order-2
        md:order-1 md:w-[420px] md:shrink-0
        md:bg-white md:shadow-[4px_0_24px_rgba(0,0,0,0.1)] md:z-20 md:overflow-hidden
      ">
        {/* Desktop nav header — hidden on mobile (floating nav used instead) */}
        <div className="hidden md:flex flex-none border-b border-gray-100 bg-white p-4 justify-between items-center">
          <div className="flex items-center gap-2">
            {step === 'home' ? (
              <button className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full">
                <Menu size={22} />
              </button>
            ) : step === 'matched' ? (
              <button onClick={() => setStep('home')} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full">
                <ChevronLeft size={22} />
              </button>
            ) : (
              <button onClick={() => handleCancelBooking(step === 'searching')} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full">
                <ChevronLeft size={22} />
              </button>
            )}
            <button onClick={() => setShowChatHistory(true)} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full relative">
              <MessageSquare size={20} />
            </button>
            {step === 'home' && (
              <button onClick={() => setShowRideHistory(true)} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full">
                <Clock size={20} />
              </button>
            )}
            <button
              onClick={() => { setShowNotifications(true); setAppNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
              className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200 rounded-full relative"
            >
              <Bell size={20} />
              {appNotifications.filter(n => !n.read).length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-black flex items-center justify-center leading-none">
                  {appNotifications.filter(n => !n.read).length > 9 ? '9+' : appNotifications.filter(n => !n.read).length}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="w-11 h-11 flex items-center justify-center overflow-hidden border-2 border-white rounded-full cursor-pointer hover:scale-105 transition-transform"
          >
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <User size={22} className="text-gray-600" />}
          </button>
        </div>

        {/* Panel slot — natural height on mobile, fills sidebar on desktop */}
        <div className="relative md:flex-1 md:overflow-hidden md:flex md:flex-col">
          <AnimatePresence mode="wait">
            {step === 'home' && (
              <>
                {/* Ongoing-ride banner — blocks new booking and lets user jump back */}
                {currentRideId && (
                  <motion.div
                    key="ongoing-banner"
                    initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-[calc(100%+8px)] inset-x-4 z-10 pointer-events-auto md:relative md:bottom-auto md:inset-auto md:mx-0 md:mt-0"
                  >
                    <div className="bg-gray-950 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3.5 shadow-xl shadow-black/40">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[13px] leading-tight">Ongoing ride</p>
                        <p className="text-gray-400 text-[11px] font-medium truncate mt-0.5">
                          {activeRider ? `Driver: ${activeRider.first_name || 'Your rider'}` : 'Searching for a driver…'}
                        </p>
                      </div>
                      <button
                        onClick={() => setStep(activeRider ? 'matched' : 'searching')}
                        className="shrink-0 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-lg transition-colors"
                      >
                        View
                      </button>
                    </div>
                  </motion.div>
                )}
                <HomePanel key="home" setStep={(s) => {
                  if (s === 'select' && currentRideId) {
                    showNotification('You have an ongoing ride. Finish it before booking another.');
                    return;
                  }
                  setStep(s);
                }} pickup={pickup} setPickup={setPickup}
                  setPickupCoords={setPickupCoords} dropoff={dropoff} setDropoff={setDropoff}
                  setDestinationCoords={setDestinationCoords}
                  favorites={favorites} onSaveFavorite={saveFavorite} onRemoveFavorite={removeFavorite} />
              </>
            )}
            {step === 'select' && (
              <SelectPanel key="select" setStep={setStep} selectedRide={selectedRide}
                setSelectedRide={setSelectedRide} routeInfo={routeInfo} pricingConfig={pricingConfig}
                onBook={(rideId: string, breakdown: FareBreakdown) => {
                  if (currentRideId) {
                    showNotification('You have an ongoing ride. Finish it before booking another.');
                    return;
                  }
                  setStep('searching');
                  setCurrentRideId(rideId);
                  setFareBreakdown(breakdown);
                  const requestPayload = {
                    rideId,
                    user: currentProfile,
                    pickup: { label: pickup, coords: pickupCoords || deviceLocation },
                    dropoff: { label: dropoff, coords: destinationCoords },
                    fare: breakdown.totalFare,
                    fareBreakdown: breakdown,
                  };
                  // Persist pending ride so riders coming online later can see it
                  supabase.from('rides').insert({
                    id: rideId,
                    user_id: currentProfile.id,
                    user_name: `${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim() || currentProfile.full_name || null,
                    user_avatar: currentProfile.avatar_url ?? null,
                    status: 'pending',
                    pickup_label: pickup,
                    dropoff_label: dropoff,
                    fare: breakdown.totalFare,
                    fare_breakdown: breakdown,
                    ride_type: selectedRide,
                    request_data: requestPayload,
                  });
                  // Also broadcast for riders already online
                  supabase.channel('rides').send({
                    type: 'broadcast',
                    event: 'REQUEST_RIDE',
                    payload: requestPayload,
                  });
                }} />
            )}
            {step === 'searching' && <SearchingPanel key="search" />}
            {step === 'matched' && (
              <MatchedPanel key="matched" onCancel={() => handleCancelBooking(true)} activeRider={activeRider}
                selectedRide={selectedRide} routeInfo={routeInfo} showNotification={showNotification}
                fareBreakdown={fareBreakdown} pricingConfig={pricingConfig}
                rideId={currentRideId}
                userId={currentProfile.id}
                userName={currentProfile.first_name || currentProfile.full_name || 'User'} />
            )}
            {step === 'review' && (
              <RatingPanel key="review" rider={completedRider} rideId={currentRideId} onDone={() => { showNotification('Thanks for your feedback!'); handleCancelBooking(); }} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Map — flex-1 above panels on mobile, fills right on desktop */}
      <div className="flex-1 relative min-h-0 order-1 md:order-2">
        <MapContainer center={startLoc} zoom={15} zoomControl={false} className="absolute inset-0 w-full h-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <Marker
            position={startLoc}
            icon={(step === 'home' || step === 'select') ? draggablePickupIcon : currentLocationIcon}
            draggable={step === 'home' || step === 'select'}
            eventHandlers={{
              dragend: async (e) => {
                const { lat, lng } = e.target.getLatLng();
                setPickupCoords([lat, lng]);
                const name = await reverseGeocode(lat, lng);
                setPickup(name);
              }
            }}
          />
          {endLoc && (
            <>
              <Marker
                position={endLoc}
                icon={(step === 'home' || step === 'select') ? draggableDestIcon : destinationIcon}
                draggable={step === 'home' || step === 'select'}
                eventHandlers={{
                  dragend: async (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    setDestinationCoords([lat, lng]);
                    const name = await reverseGeocode(lat, lng);
                    setDropoff(name);
                  }
                }}
              />
              {routeCoords && <Polyline positions={routeCoords} color="#10b981" weight={5} />}
            </>
          )}
          {riderLocation && step === 'matched' && (
            <Marker position={riderLocation} icon={riderIcon} />
          )}
          <MapBounds start={startLoc} routeCoords={routeCoords} step={step} />
        </MapContainer>
        {(step === 'home' || step === 'select') && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center z-10 pointer-events-none">
            <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
              Drag pin to adjust {(step === 'select' || (step === 'home' && endLoc)) ? 'pickup or destination' : 'pickup location'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Rider Profile Screen ────────────────────────────────────────────────────

const RiderProfileScreen = ({ profile, onBack, onUpdate }: { profile: Profile, onBack: () => void, onUpdate: (p: Profile) => void }) => {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name || '');
  const [lastName, setLastName] = useState(profile.last_name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [birthday, setBirthday] = useState(profile.birthday || '');
  const [sex, setSex] = useState(profile.sex || '');
  const [vehicleType, setVehicleType] = useState(profile.vehicle_type || '');
  const [vehicleMake, setVehicleMake] = useState(profile.vehicle_make || '');
  const [vehicleModel, setVehicleModel] = useState(profile.vehicle_model || '');
  const [vehiclePlate, setVehiclePlate] = useState(profile.vehicle_plate || '');
  const [vehicleColor, setVehicleColor] = useState(profile.vehicle_color || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(profile.cover_photo_url || '');
  const [licenseUrl, setLicenseUrl] = useState(profile.drivers_license_url || '');
  const [orUrl, setOrUrl] = useState(profile.or_url || '');
  const [crUrl, setCrUrl] = useState(profile.cr_url || '');
  const [vehicleImageUrl, setVehicleImageUrl] = useState(profile.vehicle_image_url || '');
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(type);
    const bucket = (type === 'avatar' ? 'avatars' : type === 'cover' ? 'covers' : 'documents') as 'avatars' | 'covers' | 'documents';
    const url = await uploadImage(bucket, profile.id, file);
    if (url) {
      if (type === 'avatar') setAvatarUrl(url);
      else if (type === 'cover') setCoverUrl(url);
      else if (type === 'license') setLicenseUrl(url);
      else if (type === 'or') setOrUrl(url);
      else if (type === 'cr') setCrUrl(url);
      else if (type === 'vehicle') setVehicleImageUrl(url);
    }
    setUploading(null);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    const updated = await updateProfile(profile.id, {
      first_name: firstName.trim(), last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim(), birthday, sex,
      avatar_url: avatarUrl || profile.avatar_url,
      cover_photo_url: coverUrl || null,
      vehicle_type: vehicleType, vehicle_make: vehicleMake,
      vehicle_model: vehicleModel, vehicle_plate: vehiclePlate,
      vehicle_color: vehicleColor,
      drivers_license_url: licenseUrl || null,
      or_url: orUrl || null,
      cr_url: crUrl || null,
      vehicle_image_url: vehicleImageUrl || null,
    });
    setSaving(false);
    if (updated) { onUpdate(updated); setEditing(false); }
    else setError('Failed to save. Please try again.');
  };

  const handleSubmitForReview = async () => {
    if (!licenseUrl || !orUrl || !crUrl || !vehicleImageUrl) {
      setError("Please upload Driver's License, OR, CR, and Vehicle Photo before submitting."); return;
    }
    if (!vehicleMake || !vehicleModel || !vehiclePlate) {
      setError('Please fill in all vehicle information before submitting.'); return;
    }
    setSubmitting(true); setError('');
    const updated = await updateProfile(profile.id, {
      rider_status: 'pending',
      drivers_license_url: licenseUrl,
      or_url: orUrl,
      cr_url: crUrl,
      vehicle_image_url: vehicleImageUrl,
    });
    setSubmitting(false);
    if (updated) onUpdate(updated);
    else setError('Failed to submit. Please try again.');
  };

  const statusBadge: Record<string, { bg: string, text: string, label: string }> = {
    unsubmitted: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Not Submitted' },
    pending:     { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending Review' },
    approved:    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
    rejected:    { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  };
  const status = statusBadge[profile.rider_status] || statusBadge.unsubmitted;

  const DocUpload = ({ label, type, url }: { label: string, type: string, url: string }) => (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{label}</span>
        <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 cursor-pointer hover:text-emerald-700">
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleUpload(e, type)} />
          {uploading === type
            ? <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            : <Upload size={13} />}
          {url ? 'Replace' : 'Upload'}
        </label>
      </div>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={label} className="w-full max-h-40 object-contain bg-gray-100 hover:opacity-90 transition-opacity cursor-zoom-in" />
          </a>
        : <div className="px-4 py-8 flex flex-col items-center gap-2 text-gray-300">
            <FileText size={28} />
            <span className="text-xs font-medium text-gray-400">No file uploaded</span>
          </div>}
    </div>
  );

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 240 }}
      className="w-full min-h-[100dvh] bg-gray-100 font-sans overflow-y-auto"
    >
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-[100dvh] md:shadow-xl">
        {/* Cover */}
        <div className="relative h-48 bg-gradient-to-br from-emerald-500 to-emerald-700 overflow-hidden">
          {coverUrl && <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />}
          <button onClick={onBack} className="absolute top-5 left-5 w-10 h-10 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="absolute top-5 right-5 flex gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="bg-black/30 hover:bg-black/50 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors">
                <Edit3 size={13} /> Edit
              </button>
            )}
            <button onClick={() => signOut()} className="bg-black/30 hover:bg-red-500/70 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors">
              <LogOut size={13} /> Sign out
            </button>
          </div>
          {editing && (
            <label className="absolute inset-0 flex items-center justify-center cursor-pointer group">
              <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, 'cover')} />
              <div className="bg-black/40 group-hover:bg-black/60 transition-colors rounded-xl px-4 py-2 flex items-center gap-2 text-white text-sm font-bold">
                {uploading === 'cover' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={16} />}
                {coverUrl ? 'Change Cover' : 'Add Cover Photo'}
              </div>
            </label>
          )}
        </div>

        <div className="px-5 pb-10">
          {/* Avatar + status */}
          <div className="flex items-end justify-between -mt-14 mb-4">
            <div className="relative">
              <div className="w-28 h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-200">
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><User size={40} className="text-gray-400" /></div>}
              </div>
              {editing && (
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-emerald-600 transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, 'avatar')} />
                  {uploading === 'avatar' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={14} className="text-white" />}
                </label>
              )}
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-black ${status.bg} ${status.text}`}>{status.label}</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-black text-gray-900">{profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.full_name || 'Rider'}</h1>
            <p className="text-gray-500 text-sm font-medium mt-1">{profile.email}</p>
          </div>

          {!editing ? (
            <div className="space-y-5">
              {/* Personal Info */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Personal Information</h3>
                <div className="space-y-2">
                  {[
                    { label: 'First Name', value: profile.first_name },
                    { label: 'Last Name', value: profile.last_name },
                    { label: 'Phone', value: profile.phone },
                    { label: 'Birthday', value: profile.birthday ? new Date(profile.birthday + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null },
                    { label: 'Sex', value: profile.sex },
                    { label: 'Email', value: profile.email },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-2xl px-4 py-3 border border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black text-gray-400 uppercase tracking-wider">{label}</span>
                      <span className="font-bold text-gray-800 text-sm">{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Vehicle Info */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Vehicle Information</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Type', value: profile.vehicle_type },
                    { label: 'Make / Brand', value: profile.vehicle_make },
                    { label: 'Model', value: profile.vehicle_model },
                    { label: 'Plate Number', value: profile.vehicle_plate },
                    { label: 'Color', value: profile.vehicle_color },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-2xl px-4 py-3 border border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black text-gray-400 uppercase tracking-wider">{label}</span>
                      <span className="font-bold text-gray-800 text-sm">{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Documents */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
                <div className="space-y-3">
                  <DocUpload label="Driver's License" type="license" url={licenseUrl} />
                  <DocUpload label="OR (Official Receipt)" type="or" url={orUrl} />
                  <DocUpload label="CR (Certificate of Registration)" type="cr" url={crUrl} />
                  <DocUpload label="Vehicle Photo" type="vehicle" url={vehicleImageUrl} />
                </div>
              </div>
              {/* Submit */}
              {profile.rider_status === 'unsubmitted' || profile.rider_status === 'rejected' ? (
                <div className="pt-2">
                  {error && <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm font-medium text-red-600 mb-3">{error}</div>}
                  <button
                    onClick={handleSubmitForReview} disabled={submitting}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-emerald-500/30 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={18} />}
                    {profile.rider_status === 'rejected' ? 'Resubmit for Review' : 'Submit for Verification'}
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-2">Upload all 4 documents and fill vehicle info before submitting.</p>
                </div>
              ) : profile.rider_status === 'pending' ? (
                <div className="bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-4 text-center">
                  <p className="text-yellow-700 font-bold text-sm">Your documents are under review by our team.</p>
                  <p className="text-yellow-600 text-xs mt-1">You'll be notified once approved.</p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-4 text-center">
                  <CheckCircle size={20} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-emerald-700 font-bold text-sm">Your account is verified and approved!</p>
                  {profile.reviewed_at && (
                    <p className="text-emerald-600 text-xs mt-1">
                      {new Date(profile.reviewed_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Edit Mode */
            <div className="space-y-5">
              {/* Personal fields */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Personal Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">First Name</label>
                      <input value={firstName} onChange={e => setFirstName(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">Last Name</label>
                      <input value={lastName} onChange={e => setLastName(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                    </div>
                  </div>
                  <div className="relative">
                    <PhoneIcon size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" type="tel"
                      className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                  </div>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={birthday} onChange={e => setBirthday(e.target.value)} type="date" max={new Date().toISOString().split('T')[0]}
                      className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['Male', 'Female', 'Prefer not to say'].map(o => (
                      <button key={o} type="button" onClick={() => setSex(o)}
                        className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all ${sex === o ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                        {o === 'Prefer not to say' ? 'Prefer not' : o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Vehicle fields */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Vehicle Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {['Motorcycle', 'Car'].map(t => (
                      <button key={t} type="button" onClick={() => setVehicleType(t)}
                        className={`py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 ${vehicleType === t ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                        {t === 'Motorcycle' ? <Bike size={16} /> : <Car size={16} />} {t}
                      </button>
                    ))}
                  </div>
                  {[
                    { label: 'Make / Brand', value: vehicleMake, set: setVehicleMake, placeholder: 'e.g. Toyota' },
                    { label: 'Model', value: vehicleModel, set: setVehicleModel, placeholder: 'e.g. Vios' },
                    { label: 'Plate Number', value: vehiclePlate, set: setVehiclePlate, placeholder: 'e.g. ABC 1234' },
                    { label: 'Color', value: vehicleColor, set: setVehicleColor, placeholder: 'e.g. White' },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5 block">{label}</label>
                      <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                        className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Docs in edit mode */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
                <div className="space-y-3">
                  <DocUpload label="Driver's License" type="license" url={licenseUrl} />
                  <DocUpload label="OR (Official Receipt)" type="or" url={orUrl} />
                  <DocUpload label="CR (Certificate of Registration)" type="cr" url={crUrl} />
                  <DocUpload label="Vehicle Photo" type="vehicle" url={vehicleImageUrl} />
                </div>
              </div>
              {error && <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm font-medium text-red-600">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setEditing(false); setError(''); }}
                  className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Rider Active Ride Map ────────────────────────────────────────────────────



function RiderMapFit({ riderCoords, targetCoords }: { riderCoords: [number, number], targetCoords: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([riderCoords, targetCoords]);
    map.fitBounds(bounds, { padding: [60, 60], animate: true });
  }, [map, riderCoords, targetCoords]);
  return null;
}

const RiderActiveRide = ({ request, profile, onComplete, onArrive, onBack, restored = false }: { request: any, profile: Profile, onComplete: () => void, onArrive: () => void, onBack?: () => void, restored?: boolean }) => {
  const [riderCoords, setRiderCoords] = useState<[number, number] | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [ridePhase, setRidePhase] = useState<'pickup' | 'dropoff'>('pickup');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(restored);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => setShowRestoredBanner(false), 4000);
    return () => clearTimeout(t);
  }, [restored]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const targetCoords = ridePhase === 'pickup' ? request.pickup.coords : request.dropoff.coords;
  const pickupCoords = request.pickup.coords;

  useEffect(() => {
    const ch = supabase.channel('rider-locations');
    const lastBroadcast = { time: 0 };
    let watchId: number;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setRiderCoords(coords);
          const now = Date.now();
          if (now - lastBroadcast.time >= 4000) {
            lastBroadcast.time = now;
            ch.send({ type: 'broadcast', event: 'RIDER_LOCATION', payload: { rideId: request.rideId, lat: coords[0], lng: coords[1] } });
          }
        },
        () => setRiderCoords([6.1164, 125.1716]),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    });
    return () => {
      if (watchId!) navigator.geolocation.clearWatch(watchId);
      supabase.removeChannel(ch);
    };
  }, [request.rideId]);

  useEffect(() => {
    if (!riderCoords) return;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${riderCoords[1]},${riderCoords[0]};${targetCoords[1]},${targetCoords[0]}?overview=full&geometries=geojson`
    )
      .then(r => r.json())
      .then(data => {
        if (data.routes?.length > 0) {
          setRouteCoords(data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]));
          setRouteInfo({ distance: data.routes[0].distance, duration: data.routes[0].duration });
        }
      })
      .catch(() => {});
  }, [riderCoords, targetCoords]);

  const distanceLabel = routeInfo ? (routeInfo.distance / 1000).toFixed(1) + ' km' : '—';
  const durationLabel = routeInfo ? Math.ceil(routeInfo.duration / 60) + ' min' : '—';

  const passengerName = `${request.user?.first_name || ''} ${request.user?.last_name || ''}`.trim() || 'Passenger';
  const riderName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Rider';

  if (isChatOpen) {
    return (
      <div className="w-full h-[100dvh] flex flex-col">
        <RealtimeChat
          rideId={request.rideId}
          senderId={profile.id}
          senderRole="rider"
          senderName={riderName}
          otherName={passengerName}
          otherAvatar={request.user?.avatar_url}
          onBack={() => setIsChatOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-gray-900 font-sans">
      {/* Restored-session banner */}
      <AnimatePresence>
        {showRestoredBanner && (
          <motion.div
            initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
            className="absolute top-0 inset-x-0 z-[9999] bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 py-2.5 px-4 shadow-lg"
          >
            <div className="w-2 h-2 rounded-full bg-blue-300 animate-pulse" />
            Resumed your active ride
          </motion.div>
        )}
      </AnimatePresence>
      {/* Map */}
      <div className="flex-1 relative">
        {riderCoords ? (
          <MapContainer center={riderCoords} zoom={14} zoomControl={false} className="w-full h-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <Marker position={riderCoords} icon={riderIcon} />
            <Marker position={targetCoords} icon={ridePhase === 'pickup' ? pickupIcon : destinationIcon} />
            {routeCoords && <Polyline positions={routeCoords} color={ridePhase === 'pickup' ? "#f97316" : "#10b981"} weight={5} opacity={0.9} />}
            <RiderMapFit riderCoords={riderCoords} targetCoords={targetCoords} />
          </MapContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Legend */}
        <div className="absolute top-4 left-4 bg-white rounded-2xl shadow-lg px-4 py-3 flex flex-col gap-2 z-[999]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow" />
            <span className="text-xs font-bold text-gray-700">Your Location</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 border-white shadow ${ridePhase === 'pickup' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
            <span className="text-xs font-bold text-gray-700">{ridePhase === 'pickup' ? 'Pickup Point' : 'Destination'}</span>
          </div>
        </div>
      </div>

      {/* Bottom Panel — collapsible */}
      <div className="bg-white rounded-t-[28px] shadow-2xl">
        {/* Handle + summary — always visible, tap to expand/collapse */}
        <button
          onClick={() => setIsPanelExpanded(e => !e)}
          className="w-full pt-4 pb-3 px-6 text-left"
        >
          <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-black text-blue-600 shrink-0">
              {request.user?.first_name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-900 text-sm truncate">{request.user?.first_name} {request.user?.last_name || ''}</p>
              <p className="text-xs text-gray-400">{ridePhase === 'pickup' ? 'Heading to pickup' : 'On the way to destination'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-black text-lg text-emerald-600">₱{request.fare}</p>
              <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${isPanelExpanded ? 'rotate-90' : '-rotate-90'}`} />
            </div>
          </div>
        </button>

        {/* Collapsible details */}
        <AnimatePresence initial={false}>
          {isPanelExpanded && (
            <motion.div
              key="rider-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-2">
                {onBack && (
                  <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-gray-700 transition-colors mb-4">
                    <ChevronLeft size={14} /> Back to dashboard
                  </button>
                )}
                {/* Route */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-4 space-y-3">
                  <div className={`flex items-center gap-3 transition-opacity ${ridePhase === 'dropoff' ? 'opacity-40' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Pick up</p>
                      <p className="text-sm font-bold text-gray-800">{request.pickup.label}</p>
                    </div>
                  </div>
                  <div className="ml-3.5 w-px h-4 bg-gray-300" />
                  <div className={`flex items-center gap-3 transition-opacity ${ridePhase === 'pickup' ? 'opacity-40' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Drop off</p>
                      <p className="text-sm font-bold text-gray-800">{request.dropoff.label}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — always visible */}
        <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 flex gap-3">
          <button
            onClick={() => setIsChatOpen(true)}
            className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-700 hover:bg-gray-200 transition-colors shrink-0"
          >
            <MessageSquare size={22} />
          </button>
          <button
            onClick={() => {
              if (ridePhase === 'pickup') {
                setRidePhase('dropoff');
                if (onArrive) onArrive();
              } else {
                onComplete();
              }
            }}
            className={`flex-1 py-4 text-white font-black text-base rounded-2xl transition-all shadow-lg ${
              ridePhase === 'pickup'
                ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/30'
                : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'
            }`}
          >
            {ridePhase === 'pickup' ? 'Arrive at Pickup' : 'Complete Ride'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Rider Dashboard ──────────────────────────────────────────────────────────

const RiderDashboard = ({ profile: initialProfile }: { profile: Profile }) => {
  const [currentProfile, setCurrentProfile] = useState<Profile>(initialProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [hasRequest, setHasRequest] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [currentRequest, setCurrentRequest] = useState<any>(null);

  const [riderTab, setRiderTab] = useState<'home' | 'history'>('home');
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [allTrips, setAllTrips] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [todayStats, setTodayStats] = useState<{ trips: number; earnings: number; rating: number | null } | null>(null);

  useEffect(() => {
    if (!initialProfile.id) return;
    (async () => {
      const { data } = await supabase
        .from('rides')
        .select('id, pickup_label, dropoff_label, fare, rating, completed_at')
        .eq('rider_id', initialProfile.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5);
      if (!data) return;
      setRecentTrips(data);
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayRides = data.filter(r => r.completed_at && new Date(r.completed_at) >= todayStart);
      const rated = data.filter(r => r.rating != null);
      const avgRating = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null;
      setTodayStats({
        trips: todayRides.length,
        earnings: todayRides.reduce((s, r) => s + (r.fare || 0), 0),
        rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      });
    })();
  }, [initialProfile.id]);

  useEffect(() => {
    if (riderTab !== 'history' || !initialProfile.id) return;
    setHistoryLoading(true);
    (async () => {
      const dayStart = `${selectedHistoryDate}T00:00:00.000Z`;
      const dayEnd   = `${selectedHistoryDate}T23:59:59.999Z`;
      const { data } = await supabase
        .from('rides')
        .select('id, pickup_label, dropoff_label, fare, fare_breakdown, ride_type, rating, comment, completed_at, user_name, user_avatar')
        .eq('rider_id', initialProfile.id)
        .eq('status', 'completed')
        .gte('completed_at', dayStart)
        .lte('completed_at', dayEnd)
        .order('completed_at', { ascending: false });
      setAllTrips(data ?? []);
      setHistoryLoading(false);
    })();
  }, [riderTab, initialProfile.id, selectedHistoryDate]);

  // ── Active-ride persistence ────────────────────────────────────────────────
  const [rideRestored, setRideRestored] = React.useState(false);
  const [showActiveRide, setShowActiveRide] = React.useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RIDER_RIDE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.currentRequest && s.requestAccepted) {
        setCurrentRequest(s.currentRequest);
        setRequestAccepted(true);
        setRideRestored(true);
        setShowActiveRide(true);
      }
    } catch { /* ignore */ }
  }, []); // mount only

  useEffect(() => {
    if (requestAccepted && currentRequest) {
      try {
        localStorage.setItem(RIDER_RIDE_KEY, JSON.stringify({ currentRequest, requestAccepted: true }));
      } catch { /* ignore */ }
    } else {
      localStorage.removeItem(RIDER_RIDE_KEY);
    }
  }, [requestAccepted, currentRequest]);

  const { connectionState: riderConnectionState, reconnectTick: riderReconnectTick } = useConnectionStatus();
  const riderWasOfflineRef = React.useRef(false);

  useEffect(() => {
    if (riderConnectionState === 'offline') riderWasOfflineRef.current = true;
  }, [riderConnectionState]);

  useEffect(() => {
    if (riderReconnectTick > 0 && riderWasOfflineRef.current) {
      riderWasOfflineRef.current = false;
      setAppNotifications(prev => [{ id: genId(), title: 'Back online ✓', body: 'Connection restored. You are visible to passengers again.', time: Date.now(), read: false }, ...prev]);
    }
  }, [riderReconnectTick]);

  useEffect(() => {
    if (currentProfile.rider_status !== 'approved') setIsOnline(false);
  }, [currentProfile.rider_status]);

  // Write location to DB in real-time using device GPS
  useEffect(() => {
    const riderId = currentProfile.id;
    if (!isOnline) {
      supabase.from('profiles').update({ is_online: false, last_lat: null, last_lng: null }).eq('id', riderId);
      return;
    }
    supabase.from('profiles').update({ is_online: true, last_seen_at: new Date().toISOString() }).eq('id', riderId);
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        supabase.from('profiles').update({
          is_online: true,
          last_lat: pos.coords.latitude,
          last_lng: pos.coords.longitude,
          last_seen_at: new Date().toISOString(),
        }).eq('id', riderId);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      supabase.from('profiles').update({ is_online: false, last_lat: null, last_lng: null }).eq('id', riderId);
    };
  }, [isOnline, currentProfile.id]);

  useEffect(() => {
    if (!isOnline) {
      setHasRequest(false);
      setRequestAccepted(false);
      setIncomingRequests([]);
      setCurrentRequest(null);
      return;
    }
    const channel = supabase.channel('rides');
    channel.on('broadcast', { event: 'REQUEST_RIDE' }, (payload) => {
       setIncomingRequests(prev => {
         // Avoid duplicates (rider may already have fetched this from DB)
         if (prev.some((r: any) => r.rideId === payload.payload.rideId)) return prev;
         return [...prev, payload.payload];
       });
       const pName = `${payload.payload.user?.first_name || ''} ${payload.payload.user?.last_name || ''}`.trim() || 'Passenger';
       setAppNotifications(prev => [{ id: genId(), title: 'New ride request 🛵', body: `${pName} is requesting a ride.`, time: Date.now(), read: false }, ...prev]);
       pushNotification('New ride request 🛵', `${pName} is requesting a ride.`);
    });
    channel.on('broadcast', { event: 'CANCEL_RIDE' }, (payload) => {
       setIncomingRequests(prev => prev.filter(req => req.rideId !== payload.payload.rideId));
       setCurrentRequest((current: any) => {
          if (current?.rideId === payload.payload.rideId) {
             setHasRequest(false);
             setRequestAccepted(false);
             setAppNotifications(prev => [{ id: genId(), title: 'Ride cancelled', body: 'The passenger cancelled their booking.', time: Date.now(), read: false }, ...prev]);
             alert('The passenger cancelled the ride.');
             return null;
          }
          return current;
       });
    });
    channel.subscribe(async () => {
      // Once subscribed, fetch any pending rides that were booked before we came online
      const { data: pending } = await supabase
        .from('rides')
        .select('request_data')
        .eq('status', 'pending')
        .order('id', { ascending: true });
      if (pending && pending.length > 0) {
        const requests = pending.map((r: any) => r.request_data).filter(Boolean);
        if (requests.length > 0) {
          setIncomingRequests(prev => {
            const existingIds = new Set(prev.map((r: any) => r.rideId));
            return [...prev, ...requests.filter((r: any) => !existingIds.has(r.rideId))];
          });
        }
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [isOnline, riderReconnectTick]);

  useEffect(() => {
    if (incomingRequests.length > 0 && !hasRequest && !requestAccepted) {
      setCurrentRequest(incomingRequests[0]);
      setHasRequest(true);
      setIncomingRequests(prev => prev.slice(1));
    }
  }, [incomingRequests, hasRequest, requestAccepted]);

  if (showProfile) {
    return <RiderProfileScreen profile={currentProfile} onBack={() => setShowProfile(false)} onUpdate={setCurrentProfile} />;
  }

  if (showChatHistory) {
    return (
      <ChatHistoryScreen
        userId={currentProfile.id}
        userName={currentProfile.first_name || currentProfile.full_name || 'Rider'}
        role="rider"
        onBack={() => setShowChatHistory(false)}
      />
    );
  }

  if (showNotifications) {
    return (
      <NotificationsPanel
        notifications={appNotifications}
        onClose={() => {
          setShowNotifications(false);
          setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
        }}
        onClear={() => setAppNotifications([])}
      />
    );
  }

  if (requestAccepted && currentRequest && showActiveRide) {
    return (
      <RiderActiveRide
        request={currentRequest}
        profile={currentProfile}
        restored={rideRestored}
        onBack={() => setShowActiveRide(false)}
        onComplete={() => {
          supabase.channel('rides').send({ type: 'broadcast', event: 'RIDE_COMPLETED', payload: { rideId: currentRequest.rideId } });
          localStorage.removeItem(RIDER_RIDE_KEY);
          setRequestAccepted(false);
          setCurrentRequest(null);
          setHasRequest(false);
          setShowActiveRide(false);
        }}
        onArrive={() => {
          supabase.channel('rides').send({ type: 'broadcast', event: 'RIDER_ARRIVED', payload: { rideId: currentRequest.rideId } });
        }}
      />
    );
  }

  return (
    <div className="w-full min-h-[100dvh] bg-gray-50 font-sans text-gray-900">
      <ConnectionBanner state={riderConnectionState} />
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
          <div className="w-8 h-8 md:w-9 md:h-9 bg-gray-950 rounded-xl flex items-center justify-center shrink-0">
            <Car size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-[14px] md:text-[15px] text-gray-950 leading-tight">Fetch Driver</h1>
            <p className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 truncate max-w-[120px] md:max-w-none">{currentProfile.full_name || currentProfile.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <div className={`px-2 py-1 rounded-lg text-[9px] md:text-[10px] font-black tracking-wide ${isOnline && !requestAccepted ? 'bg-emerald-50 text-emerald-700' : requestAccepted ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {requestAccepted ? 'ON TRIP' : isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
          <button onClick={() => setShowChatHistory(true)} className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors">
            <MessageSquare size={15} className="text-gray-600" />
          </button>
          <button
            onClick={() => {
              setShowNotifications(true);
              setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }}
            className="relative w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <Bell size={15} className="text-gray-600" />
            {appNotifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-1 right-1 w-3 h-3 md:w-3.5 md:h-3.5 bg-red-500 rounded-full text-white text-[8px] md:text-[9px] font-black flex items-center justify-center leading-none">
                {appNotifications.filter(n => !n.read).length > 9 ? '9+' : appNotifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
          <button onClick={() => setShowProfile(true)} className="w-8 h-8 md:w-9 md:h-9 rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors">
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-gray-100 flex items-center justify-center"><User size={15} className="text-gray-500" /></div>}
          </button>
          <button
            onClick={() => signOut()}
            className="hidden md:flex w-9 h-9 rounded-xl items-center justify-center bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-5 flex gap-1">
        {(['home', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setRiderTab(tab)}
            className={`py-3 px-4 text-[13px] font-bold border-b-2 transition-colors capitalize ${riderTab === tab ? 'border-gray-950 text-gray-950' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {tab === 'home' ? 'Dashboard' : 'Trip History'}
          </button>
        ))}
      </div>

      <div className="max-w-xl mx-auto p-4 md:p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">

        {/* Ongoing ride banner — shown when rider backed out to dashboard */}
        <AnimatePresence>
          {requestAccepted && currentRequest && (
            <motion.div
              key="rider-ongoing"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-gray-950 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3.5 shadow-xl shadow-black/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] leading-tight">Ongoing trip</p>
                  <p className="text-gray-400 text-[11px] font-medium truncate mt-0.5">
                    {currentRequest.user?.first_name || 'Passenger'} · {currentRequest.pickup?.label}
                  </p>
                </div>
                <button
                  onClick={() => setShowActiveRide(true)}
                  className="shrink-0 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  View
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── History Tab ── */}
        {riderTab === 'history' && (() => {
          const totalEarnings = allTrips.reduce((s, t) => s + (t.fare || 0), 0);
          const avgRating = allTrips.filter(t => t.rating != null).length
            ? (allTrips.filter(t => t.rating != null).reduce((s, t) => s + t.rating, 0) / allTrips.filter(t => t.rating != null).length).toFixed(1)
            : null;
          return (
            <div className="space-y-4">
              {/* Date picker */}
              <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Viewing</p>
                  <p className="font-black text-[15px] text-gray-950">
                    {new Date(selectedHistoryDate + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <input
                  type="date"
                  value={selectedHistoryDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setSelectedHistoryDate(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 focus:outline-none focus:border-gray-400"
                />
              </div>

              {/* Day summary */}
              {!historyLoading && allTrips.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Trips', value: allTrips.length.toString() },
                    { label: 'Earned', value: `₱${totalEarnings}` },
                    { label: 'Avg Rating', value: avgRating ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
                      <p className="font-black text-xl text-gray-950 tracking-tight">{value}</p>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Trip list */}
              {historyLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
              ) : allTrips.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Car size={28} className="mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-sm">No trips on this day</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {allTrips.map((t, i) => (
                    <button key={t.id ?? i} onClick={() => setSelectedTrip(t)} className="w-full px-5 py-3.5 flex items-center gap-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors text-left">
                      <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0">
                        {t.user_avatar
                          ? <img src={t.user_avatar} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center font-bold text-xs text-gray-500">{(t.user_name || 'P')[0].toUpperCase()}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{t.user_name || 'Passenger'}</p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{t.pickup_label} → {t.dropoff_label}</p>
                        <p className="text-[10px] text-gray-300 mt-0.5">{t.completed_at ? new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="font-black text-sm text-gray-950">₱{t.fare}</p>
                          {t.rating != null && (
                            <div className="flex justify-end mt-0.5 gap-0.5">
                              {Array.from({ length: t.rating }).map((_, j) => <Star key={j} size={9} className="text-amber-400 fill-amber-400" />)}
                            </div>
                          )}
                        </div>
                        <ChevronLeft size={14} className="text-gray-300 shrink-0 rotate-180" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Trip Detail Sheet */}
              <AnimatePresence>
                {selectedTrip && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
                    onClick={() => setSelectedTrip(null)}
                  >
                    <motion.div
                      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                      onClick={e => e.stopPropagation()}
                      className="bg-white w-full max-w-xl rounded-t-[28px] p-6 pb-10"
                    >
                      <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
                      <div className="flex items-start justify-between mb-5">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Completed</p>
                          <p className="font-black text-[1.2rem] tracking-tight leading-tight">Trip Details</p>
                          <p className="text-gray-400 text-xs mt-0.5">{selectedTrip.completed_at ? new Date(selectedTrip.completed_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                        </div>
                        <button onClick={() => setSelectedTrip(null)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                          <X size={16} className="text-gray-500" />
                        </button>
                      </div>

                      {/* Passenger */}
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden shrink-0">
                          {selectedTrip.user_avatar
                            ? <img src={selectedTrip.user_avatar} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center font-bold text-gray-400">{(selectedTrip.user_name || 'P')[0].toUpperCase()}</div>}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Passenger</p>
                          <p className="font-bold text-[15px] text-gray-900">{selectedTrip.user_name || 'Passenger'}</p>
                        </div>
                      </div>

                      {/* Route */}
                      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-4 space-y-2.5">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-gray-900 mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Pickup</p>
                            <p className="font-semibold text-sm text-gray-900">{selectedTrip.pickup_label}</p>
                          </div>
                        </div>
                        <div className="ml-1 w-px h-4 bg-gray-200" />
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Dropoff</p>
                            <p className="font-semibold text-sm text-gray-900">{selectedTrip.dropoff_label}</p>
                          </div>
                        </div>
                      </div>

                      {/* Fare Breakdown */}
                      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Fare Breakdown</p>
                        <div className="space-y-2 text-[13px]">
                          {selectedTrip.fare_breakdown ? (
                            <>
                              {[
                                { label: 'Base Fare',   value: selectedTrip.fare_breakdown.baseFare },
                                { label: 'Distance',    value: selectedTrip.fare_breakdown.distanceFee },
                                { label: 'Time',        value: selectedTrip.fare_breakdown.timeFee },
                                { label: 'Booking Fee', value: selectedTrip.fare_breakdown.bookingFee },
                              ].map(row => (
                                <div key={row.label} className="flex justify-between text-gray-500">
                                  <span>{row.label}</span><span>₱{row.value}</span>
                                </div>
                              ))}
                              <div className="border-t border-gray-200 pt-2 flex justify-between font-black text-gray-900 text-sm">
                                <span>Total</span><span>₱{selectedTrip.fare_breakdown.totalFare ?? selectedTrip.fare}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between font-black text-gray-900 text-sm">
                              <span>Total</span><span>₱{selectedTrip.fare}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rating & Comment */}
                      {selectedTrip.rating != null && (
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Passenger Rating</p>
                          <div className="flex items-center gap-1.5">
                            {[1,2,3,4,5].map(s => <Star key={s} size={16} className={s <= selectedTrip.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}
                            <span className="ml-1 font-bold text-sm text-gray-700">{selectedTrip.rating}/5</span>
                          </div>
                          {selectedTrip.comment && <p className="text-sm text-gray-500 mt-2 italic">"{selectedTrip.comment}"</p>}
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Home Tab ── */}
        {riderTab === 'home' && <>

        {/* Go Online / Not Approved */}
        {currentProfile.rider_status !== 'approved' ? (
          <div className="rounded-2xl p-6 text-center bg-white border border-gray-100">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={22} className={currentProfile.rider_status === 'pending' ? 'text-amber-500' : currentProfile.rider_status === 'rejected' ? 'text-red-500' : 'text-gray-400'} />
            </div>
            <h2 className="text-gray-950 font-black text-[1.1rem] tracking-tight mb-1">Account Not Approved</h2>
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              {currentProfile.rider_status === 'pending'
                ? 'Your account is under review. Please wait for admin approval.'
                : currentProfile.rider_status === 'rejected'
                ? 'Your application was rejected. Please update your documents and resubmit.'
                : 'Submit your documents to get verified before going online.'}
            </p>
            <button
              onClick={() => setShowProfile(true)}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {currentProfile.rider_status === 'rejected' ? 'Update & Resubmit' : 'View Profile'}
            </button>
          </div>
        ) : !requestAccepted ? (
          <motion.div
            className={`rounded-2xl p-6 text-center border transition-colors ${isOnline ? 'bg-gray-950 border-gray-900' : 'bg-white border-gray-100'}`}
            layout
          >
            {isOnline ? (
              <>
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse mx-auto mb-4" />
                <h2 className="text-white font-black text-[1.1rem] tracking-tight mb-1">You're Online</h2>
                <p className="text-gray-400 text-sm mb-5">Waiting for ride requests nearby...</p>
              </>
            ) : (
              <>
                <div className="w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Navigation size={20} className="text-gray-400" />
                </div>
                <h2 className="text-gray-950 font-black text-[1.1rem] tracking-tight mb-1">You're Offline</h2>
                <p className="text-gray-400 text-sm mb-5">Go online to start receiving ride requests.</p>
              </>
            )}
            <button
              onClick={() => setIsOnline(prev => !prev)}
              className={`w-full py-[15px] rounded-xl font-bold text-[15px] transition-colors ${isOnline ? 'bg-white text-gray-950 hover:bg-gray-100' : 'bg-gray-950 text-white hover:bg-gray-800'}`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </motion.div>
        ) : null}

        {/* Incoming Request — only shown when NOT already on a trip */}
        <AnimatePresence>
          {hasRequest && !requestAccepted && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="bg-white rounded-2xl p-5 border border-gray-900 shadow-xl shadow-black/10"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 bg-gray-950 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-gray-950 uppercase tracking-widest">New Ride Request</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center font-black text-gray-600 text-base shrink-0">
                  {currentRequest?.user?.first_name?.[0] || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-[15px] text-gray-950 truncate">{currentRequest?.user?.first_name} {currentRequest?.user?.last_name || ''}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Star size={11} className="text-amber-400 fill-amber-400" /> 4.8 · 24 trips
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-xl text-gray-950">₱{currentRequest?.fare}</p>
                  <p className="text-[11px] text-gray-400">3.2 km away</p>
                </div>
              </div>
              <div className="space-y-2 mb-4 bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 bg-gray-900 rounded-full shrink-0" />
                  <span className="text-[13px] text-gray-600 truncate">{currentRequest?.pickup?.label}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                  <span className="text-[13px] text-gray-600 truncate">{currentRequest?.dropoff?.label}</span>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setHasRequest(false);
                    setCurrentRequest(null);
                  }}
                  className="flex-1 py-3.5 rounded-xl border border-gray-200 font-bold text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={() => {
                    setRequestAccepted(true);
                    setHasRequest(false);
                    setShowActiveRide(true);
                    supabase.channel('rides').send({ type: 'broadcast', event: 'RIDE_ACCEPTED', payload: { rideId: currentRequest.rideId, rider: currentProfile } });
                    // Mark as accepted in DB so other riders don't pick it up
                    supabase.from('rides').update({ status: 'accepted', rider_id: currentProfile.id }).eq('id', currentRequest.rideId).eq('status', 'pending');
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-gray-950 text-white font-bold text-sm hover:bg-gray-800 transition-colors"
                >
                  Accept
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Today's Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today's Trips", value: todayStats ? todayStats.trips.toString() : '—' },
            { label: "Earnings", value: todayStats ? `₱${todayStats.earnings}` : '—' },
            { label: "Rating", value: todayStats?.rating != null ? todayStats.rating.toString() : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
              <p className="font-black text-xl text-gray-950 tracking-tight">{value}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Recent Trips */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-bold text-sm text-gray-900">Recent Trips</h3>
          </div>
          {recentTrips.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No completed trips yet.</p>
          ) : recentTrips.map((t, i) => (
            <div key={t.id ?? i} className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0 pr-3">
                <p className="font-semibold text-sm text-gray-900 truncate">{t.pickup_label} → {t.dropoff_label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t.completed_at ? new Date(t.completed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-sm text-gray-950">₱{t.fare}</p>
                {t.rating != null && (
                  <div className="flex justify-end mt-0.5 gap-0.5">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} size={9} className="text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        </>}
      </div>
    </div>
  );
};

// ─── Admin / Super Admin Dashboard ───────────────────────────────────────────

type AdminTab = 'live' | 'drivers' | 'analytics' | 'finances' | 'reviews' | 'users' | 'riders' | 'pricing';

const AdminDashboard = ({ profile, isSuperAdmin }: { profile: Profile, isSuperAdmin: boolean }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('live');
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [riders, setRiders] = useState<Profile[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [selectedRider, setSelectedRider] = useState<Profile | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [pricingCfg, setPricingCfg] = useState<PricingConfig>(() => loadPricingConfig());
  const [pricingSaved, setPricingSaved] = useState(false);
  const [liveStats, setLiveStats] = useState<{ passengers: number; approvedRiders: number; pending: number } | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [reviewsData, setReviewsData] = useState<{ rider_id: string; rating: number; comment: string | null; created_at: string; profiles: { full_name: string | null; avatar_url: string | null } | null }[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<{ dayCounts: number[]; totalThisWeek: number; totalLastWeek: number } | null>(null);
  const [financeData, setFinanceData] = useState<{ grossTotal: number; grossThisWeek: number; grossLastWeek: number; recentRides: any[] } | null>(null);
  const [liveRiderLocations, setLiveRiderLocations] = useState<Record<string, { lat: number; lng: number; riderName?: string; riderAvatar?: string; status?: string }>>({});
  const [onlineNoGps, setOnlineNoGps] = useState<Record<string, { riderName: string; riderAvatar?: string }>>({});
  const rideInfoCache = React.useRef<Record<string, any>>({});

  useEffect(() => {
    if (activeTab === 'users' && isSuperAdmin && allUsers.length === 0) {
      setUsersLoading(true);
      supabase.rpc('get_all_profiles').then(({ data }) => {
        setAllUsers((data as Profile[]) || []);
        setUsersLoading(false);
      });
    }
    if (activeTab === 'riders' || activeTab === 'drivers') {
      setRidersLoading(true);
      getRiderProfiles().then(data => { setRiders(data); setRidersLoading(false); });
    }
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (activeTab !== 'live') return;
    setLiveLoading(true);
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'rider').eq('rider_status', 'approved'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('rider_status', 'pending'),
    ]).then(([passengers, riders, pending]) => {
      setLiveStats({
        passengers: passengers.count ?? 0,
        approvedRiders: riders.count ?? 0,
        pending: pending.count ?? 0,
      });
      setLiveLoading(false);
    });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'reviews') return;
    setReviewsLoading(true);
    (async () => {
      // Fetch all completed rides (with or without rating)
      const { data: reviews, error } = await supabase
        .from('rides')
        .select('id, rider_id, rider_name, rider_avatar, rating, comment, completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50);

      if (error || !reviews || reviews.length === 0) {
        setReviewsData([]);
        setReviewsLoading(false);
        return;
      }

      // Attach profile info — rider_name/rider_avatar are already stored on the ride row,
      // but fetch fresh profile data for accuracy
      const riderIds = [...new Set(reviews.map((r: any) => r.rider_id).filter(Boolean))];
      const { data: profiles } = riderIds.length
        ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', riderIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const merged = reviews.map((r: any) => ({
        ...r,
        created_at: r.completed_at,
        profiles: profileMap.get(r.rider_id) ?? { full_name: r.rider_name, avatar_url: r.rider_avatar },
      }));

      setReviewsData(merged as any[]);
      setReviewsLoading(false);
    })();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'live') return;

    // Initial load — fetch ALL online riders, split by GPS availability
    const loadOnlineRiders = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, avatar_url, last_lat, last_lng')
        .eq('is_online', true)
        .eq('role', 'rider');
      if (!data) return;
      const withGps: typeof liveRiderLocations = {};
      const withoutGps: typeof onlineNoGps = {};
      data.forEach((r: any) => {
        const name = r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Rider';
        if (r.last_lat != null && r.last_lng != null) {
          withGps[r.id] = { lat: r.last_lat, lng: r.last_lng, riderName: name, riderAvatar: r.avatar_url, status: 'online' };
        } else {
          withoutGps[r.id] = { riderName: name, riderAvatar: r.avatar_url };
        }
      });
      setLiveRiderLocations(withGps);
      setOnlineNoGps(withoutGps);
    };
    loadOnlineRiders();

    // Real-time updates via Postgres Changes
    const channel = supabase
      .channel('admin-rider-locations')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload: any) => {
        const r = payload.new;
        if (r.role !== 'rider') return;
        const name = r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Rider';
        if (!r.is_online) {
          // Rider went offline — remove from both lists
          setLiveRiderLocations(prev => { const n = { ...prev }; delete n[r.id]; return n; });
          setOnlineNoGps(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        } else if (r.last_lat != null && r.last_lng != null) {
          // Online with GPS — show on map, remove from no-GPS list
          setLiveRiderLocations(prev => ({
            ...prev,
            [r.id]: { lat: r.last_lat, lng: r.last_lng, riderName: name, riderAvatar: r.avatar_url, status: 'online' },
          }));
          setOnlineNoGps(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        } else {
          // Online but no GPS yet — show in list only
          setLiveRiderLocations(prev => { const n = { ...prev }; delete n[r.id]; return n; });
          setOnlineNoGps(prev => ({ ...prev, [r.id]: { riderName: name, riderAvatar: r.avatar_url } }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    (async () => {
      // Get rides from the past 14 days
      const now = new Date();
      const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 13); twoWeeksAgo.setHours(0,0,0,0);
      const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 6); thisWeekStart.setHours(0,0,0,0);
      const { data } = await supabase
        .from('rides')
        .select('completed_at')
        .eq('status', 'completed')
        .gte('completed_at', twoWeeksAgo.toISOString());
      const rides = data ?? [];
      // Count per day of week (Sun=0..Sat=6), using last 7 days
      const dayCounts = [0,0,0,0,0,0,0];
      let totalThisWeek = 0, totalLastWeek = 0;
      rides.forEach((r: any) => {
        const d = new Date(r.completed_at);
        if (d >= thisWeekStart) { dayCounts[d.getDay()]++; totalThisWeek++; }
        else totalLastWeek++;
      });
      setAnalyticsData({ dayCounts, totalThisWeek, totalLastWeek });
    })();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'finances') return;
    (async () => {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0,0,0,0);
      const lastWeekStart = new Date(); lastWeekStart.setDate(lastWeekStart.getDate() - 13); lastWeekStart.setHours(0,0,0,0);
      const { data } = await supabase
        .from('rides')
        .select('id, fare, rider_name, rider_avatar, completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(200);
      const rides = data ?? [];
      let grossTotal = 0, grossThisWeek = 0, grossLastWeek = 0;
      rides.forEach((r: any) => {
        grossTotal += r.fare || 0;
        const d = new Date(r.completed_at);
        if (d >= weekStart) grossThisWeek += r.fare || 0;
        else if (d >= lastWeekStart) grossLastWeek += r.fare || 0;
      });
      setFinanceData({ grossTotal, grossThisWeek, grossLastWeek, recentRides: rides.slice(0, 10) });
    })();
  }, [activeTab]);

  const handleStatusChange = async (riderId: string, status: RiderStatus) => {
    setStatusUpdating(true);
    const ok = await setRiderStatus(riderId, status);
    if (ok) {
      const refreshed = await getRiderProfiles();
      setRiders(refreshed);
      if (selectedRider?.id === riderId) {
        const updated = refreshed.find(r => r.id === riderId);
        if (updated) setSelectedRider(updated);
      }
    }
    setStatusUpdating(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setRoleUpdating(userId);
    const updated = await updateProfile(userId, { role: newRole as Profile['role'] });
    if (updated) {
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: updated.role } : u));
    }
    setRoleUpdating(null);
  };

  const tabs = [
    { id: 'live' as AdminTab, label: 'Live Operations', icon: Activity },
    { id: 'drivers' as AdminTab, label: 'Driver Management', icon: Users },
    { id: 'riders' as AdminTab, label: 'Rider Verification', icon: FileText },
    { id: 'analytics' as AdminTab, label: 'Booking Analytics', icon: TrendingUp },
    { id: 'finances' as AdminTab, label: 'Revenue Dashboard', icon: BarChart },
    { id: 'reviews' as AdminTab, label: 'Ride Reviews', icon: Star },
    ...(isSuperAdmin ? [
      { id: 'users' as AdminTab, label: 'User Management', icon: Settings },
      { id: 'pricing' as AdminTab, label: 'Pricing Config', icon: DollarSign },
    ] : []),
  ];

  return (
    <div className="w-full min-h-[100dvh] bg-gray-50 flex flex-col md:flex-row font-sans text-gray-900">
      {/* Sidebar */}
      <div className="w-full md:w-60 bg-[#0a0a0a] text-white flex flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-[13px] leading-tight text-white">{isSuperAdmin ? 'Super Admin' : 'Admin'}</h1>
            <p className="text-[11px] text-white/40 font-medium truncate">{profile.full_name || profile.email}</p>
          </div>
          {profile.avatar_url && (
            <img src={profile.avatar_url} alt="avatar" className="w-7 h-7 rounded-full shrink-0 opacity-80" />
          )}
        </div>

        <div className="flex-1 py-3 px-2.5 space-y-0.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors ${activeTab === id ? 'bg-white text-gray-950' : 'hover:bg-white/[0.06] text-white/50 hover:text-white/80'}`}
            >
              <Icon size={15} />
              <span className="font-semibold text-[13px]">{label}</span>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-red-500/10 text-white/40 hover:text-red-400 py-2.5 rounded-xl transition-colors font-semibold text-[13px]"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto">

          {/* Live Operations */}
          {activeTab === 'live' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Live Operations</h2>
                <p className="text-gray-400 text-sm mt-1">Real-time platform activity</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {liveLoading || !liveStats ? (
                  [0,1,2].map(i => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 animate-pulse">
                      <div className="h-3 w-24 bg-gray-100 rounded mb-4" />
                      <div className="h-8 w-16 bg-gray-100 rounded" />
                    </div>
                  ))
                ) : (
                  [
                    { label: 'Registered Passengers', value: liveStats.passengers.toLocaleString(), delta: 'Total users' },
                    { label: 'Approved Riders', value: liveStats.approvedRiders.toLocaleString(), delta: 'Active on platform' },
                    { label: 'Pending Applications', value: liveStats.pending.toLocaleString(), delta: 'Awaiting review' },
                  ].map(({ label, value, delta }) => (
                    <div key={label} className="bg-white p-5 rounded-2xl border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
                      <h3 className="text-3xl font-black text-gray-950 tracking-tight">{value}</h3>
                      <p className="text-[12px] text-gray-400 font-medium mt-2">{delta}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">Live Rider Map</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {Object.keys(liveRiderLocations).length + Object.keys(onlineNoGps).length} online rider{(Object.keys(liveRiderLocations).length + Object.keys(onlineNoGps).length) !== 1 ? 's' : ''} · {Object.keys(liveRiderLocations).length} on map
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> LIVE
                  </span>
                </div>
                <div className="h-[580px] w-full">
                  <MapContainer center={[6.1164, 125.1716]} zoom={13} zoomControl={true} className="w-full h-full">
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    {(Object.entries(liveRiderLocations) as [string, { lat: number; lng: number; riderName?: string; riderAvatar?: string; status?: string }][]).map(([key, loc]) => {
                      const initial = (loc.riderName || 'R')[0].toUpperCase();
                      const borderColor = loc.status === 'on_trip' ? '#f59e0b' : '#10b981';
                      const icon = L.divIcon({
                        html: loc.riderAvatar
                          ? `<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid ${borderColor};box-shadow:0 2px 12px rgba(0,0,0,0.4)"><img src="${loc.riderAvatar}" style="width:100%;height:100%;object-fit:cover"/></div>`
                          : `<div style="width:40px;height:40px;border-radius:50%;background:${borderColor};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:15px;box-shadow:0 2px 12px rgba(0,0,0,0.4)">${initial}</div>`,
                        className: '',
                        iconSize: [40, 40],
                        iconAnchor: [20, 20],
                      });
                      return <Marker key={key} position={[loc.lat, loc.lng]} icon={icon} />;
                    })}
                  </MapContainer>
                </div>
                {/* Riders with GPS */}
                {Object.keys(liveRiderLocations).length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {(Object.entries(liveRiderLocations) as [string, { lat: number; lng: number; riderName?: string; riderAvatar?: string; status?: string }][]).map(([key, loc]) => (
                      <div key={key} className="px-5 py-3 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 ${loc.status === 'on_trip' ? 'border-amber-400' : 'border-emerald-400'}`}>
                          {loc.riderAvatar
                            ? <img src={loc.riderAvatar} alt="" className="w-full h-full object-cover" />
                            : <div className={`w-full h-full flex items-center justify-center font-bold text-xs ${loc.status === 'on_trip' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{(loc.riderName || 'R')[0]}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{loc.riderName || 'Rider'}</p>
                          <p className="text-[11px] text-gray-400">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p>
                        </div>
                        {loc.status === 'on_trip' ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500">
                            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" /> On Trip
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Online
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Riders online but GPS not yet received */}
                {Object.keys(onlineNoGps).length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {(Object.entries(onlineNoGps) as [string, { riderName: string; riderAvatar?: string }][]).map(([key, r]) => (
                      <div key={key} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-emerald-400">
                          {r.riderAvatar
                            ? <img src={r.riderAvatar} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center font-bold text-xs bg-emerald-100 text-emerald-700">{r.riderName[0]}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{r.riderName}</p>
                          <p className="text-[11px] text-gray-400">Waiting for GPS…</p>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Online
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {Object.keys(liveRiderLocations).length === 0 && Object.keys(onlineNoGps).length === 0 && (
                  <div className="px-5 py-4 text-center text-[12px] text-gray-400">
                    No riders are online. Rider positions appear here when they go online.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Driver Management */}
          {activeTab === 'drivers' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Driver Management</h2>
                <p className="text-gray-400 text-sm mt-1">Monitor and manage active drivers</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-900">Active Drivers</h3>
                  <button className="px-3.5 py-1.5 bg-gray-950 text-white rounded-lg text-[12px] font-bold hover:bg-gray-800 transition-colors">Add Driver</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Driver</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vehicle</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rating</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ridersLoading ? (
                        <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
                      ) : riders.filter(r => r.rider_status === 'approved').length === 0 ? (
                        <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No approved riders yet.</td></tr>
                      ) : riders.filter(r => r.rider_status === 'approved').map(r => (
                        <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0">
                                {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{(r.first_name || r.full_name || '?')[0]}</div>}
                              </div>
                              <span className="font-semibold text-sm text-gray-900">{r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-gray-400 text-sm">{[r.vehicle_make, r.vehicle_model, r.vehicle_plate ? `· ${r.vehicle_plate}` : ''].filter(Boolean).join(' ') || '—'}</td>
                          <td className="px-5 py-4"><span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700">Approved</span></td>
                          <td className="px-5 py-4 text-sm font-bold text-gray-900"><span className="flex items-center gap-1"><Star size={12} className="text-amber-400 fill-amber-400" />—</span></td>
                          <td className="px-5 py-4"><button onClick={() => setSelectedRider(r)} className="text-[12px] font-bold text-gray-500 hover:text-gray-900 transition-colors">View</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Booking Analytics */}
          {activeTab === 'analytics' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Booking Analytics</h2>
                <p className="text-gray-400 text-sm mt-1">Weekly performance metrics</p>
              </div>
              {(() => {
                const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const counts = analyticsData?.dayCounts ?? [0,0,0,0,0,0,0];
                const maxCount = Math.max(...counts, 1);
                const weekChange = analyticsData
                  ? analyticsData.totalLastWeek === 0
                    ? null
                    : Math.round(((analyticsData.totalThisWeek - analyticsData.totalLastWeek) / analyticsData.totalLastWeek) * 100)
                  : null;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-2xl border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rides This Week</p>
                      <p className="text-3xl font-black text-gray-950 tracking-tight mb-5">{analyticsData?.totalThisWeek ?? '—'}</p>
                      <div className="flex items-end gap-1.5 h-36">
                        {counts.map((c, i) => (
                          <div key={i} className="flex-1 rounded-t-md relative bg-gray-100 overflow-hidden" title={`${days[i]}: ${c} rides`}>
                            <div className="absolute bottom-0 w-full bg-gray-900 rounded-t-md transition-all" style={{ height: `${(c / maxCount) * 100}%` }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-3 text-[10px] font-bold text-gray-300">
                        {days.map(d => <span key={d}>{d}</span>)}
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Week-over-Week</p>
                      <div className="mb-5">
                        <h4 className="text-4xl font-black text-gray-950 tracking-tight">{analyticsData?.totalThisWeek ?? '—'}<span className="text-lg text-gray-300 font-bold ml-1.5">rides</span></h4>
                        {weekChange !== null && (
                          <p className={`text-[12px] font-semibold flex items-center gap-1 mt-1.5 ${weekChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            <TrendingUp size={12}/> {weekChange >= 0 ? '+' : ''}{weekChange}% vs last week ({analyticsData?.totalLastWeek} rides)
                          </p>
                        )}
                      </div>
                      <div className="space-y-3.5">
                        {[
                          { label: 'This week', count: analyticsData?.totalThisWeek ?? 0 },
                          { label: 'Last week', count: analyticsData?.totalLastWeek ?? 0 },
                        ].map(row => {
                          const total = (analyticsData?.totalThisWeek ?? 0) + (analyticsData?.totalLastWeek ?? 0) || 1;
                          return (
                            <div key={row.label}>
                              <div className="flex justify-between text-[13px] font-semibold text-gray-700 mb-1.5"><span>{row.label}</span><span>{row.count} rides</span></div>
                              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-950 rounded-full" style={{ width: `${(row.count / total) * 100}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Revenue Dashboard */}
          {activeTab === 'finances' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Revenue Dashboard</h2>
                <p className="text-gray-400 text-sm mt-1">Platform financial overview</p>
              </div>
              {(() => {
                const gross = financeData?.grossTotal ?? 0;
                const thisWeek = financeData?.grossThisWeek ?? 0;
                const lastWeek = financeData?.grossLastWeek ?? 0;
                const weekChange = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
                const fmt = (n: number) => n >= 1000000 ? `₱${(n/1000000).toFixed(2)}M` : n >= 1000 ? `₱${(n/1000).toFixed(1)}k` : `₱${n}`;
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-gray-950 text-white p-5 rounded-2xl">
                        <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">Total Gross Volume</p>
                        <h3 className="text-3xl font-black tracking-tight mb-3">{fmt(gross)}</h3>
                        {weekChange !== null && (
                          <p className={`text-[12px] font-semibold flex items-center gap-1 ${weekChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            <TrendingUp size={11}/> {weekChange >= 0 ? '+' : ''}{weekChange}% this week
                          </p>
                        )}
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Platform Revenue (20%)</p>
                        <h3 className="text-3xl font-black tracking-tight text-gray-950 mb-3">{fmt(Math.round(gross * 0.2))}</h3>
                        <p className="text-[12px] text-gray-400 font-semibold">This week: {fmt(Math.round(thisWeek * 0.2))}</p>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">This Week Gross</p>
                        <h3 className="text-3xl font-black tracking-tight text-gray-950 mb-3">{fmt(thisWeek)}</h3>
                        <p className="text-[12px] text-gray-400 font-semibold">Last week: {fmt(lastWeek)}</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100">
                        <h3 className="font-bold text-sm text-gray-900">Recent Transactions</h3>
                      </div>
                      {!financeData ? (
                        <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
                      ) : financeData.recentRides.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-gray-400">No completed rides yet.</p>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {financeData.recentRides.map((t: any) => (
                            <div key={t.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                              <div className="flex items-center gap-3.5">
                                <div className="w-8 h-8 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                                  {t.rider_avatar ? <img src={t.rider_avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><CheckCircle size={15} className="text-gray-500" /></div>}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm text-gray-900">{t.rider_name || 'Ride Completed'}</p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">{t.id} · {t.completed_at ? new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-sm text-gray-900">₱{t.fare}</p>
                                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Fee: ₱{Math.round((t.fare || 0) * 0.2)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* Rider Verification */}
          {activeTab === 'riders' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Rider Verification</h2>
                <p className="text-gray-400 text-sm mt-1">Review and approve rider applications</p>
              </div>

              {/* Rider detail modal */}
              <AnimatePresence>
                {selectedRider && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedRider(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                      onClick={e => e.stopPropagation()}
                      className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    >
                      {/* Modal header */}
                      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                          {selectedRider.avatar_url
                            ? <img src={selectedRider.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                            : <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><User size={18} className="text-gray-400" /></div>}
                          <div>
                            <h3 className="font-black text-[15px] text-gray-950 leading-tight">{selectedRider.full_name || '—'}</h3>
                            <p className="text-[12px] text-gray-400">{selectedRider.email}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedRider(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-400"><X size={16} /></button>
                      </div>

                      <div className="p-6 space-y-6">
                        {/* Status badge */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide ${
                            selectedRider.rider_status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                            selectedRider.rider_status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            selectedRider.rider_status === 'rejected' ? 'bg-red-50 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>{selectedRider.rider_status}</span>
                          {selectedRider.reviewed_by && selectedRider.reviewed_at ? (
                            <span className="text-[12px] text-gray-400">
                              {selectedRider.rider_status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                              <span className="font-semibold text-gray-600">{selectedRider.reviewed_by_name || 'Admin'}</span>
                              {' · '}{new Date(selectedRider.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-[12px] text-gray-400">{selectedRider.rider_status !== 'unsubmitted' ? 'Submitted for review' : 'Not yet submitted'}</span>
                          )}
                        </div>

                        {/* Personal Info */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Personal Information</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'First Name', value: selectedRider.first_name },
                              { label: 'Last Name', value: selectedRider.last_name },
                              { label: 'Phone', value: selectedRider.phone },
                              { label: 'Birthday', value: selectedRider.birthday ? new Date(selectedRider.birthday + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null },
                              { label: 'Sex', value: selectedRider.sex },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                                <p className="font-semibold text-gray-900 text-[13px]">{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Vehicle Info */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Vehicle Information</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Type', value: selectedRider.vehicle_type },
                              { label: 'Make / Brand', value: selectedRider.vehicle_make },
                              { label: 'Model', value: selectedRider.vehicle_model },
                              { label: 'Plate Number', value: selectedRider.vehicle_plate },
                              { label: 'Color', value: selectedRider.vehicle_color },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                                <p className="font-semibold text-gray-900 text-[13px]">{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Documents */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Uploaded Documents</p>
                          <div className="space-y-2">
                            {[
                              { label: "Driver's License", url: selectedRider.drivers_license_url },
                              { label: 'OR (Official Receipt)', url: selectedRider.or_url },
                              { label: 'CR (Certificate of Registration)', url: selectedRider.cr_url },
                              { label: 'Vehicle Photo', url: selectedRider.vehicle_image_url },
                            ].map(({ label, url }) => (
                              <div key={label} className="border border-gray-100 rounded-xl overflow-hidden">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 py-2 bg-gray-50 border-b border-gray-100">{label}</p>
                                {url
                                  ? <a href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt={label} className="w-full max-h-56 object-contain bg-gray-100 hover:opacity-90 transition-opacity cursor-zoom-in" />
                                    </a>
                                  : <div className="px-4 py-5 flex items-center gap-2 text-gray-300"><AlertCircle size={14} /><span className="text-[12px] font-medium">Not uploaded yet</span></div>}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Approve / Reject */}
                        {selectedRider.rider_status === 'pending' && (
                          <div className="flex gap-2.5 pt-1">
                            <button
                              onClick={() => handleStatusChange(selectedRider.id, 'rejected')}
                              disabled={statusUpdating}
                              className="flex-1 py-3.5 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleStatusChange(selectedRider.id, 'approved')}
                              disabled={statusUpdating}
                              className="flex-1 py-3.5 rounded-xl bg-gray-950 text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {statusUpdating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                              Approve
                            </button>
                          </div>
                        )}
                        {selectedRider.rider_status === 'approved' && (
                          <button onClick={() => handleStatusChange(selectedRider.id, 'rejected')} disabled={statusUpdating}
                            className="w-full py-3.5 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors">
                            Revoke Approval
                          </button>
                        )}
                        {selectedRider.rider_status === 'rejected' && (
                          <button onClick={() => handleStatusChange(selectedRider.id, 'approved')} disabled={statusUpdating}
                            className="w-full py-3.5 rounded-xl bg-gray-950 text-white font-bold text-sm hover:bg-gray-800 transition-colors">
                            Approve Instead
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Riders table */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-900">All Riders</h3>
                  <span className="text-[12px] text-gray-400">{riders.length} total</span>
                </div>
                {ridersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rider</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vehicle</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Docs</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riders.map(r => (
                          <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {r.avatar_url
                                  ? <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-400">{r.full_name?.[0] || '?'}</div>}
                                <div>
                                  <p className="font-semibold text-gray-900 text-sm">{r.full_name || '—'}</p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">{r.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-500">
                              {r.vehicle_make && r.vehicle_model ? `${r.vehicle_make} ${r.vehicle_model}` : '—'}
                              {r.vehicle_plate && <span className="block text-[11px] text-gray-400 mt-0.5">{r.vehicle_plate}</span>}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex gap-1 mb-1">
                                {[r.drivers_license_url, r.or_url, r.cr_url, r.vehicle_image_url].map((url, i) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${url ? 'bg-emerald-500' : 'bg-gray-200'}`} title={['License', 'OR', 'CR', 'Vehicle'][i]} />
                                ))}
                              </div>
                              <p className="text-[11px] text-gray-400">{[r.drivers_license_url, r.or_url, r.cr_url, r.vehicle_image_url].filter(Boolean).length}/4</p>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                                r.rider_status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                                r.rider_status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                r.rider_status === 'rejected' ? 'bg-red-50 text-red-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>{r.rider_status}</span>
                            </td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => setSelectedRider(r)}
                                className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <Eye size={13} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                        {riders.length === 0 && !ridersLoading && (
                          <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No riders found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Ride Reviews */}
          {activeTab === 'reviews' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Ride Reviews</h2>
                <p className="text-gray-400 text-sm mt-1">Ratings submitted by passengers after completed rides.</p>
              </div>

              {reviewsLoading ? (
                <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Loading reviews…</div>
              ) : reviewsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <Star size={32} className="mb-3 opacity-30" />
                  <p className="font-semibold text-sm">No reviews yet</p>
                  <p className="text-xs mt-1 opacity-70">Reviews appear here once riders receive ratings.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewsData.map((r: any) => (
                    <div key={r.id} className="bg-white rounded-2xl px-5 py-4 flex items-start gap-4 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0">
                        {r.profiles?.avatar_url
                          ? <img src={r.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-sm">{(r.profiles?.full_name || r.rider_name || '?')[0]}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-[13px] text-gray-900 truncate">{r.profiles?.full_name || r.rider_name || 'Unknown Rider'}</p>
                          <span className="text-[11px] text-gray-400 shrink-0">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                        </div>
                        {r.rating != null ? (
                          <div className="flex items-center gap-0.5 mt-1">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} size={13} className={s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
                            ))}
                            <span className="ml-1.5 text-[12px] font-semibold text-gray-500">{r.rating}/5</span>
                          </div>
                        ) : (
                          <span className="inline-block mt-1 text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Not rated</span>
                        )}
                        {r.comment && <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed">{r.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Pricing Config (Super Admin only) */}
          {activeTab === 'pricing' && isSuperAdmin && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">Pricing Configuration</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Maintenance costs are absorbed into the per-km rate and are <span className="font-semibold text-gray-600">not shown to users</span>.
                </p>
              </div>
              <div className="space-y-4">
                {(['moto', 'eco', 'premium'] as const).map(tier => {
                  const labels: Record<string, string> = { moto: 'Motorcycle', eco: 'Economy Car', premium: 'Premium Car' };
                  const p = pricingCfg[tier];
                  const field = (key: keyof typeof p, label: string, hint?: string) => (
                    <div key={key}>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-sm font-semibold">₱</span>
                        <input
                          type="number" min={0} step={0.5}
                          value={p[key]}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setPricingCfg(prev => ({ ...prev, [tier]: { ...prev[tier], [key]: val } }));
                            setPricingSaved(false);
                          }}
                          className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
                      </div>
                    </div>
                  );
                  return (
                    <div key={tier} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                        <h3 className="font-bold text-sm text-gray-900">{labels[tier]}</h3>
                      </div>
                      <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-5">
                        {field('baseFare', 'Base Fare')}
                        {field('perKmRate', 'Per KM Rate', '(incl. maint.)')}
                        {field('perMinuteRate', 'Per Minute Rate')}
                        {field('bookingFee', 'Booking Fee')}
                        {field('maintenanceCostPerKm', 'Maintenance / KM', '(internal)')}
                      </div>
                      <div className="px-5 pb-4">
                        <div className="bg-gray-50 rounded-xl px-4 py-3 text-[12px] text-gray-500 border border-gray-100">
                          <span className="font-bold text-gray-700">Net per KM: </span>
                          ₱{(p.perKmRate - p.maintenanceCostPerKm).toFixed(2)}
                          <span className="mx-2 text-gray-300">·</span>
                          <span className="font-bold text-gray-700">Maint. per KM: </span>
                          ₱{p.maintenanceCostPerKm.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={() => { savePricingConfig(pricingCfg); setPricingSaved(true); }}
                  className="px-6 py-2.5 bg-gray-950 text-white font-bold text-sm rounded-xl hover:bg-gray-800 transition-colors"
                >
                  Save Pricing
                </button>
                <button
                  onClick={() => { setPricingCfg(DEFAULT_PRICING); setPricingSaved(false); }}
                  className="px-6 py-2.5 bg-gray-100 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Reset to Defaults
                </button>
                {pricingSaved && (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-bold text-[13px]">
                    <CheckCircle size={14} /> Saved
                  </span>
                )}
              </div>
            </>
          )}

          {activeTab === 'users' && isSuperAdmin && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight text-gray-950">User Management</h2>
                <p className="text-gray-400 text-sm mt-1">Manage user roles and access</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-900">All Users</h3>
                  <span className="text-[12px] text-gray-400">{allUsers.length} total</span>
                </div>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">User</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Email</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Role</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Joined</th>
                          <th className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Change Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u) => (
                          <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {u.avatar_url
                                  ? <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                                  : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-400">{u.full_name?.[0] || '?'}</div>}
                                <span className="font-semibold text-gray-900 text-sm">{u.full_name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-gray-400 text-[13px]">{u.email}</td>
                            <td className="px-5 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                                u.role === 'super_admin' ? 'bg-purple-50 text-purple-700' :
                                u.role === 'admin' ? 'bg-blue-50 text-blue-700' :
                                u.role === 'rider' ? 'bg-emerald-50 text-emerald-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{u.role}</span>
                            </td>
                            <td className="px-5 py-4 text-gray-400 text-[13px]">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4">
                              {roleUpdating === u.id ? (
                                <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <select
                                  value={u.role}
                                  onChange={e => handleRoleChange(u.id, e.target.value)}
                                  className="text-[13px] font-semibold border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                                >
                                  <option value="user">user</option>
                                  <option value="rider">rider</option>
                                  <option value="admin">admin</option>
                                  <option value="super_admin">super_admin</option>
                                </select>
                              )}
                            </td>
                          </tr>
                        ))}
                        {allUsers.length === 0 && (
                          <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No users found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

// ─── Notification Toast ───────────────────────────────────────────────────────

const NotificationToast = ({ message }: { message: string | null }) => (
  <AnimatePresence>
    {message && (
      <motion.div
        initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 w-max max-w-[90vw]"
      >
        <Bell size={18} className="text-emerald-400" />
        <span className="font-bold text-sm">{message}</span>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Realtime Chat ────────────────────────────────────────────────────────────

interface RealtimeChatProps {
  rideId: string;
  senderId: string;
  senderRole: 'user' | 'rider';
  senderName: string;
  otherName: string;
  otherAvatar?: string | null;
  onBack: () => void;
}

const RealtimeChat = ({ rideId, senderId, senderRole, senderName, otherName, otherAvatar, onBack }: RealtimeChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages(rideId).then(msgs => { setMessages(msgs); setLoading(false); });
    const unsub = subscribeToMessages(rideId, (msg) => {
      // Only add messages from the other party via realtime — own messages are added optimistically
      if (msg.sender_id !== senderId) {
        setMessages(prev => [...prev, msg]);
      }
    });
    return unsub;
  }, [rideId, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    // Optimistic insert
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      ride_id: rideId,
      sender_id: senderId,
      sender_role: senderRole,
      sender_name: senderName,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    await sendMessage(rideId, senderId, senderRole, senderName, text);
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none pointer-events-auto flex flex-col w-full h-[85vh] md:h-full"
    >
      {/* Header */}
      <div className="flex items-center p-5 bg-emerald-600 text-white shadow-md shrink-0 md:rounded-none rounded-t-[2.5rem]">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-emerald-700 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden border-2 border-emerald-400 ml-2 shrink-0">
          {otherAvatar
            ? <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-lg">{otherName[0]}</div>}
        </div>
        <div className="ml-3">
          <h4 className="font-bold leading-tight">{otherName}</h4>
          <p className="text-xs text-emerald-200 font-medium">
            {senderRole === 'user' ? 'Rider' : 'Passenger'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50 flex flex-col">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Send a message to start the conversation</p>
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.sender_id === senderId;
          return (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl ${isMe ? 'bg-gray-900 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 shadow-sm rounded-bl-sm'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.content}</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-gray-400 mt-1 px-1">{fmtTime(m.created_at)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100 flex gap-3 shrink-0">
        <input
          type="text" value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-100 rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium"
        />
        <button
          onClick={handleSend}
          disabled={!newMessage.trim()}
          className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 shrink-0 shadow-md disabled:opacity-40 transition-all"
        >
          <Send size={20} className="-ml-0.5" />
        </button>
      </div>
    </motion.div>
  );
};

// ─── Chat History Screen ──────────────────────────────────────────────────────

const ChatHistoryScreen = ({ userId, userName, role = 'user', onBack }: { userId: string; userName: string; role?: 'user' | 'rider'; onBack: () => void }) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openChat, setOpenChat] = useState<ConversationSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // ride_id pending confirm
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetcher = role === 'rider' ? fetchRiderConversations : fetchUserConversations;
    fetcher(userId).then(convos => { setConversations(convos); setLoading(false); });
  }, [userId, role]);

  if (openChat) {
    return (
      <RealtimeChat
        rideId={openChat.ride_id}
        senderId={userId}
        senderRole={role}
        senderName={userName}
        otherName={openChat.other_name}
        onBack={() => setOpenChat(null)}
      />
    );
  }

  const fmtTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Group by other_name: keep most recent entry per person, collect all ride_ids for bulk-delete.
  // conversations is already sorted most-recent-first from the service.
  const grouped: Array<{ convo: ConversationSummary; rideIds: string[] }> = [];
  const seenNames = new Map<string, number>(); // other_name → index in grouped
  for (const c of conversations) {
    const existing = seenNames.get(c.other_name);
    if (existing === undefined) {
      seenNames.set(c.other_name, grouped.length);
      grouped.push({ convo: c, rideIds: [c.ride_id] });
    } else {
      grouped[existing].rideIds.push(c.ride_id);
    }
  }

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col font-sans">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ChevronLeft size={22} />
        </button>
        <h2 className="font-black text-xl text-gray-900">Messages</h2>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 px-8">
          <MessageSquare size={52} className="opacity-20" />
          <p className="font-bold text-gray-500">No conversations yet</p>
          <p className="text-sm text-center">{role === 'rider' ? 'Your chats with passengers will appear here after completing a ride.' : 'Your chats with riders will appear here after booking a ride.'}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {grouped.map(({ convo, rideIds }) => (
            <div key={convo.other_name} className="relative">
              {confirmDelete === convo.other_name ? (
                /* Inline confirm strip */
                <div className="flex items-center justify-between px-5 py-4 bg-red-50">
                  <p className="text-sm font-bold text-red-700">Delete conversation with {convo.other_name}?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setDeleting(convo.other_name);
                        // Delete all ride conversations with this person
                        await Promise.all(rideIds.map(id => deleteConversation(id, userId)));
                        setConversations(prev => prev.filter(c => !rideIds.includes(c.ride_id)));
                        setConfirmDelete(null);
                        setDeleting(null);
                      }}
                      disabled={deleting === convo.other_name}
                      className="px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {deleting === convo.other_name
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center hover:bg-gray-50 transition-colors group">
                  <button
                    onClick={() => setOpenChat(convo)}
                    className="flex items-center gap-4 flex-1 px-5 py-4 text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center font-black text-emerald-700 text-lg shrink-0">
                      {convo.other_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-bold text-gray-900 truncate">{convo.other_name}</span>
                        <span className="text-xs text-gray-400 font-medium shrink-0 ml-2">{fmtTime(convo.last_time)}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate font-medium">{convo.last_message}</p>
                    </div>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={() => setConfirmDelete(convo.other_name)}
                    className="mr-4 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Panel Components ─────────────────────────────────────────────────────────

const HomePanel = ({ setStep, pickup, setPickup, setPickupCoords, dropoff, setDropoff, setDestinationCoords, favorites = [], onSaveFavorite, onRemoveFavorite }: any) => {
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff'>('dropoff');
  const [query, setQuery] = useState(dropoff);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    if (query.length < 3) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        setSuggestions(await res.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const handleFocus = (field: 'pickup' | 'dropoff') => {
    setActiveField(field);
    setQuery(field === 'pickup' ? (pickup === 'Current Location' ? '' : pickup) : dropoff);
    setSuggestions([]);
    setIsExpanded(true);
  };

  const handleSelect = (place: any) => {
    const shortName = place.name || place.display_name.split(',')[0];
    const coords: [number, number] = [parseFloat(place.lat), parseFloat(place.lon)];
    if (activeField === 'pickup') {
      setPickup(shortName); setPickupCoords(coords); setActiveField('dropoff'); setQuery(dropoff);
    } else {
      setDropoff(shortName); setDestinationCoords(coords);
    }
    setIsExpanded(false);
  };

  const handleSaveSuggestion = (place: any) => {
    if (!onSaveFavorite) return;
    onSaveFavorite({
      id: genId(),
      name: place.name || place.display_name.split(',')[0],
      label: place.display_name,
      coords: [parseFloat(place.lat), parseFloat(place.lon)] as [number, number],
    });
  };

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.15, bottom: 0.3 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -35 || info.velocity.y < -300) setIsExpanded(true);
        if (info.offset.y > 35 || info.velocity.y > 300) setIsExpanded(false);
      }}
      className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none pointer-events-auto flex flex-col md:flex-1 md:overflow-y-auto"
    >
      {/* Handle — tap to expand/collapse, drag up/down on mobile */}
      <div
        className="w-full pt-4 pb-3 md:hidden cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={e => { dragControls.start(e); }}
        onClick={() => setIsExpanded(e => !e)}
      >
        <div className="w-10 h-1.5 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-full mx-auto transition-colors" />
      </div>

      <div className="px-5 pb-2 md:px-6 md:pt-6">
        <div className="flex items-center justify-between mb-3 md:mb-5">
          <h2 className="text-[1.35rem] md:text-[1.75rem] font-black tracking-tight leading-tight">Where to?</h2>
          <ChevronLeft size={20} className={`text-gray-300 md:hidden transition-transform duration-200 ${isExpanded ? 'rotate-90' : '-rotate-90'}`} />
        </div>

      {/* Location Inputs */}
      <div className="rounded-2xl overflow-hidden mb-4 border border-gray-100">
        <div
          className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${activeField === 'pickup' ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100/70'}`}
          onClick={() => handleFocus('pickup')}
        >
          <div className="w-2 h-2 rounded-full bg-gray-900 shrink-0" />
          {activeField === 'pickup' ? (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search pickup..." className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-900 placeholder-gray-400" />
          ) : (
            <span className={`text-sm font-medium flex-1 truncate ${pickup ? 'text-gray-900' : 'text-gray-400'}`}>{pickup || 'Set pickup location'}</span>
          )}
        </div>
        <div className="flex items-center px-[19px] bg-gray-50">
          <div className="flex flex-col gap-[3px] py-[3px]">
            <div className="w-px h-1.5 bg-gray-200 mx-auto" />
            <div className="w-px h-1.5 bg-gray-200 mx-auto" />
          </div>
          <div className="flex-1 h-px bg-gray-100 ml-3" />
        </div>
        <div
          className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${activeField === 'dropoff' ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100/70'}`}
          onClick={() => handleFocus('dropoff')}
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          {activeField === 'dropoff' ? (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Where to?" className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-900 placeholder-gray-400" />
          ) : (
            <span className={`text-sm font-medium flex-1 truncate ${dropoff ? 'text-gray-900' : 'text-gray-400'}`}>{dropoff || 'Choose destination'}</span>
          )}
        </div>
      </div>

      {/* Find a Rider button — always visible, active only when destination is set */}
      <button
        onClick={() => dropoff ? setStep('select') : handleFocus('dropoff')}
        className={`w-full py-4 font-black text-[15px] rounded-2xl mb-3 transition-all active:scale-[0.98] ${
          dropoff
            ? 'bg-gray-950 text-white hover:bg-gray-800 shadow-[0_4px_24px_rgba(0,0,0,0.18)]'
            : 'bg-gray-100 text-gray-400 cursor-default'
        }`}
      >
        {dropoff ? 'Find a Rider' : 'Where are you going?'}
      </button>

      {/* Suggestions */}
      {/* Collapsible content — hidden on mobile when collapsed */}
      <AnimatePresence initial={false}>
        {(isExpanded || suggestions.length > 0) && (
          <motion.div
            key="home-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="overflow-hidden md:overflow-visible"
          >
            <div className="max-h-[55vh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] md:max-h-none md:pb-10">
              {suggestions.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
                  {loading && <div className="p-4 text-center text-xs text-gray-400 tracking-wide">Searching...</div>}
                  {suggestions.map((place, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                      <div onClick={() => handleSelect(place)} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer py-0.5">
                        <MapPin size={13} className="text-gray-300 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{place.name || place.display_name.split(',')[0]}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{place.display_name}</p>
                        </div>
                      </div>
                      {onSaveFavorite && !favorites.some((f: any) => f.label === place.display_name) && (
                        <button onClick={e => { e.stopPropagation(); handleSaveSuggestion(place); }} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-300 hover:text-gray-600">
                          <Star size={13} />
                        </button>
                      )}
                      {onSaveFavorite && favorites.some((f: any) => f.label === place.display_name) && (
                        <div className="shrink-0 w-7 h-7 flex items-center justify-center"><Star size={13} className="text-amber-400 fill-amber-400" /></div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!suggestions.length && (
                <>
                  {activeField === 'pickup' && (
                    <div className="flex items-center gap-3 p-3.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                      onClick={() => { setPickup('Current Location'); setPickupCoords(null); setActiveField('dropoff'); setQuery(dropoff); setIsExpanded(false); }}>
                      <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><Navigation size={16} className="text-gray-600" /></div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">Current Location</p>
                        <p className="text-xs text-gray-400 mt-0.5">Use GPS location</p>
                      </div>
                    </div>
                  )}
                  {activeField === 'dropoff' && (
                    <>
                      {favorites.length > 0 && (
                        <>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3.5 mb-2">Saved Places</p>
                          {favorites.map((fav: any) => (
                            <div key={fav.id} className="flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50 rounded-xl transition-colors">
                              <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => { setDropoff(fav.name); setDestinationCoords(fav.coords); setIsExpanded(false); }}>
                                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center shrink-0"><Star size={15} className="text-amber-400 fill-amber-400" /></div>
                                <div>
                                  <p className="font-semibold text-sm text-gray-900">{fav.name}</p>
                                  <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[200px]">{fav.label.split(',').slice(0,2).join(',')}</p>
                                </div>
                              </div>
                              {onRemoveFavorite && (
                                <button onClick={() => onRemoveFavorite(fav.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-300 hover:text-red-400 shrink-0"><X size={13} /></button>
                              )}
                            </div>
                          ))}
                          <div className="h-px bg-gray-100 mx-3.5 my-2" />
                        </>
                      )}
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3.5 mb-2">Quick Destinations</p>
                      <div className="flex items-center gap-3 p-3.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                        onClick={() => { setDropoff('Home'); setDestinationCoords([6.1000, 125.1700]); setIsExpanded(false); }}>
                        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><Home size={16} className="text-gray-600" /></div>
                        <div><p className="font-semibold text-sm text-gray-900">Home</p><p className="text-xs text-gray-400 mt-0.5">General Santos City</p></div>
                      </div>
                      <div className="flex items-center gap-3 p-3.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                        onClick={() => { setDropoff('Work'); setDestinationCoords([6.1164, 125.1716]); setIsExpanded(false); }}>
                        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><Briefcase size={16} className="text-gray-600" /></div>
                        <div><p className="font-semibold text-sm text-gray-900">Work</p><p className="text-xs text-gray-400 mt-0.5">CBD, General Santos</p></div>
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3.5 mt-5 mb-2">Recent</p>
                      <div className="flex items-center gap-3 p-3.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                        onClick={() => { setDropoff('SM City GenSan'); setDestinationCoords([6.1070, 125.1640]); setIsExpanded(false); }}>
                        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><Clock size={16} className="text-gray-400" /></div>
                        <div><p className="font-semibold text-sm text-gray-900">SM City GenSan</p><p className="text-xs text-gray-400 mt-0.5">General Santos City</p></div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
};

const SelectPanel = ({ setStep, selectedRide, setSelectedRide, routeInfo, onBook, pricingConfig }: any) => {
  const distanceM = routeInfo?.distance ?? 0;
  const durationS = routeInfo?.duration ?? 0;
  const durationMin = Math.round(durationS / 60);

  const dynamicRides = RIDE_OPTIONS.map(ride => {
    const breakdown = calculateFare(ride.id as keyof PricingConfig, distanceM, durationS, pricingConfig ?? DEFAULT_PRICING);
    return { ...ride, breakdown, time: durationMin > 0 ? `${durationMin} min` : ride.time };
  });

  const selectedBreakdown = dynamicRides.find(r => r.id === selectedRide)?.breakdown;

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-6 md:pb-8 pointer-events-auto flex flex-col max-h-[80vh] md:max-h-none md:flex-1 md:overflow-y-auto"
    >
      <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-7 md:hidden" />
      <h3 className="text-[1.5rem] font-black tracking-tight mb-5">Choose a ride</h3>
      <div className="flex-1 overflow-y-auto space-y-2.5 mb-5 pb-1">
        {dynamicRides.map((ride) => (
          <div key={ride.id} onClick={() => setSelectedRide(ride.id)}
            className={`flex items-center p-4 rounded-2xl border transition-all cursor-pointer ${selectedRide === ride.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
            <div className={`w-13 h-13 w-[52px] h-[52px] rounded-xl flex items-center justify-center shrink-0 ${selectedRide === ride.id ? 'bg-gray-950 text-white' : 'bg-white text-gray-500 shadow-sm border border-gray-100'}`}>
              <ride.icon size={24} />
            </div>
            <div className="ml-3.5 flex-1">
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-bold text-[15px]">{ride.name}</span>
                <span className="font-black text-[16px]">₱{ride.breakdown.totalFare}</span>
              </div>
              <div className="flex items-center text-xs text-gray-400 font-medium gap-1">
                <Clock size={11} /> {ride.time} away
                <span className="text-gray-200 mx-0.5">·</span>
                <User size={11} /> {ride.capacity}
              </div>
            </div>
            {selectedRide === ride.id && (
              <div className="ml-3 w-4 h-4 rounded-full bg-gray-950 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Fare breakdown for selected tier */}
      {selectedBreakdown && (
        <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Fare Breakdown</p>
          <div className="space-y-2 text-[13px]">
            {[
              { label: 'Base Fare',                    value: selectedBreakdown.baseFare },
              { label: `Distance (${(distanceM/1000).toFixed(1)} km)`, value: selectedBreakdown.distanceFee },
              { label: `Time (${durationMin} min)`,    value: selectedBreakdown.timeFee },
              { label: 'Booking Fee',                  value: selectedBreakdown.bookingFee },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-gray-500">
                <span>{row.label}</span>
                <span>₱{row.value}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-black text-gray-900 text-sm">
              <span>Total</span>
              <span>₱{selectedBreakdown.totalFare}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3.5 bg-gray-50 rounded-2xl mb-5 border border-gray-100">
        <div className="flex items-center gap-2.5">
          <CreditCard size={15} className="text-gray-400" />
          <span className="font-semibold text-sm">GCash</span>
        </div>
        <MoreHorizontal size={17} className="text-gray-300" />
      </div>
      <button
        onClick={() => {
          const bd = dynamicRides.find(r => r.id === selectedRide)?.breakdown;
          if (onBook) onBook(Date.now().toString(), bd);
          else { setStep('searching'); setTimeout(() => setStep('matched'), 3500); }
        }}
        className="w-full bg-gray-950 text-white font-bold text-[15px] py-[17px] rounded-2xl hover:bg-gray-800 transition-colors active:scale-[0.98] shadow-lg shadow-black/20"
      >
        Book {dynamicRides.find(r => r.id === selectedRide)?.name}
      </button>
    </motion.div>
  );
};

const SearchingPanel = () => (
  <motion.div
    initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none px-6 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-16 pointer-events-auto flex flex-col items-center justify-center min-h-[38vh] md:min-h-0 md:flex-1"
  >
    <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-10 md:hidden" />
    <div className="relative w-[72px] h-[72px] mb-8">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="absolute rounded-full border border-gray-900/[0.08] animate-ping"
          style={{
            inset: `-${i * 14}px`,
            animationDuration: '2.4s',
            animationDelay: `${i * 0.55}s`,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-gray-950 rounded-full flex items-center justify-center shadow-xl z-10">
        <Search size={24} className="text-white" />
      </div>
    </div>
    <h3 className="text-[1.35rem] font-black tracking-tight text-gray-950">Finding your driver</h3>
    <p className="text-gray-400 text-sm font-medium mt-1.5">Connecting to nearby drivers</p>
    <div className="flex gap-1.5 mt-6">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
    </div>
  </motion.div>
);

const MatchedPanel = ({ onCancel, selectedRide, routeInfo, showNotification, activeRider, fareBreakdown, pricingConfig, rideId, userId, userName }: any) => {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [riderReviews, setRiderReviews] = useState<{ rating: number; comment: string | null; user_name: string | null; completed_at: string }[]>([]);

  useEffect(() => {
    if (!activeRider?.id) return;
    (async () => {
      const { data: rides } = await supabase
        .from('rides')
        .select('id, rating, comment, completed_at, user_id')
        .eq('rider_id', activeRider.id)
        .gte('rating', 4)
        .order('completed_at', { ascending: false })
        .limit(20);
      if (!rides || rides.length === 0) return;
      const userIds = [...new Set(rides.map((r: any) => r.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('id, first_name').in('id', userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const mapped = rides.map((r: any) => ({
        rating: r.rating,
        comment: r.comment,
        completed_at: r.completed_at,
        user_name: profileMap.get(r.user_id)?.first_name ?? 'Passenger',
      }));
      // Prioritize reviews with comments, then sort by newest, take top 3
      const withComment = mapped.filter(r => r.comment);
      const withoutComment = mapped.filter(r => !r.comment);
      setRiderReviews([...withComment, ...withoutComment].slice(0, 3));
    })();
  }, [activeRider?.id]);

  const activeFare: FareBreakdown = fareBreakdown ?? calculateFare(
    selectedRide as keyof PricingConfig,
    routeInfo?.distance ?? 0,
    routeInfo?.duration ?? 0,
    pricingConfig ?? DEFAULT_PRICING,
  );

  if (isChatOpen) {
    const riderName = activeRider
      ? `${activeRider.first_name || ''} ${activeRider.last_name || ''}`.trim()
      : 'Rider';
    return (
      <RealtimeChat
        rideId={rideId ?? 'unknown'}
        senderId={userId}
        senderRole="user"
        senderName={userName}
        otherName={riderName}
        otherAvatar={activeRider?.avatar_url}
        onBack={() => setIsChatOpen(false)}
      />
    );
  }

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none pointer-events-auto flex flex-col md:flex-1 md:overflow-y-auto"
    >
      {/* Handle + always-visible header — tap to expand/collapse */}
      <button
        onClick={() => setIsExpanded(e => !e)}
        className="w-full pt-4 pb-4 px-6 text-left md:hidden"
      >
        <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5">On the way</p>
            <h3 className="text-xl font-black tracking-tight leading-tight">Arriving in 4 min</h3>
            <p className="text-gray-400 text-xs font-medium mt-0.5">
              {activeRider ? `${activeRider.vehicle_make || ''} ${activeRider.vehicle_model || ''}`.trim() || 'Vehicle' : 'Toyota Vios'} · {activeRider?.vehicle_plate || 'ABC 1234'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-gray-950 text-white text-sm font-black px-3 py-1.5 rounded-xl">₱{activeFare.totalFare}</div>
            <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : '-rotate-90'}`} />
          </div>
        </div>
      </button>

      {/* Full details — collapsible on mobile, always visible on desktop */}
      <AnimatePresence initial={false}>
        {(isExpanded) && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-8 md:pt-6">
              {/* ETA header (desktop only — already shown in handle on mobile) */}
              <div className="hidden md:flex items-start justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">On the way</p>
                  <h3 className="text-[1.75rem] font-black tracking-tight leading-tight">Arriving in 4 min</h3>
                  <p className="text-gray-400 text-sm font-medium mt-0.5">
                    {activeRider ? `${activeRider.vehicle_make || ''} ${activeRider.vehicle_model || ''}`.trim() || 'Vehicle' : 'Toyota Vios'} · {activeRider?.vehicle_plate || 'ABC 1234'}
                  </p>
                </div>
                <div className="bg-gray-950 text-white text-sm font-black px-4 py-2 rounded-xl shrink-0">₱{activeFare.totalFare}</div>
              </div>
              {/* Driver card */}
              <div className="flex items-center gap-3.5 p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-5">
                <div className="w-[52px] h-[52px] bg-gray-200 rounded-full overflow-hidden shrink-0">
                  {activeRider?.avatar_url ? (
                    <img src={activeRider.avatar_url} alt="Driver" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-black text-gray-400">{activeRider?.first_name?.[0] || 'D'}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-[15px] truncate">{activeRider ? `${activeRider.first_name || ''} ${activeRider.last_name || ''}`.trim() : 'Juan Dela Cruz'}</h4>
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <Star size={11} className="text-amber-400 fill-amber-400" />
                    <span>4.9</span>
                    <span className="text-gray-200">·</span>
                    <span>1.2k rides</span>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-500 mt-0.5 truncate">{activeRider?.vehicle_make} {activeRider?.vehicle_model} · {activeRider?.vehicle_plate}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => setIsChatOpen(true)}
                    className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                    <MessageSquare size={16} />
                  </button>
                  <button className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                    <Phone size={16} />
                  </button>
                </div>
              </div>
              {/* Fare breakdown */}
              <div className="mb-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Fare Breakdown</p>
                <div className="space-y-2 text-[13px]">
                  {[
                    { label: 'Base Fare',   value: activeFare.baseFare },
                    { label: 'Distance',    value: activeFare.distanceFee },
                    { label: 'Time',        value: activeFare.timeFee },
                    { label: 'Booking Fee', value: activeFare.bookingFee },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between text-gray-500">
                      <span>{row.label}</span><span>₱{row.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-black text-gray-900 text-sm">
                    <span>Total</span><span>₱{activeFare.totalFare}</span>
                  </div>
                </div>
              </div>
              {riderReviews.length > 0 && (
                <div className="mb-6 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Reviews</p>
                  <div className="space-y-3">
                    {riderReviews.map((r, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs text-gray-600 shrink-0">{(r.user_name || 'P')[0].toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}
                          </div>
                          {r.comment && <p className="text-sm text-gray-700">"{r.comment}"</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{r.user_name} · {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {showCancelConfirm ? (
                <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                  <h4 className="font-black text-sm text-red-800 mb-1">Cancel your ride?</h4>
                  <p className="text-red-500 text-xs mb-4">You may be charged a small cancellation fee if the driver is already on the way.</p>
                  <div className="flex gap-2.5">
                    <button onClick={() => setShowCancelConfirm(false)} className="flex-1 bg-white text-gray-700 font-bold py-3 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 transition-colors">Keep Ride</button>
                    <button onClick={onCancel} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-red-700 transition-colors">Yes, Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button className="flex-1 bg-gray-100 text-gray-700 font-bold py-4 rounded-2xl text-sm hover:bg-gray-200 transition-colors">Share ETA</button>
                  <button onClick={() => setShowCancelConfirm(true)} className="flex-1 bg-red-50 text-red-500 font-bold py-4 rounded-2xl text-sm hover:bg-red-100 transition-colors">Cancel</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop: always show actions */}
      <div className="hidden md:block px-6 pb-8">
        {showCancelConfirm ? (
          <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
            <h4 className="font-black text-sm text-red-800 mb-1">Cancel your ride?</h4>
            <p className="text-red-500 text-xs mb-4">You may be charged a small cancellation fee if the driver is already on the way.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 bg-white text-gray-700 font-bold py-3 rounded-xl border border-gray-200 text-sm">Keep Ride</button>
              <button onClick={onCancel} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm">Yes, Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button className="flex-1 bg-gray-100 text-gray-700 font-bold py-4 rounded-2xl text-sm">Share ETA</button>
            <button onClick={() => setShowCancelConfirm(true)} className="flex-1 bg-red-50 text-red-500 font-bold py-4 rounded-2xl text-sm">Cancel</button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ─── Rating Panel ─────────────────────────────────────────────────────────────

const RatingPanel = ({ rider, rideId, onDone }: { key?: string; rider: any; rideId?: string | null; onDone: () => void }) => {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const quickTags = ['Friendly', 'Safe Driver', 'On Time', 'Clean Vehicle', 'Professional'];

  const handleSubmit = async () => {
    if (rating === 0) return;
    // Update the rating on the completed ride row
    if (rideId) {
      await supabase.from('rides').update({
        rating,
        comment: comment.trim() || null,
      }).eq('id', rideId);
    }
    setSubmitted(true);
    setTimeout(onDone, 1800);
  };

  const riderName = rider ? `${rider.first_name || ''} ${rider.last_name || ''}`.trim() : 'Your Rider';

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none p-8 pointer-events-auto flex flex-col items-center justify-center gap-4 md:flex-1 h-72"
      >
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
          className="w-16 h-16 bg-gray-950 rounded-2xl flex items-center justify-center"
        >
          <CheckCircle size={28} className="text-white" />
        </motion.div>
        <h3 className="text-[1.3rem] font-black tracking-tight text-gray-950">Thanks for rating!</h3>
        <p className="text-gray-400 text-sm text-center">Your feedback helps improve the community.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[28px] md:rounded-none shadow-[0_-1px_0_rgba(0,0,0,0.06),0_-20px_60px_rgba(0,0,0,0.08)] md:shadow-none p-6 pb-8 pointer-events-auto flex flex-col gap-5 md:flex-1 md:overflow-y-auto"
    >
      <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto md:hidden" />

      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full overflow-hidden mx-auto mb-3 ring-4 ring-gray-50">
          {rider?.avatar_url
            ? <img src={rider.avatar_url} alt="Rider" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-xl font-black text-gray-400">{rider?.first_name?.[0] || 'R'}</div>
          }
        </div>
        <h3 className="text-[1.25rem] font-black tracking-tight text-gray-950">Rate your ride</h3>
        <p className="text-gray-400 text-sm mt-0.5">How was your trip with <span className="text-gray-700 font-semibold">{riderName}</span>?</p>
      </div>

      {/* Stars */}
      <div className="flex justify-center gap-2.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              size={36}
              className={`transition-colors ${star <= (hovered || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-150 fill-gray-100'}`}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <p className="text-center text-[13px] font-semibold text-gray-400 -mt-3">
          {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}
        </p>
      )}

      {/* Quick tags (shown for 4-5 star ratings) */}
      {rating >= 4 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {quickTags.map(tag => (
            <button
              key={tag}
              onClick={() => setComment(prev => prev.includes(tag) ? prev.replace(tag, '').replace(/^,\s*|,\s*$|,\s*,/g, '').trim() : prev ? `${prev}, ${tag}` : tag)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${comment.includes(tag) ? 'bg-gray-950 text-white border-gray-950' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Comment */}
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        rows={3}
        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none transition-all placeholder-gray-300"
      />

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onDone} className="flex-1 py-[15px] rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors">
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={rating === 0}
          className="flex-1 py-[15px] rounded-2xl bg-gray-950 text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Submit
        </button>
      </div>
    </motion.div>
  );
};

// ─── Ride History Screen ──────────────────────────────────────────────────────

interface RideRecord {
  id: string;
  pickup_label: string;
  dropoff_label: string;
  fare: number;
  fare_breakdown: FareBreakdown | null;
  ride_type: string;
  rider_name: string | null;
  rider_avatar: string | null;
  vehicle_info: string | null;
  status: string;
  completed_at: string;
  rating?: number | null;
}

const RideHistoryScreen = ({ userId, onBack }: { userId: string; onBack: () => void }) => {
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const fetchRides = async () => {
      setLoading(true);
      const dayStart = `${selectedDate}T00:00:00.000Z`;
      const dayEnd   = `${selectedDate}T23:59:59.999Z`;
      const { data: rideData } = await supabase
        .from('rides')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', dayStart)
        .lte('completed_at', dayEnd)
        .order('completed_at', { ascending: false });

      setRides(rideData ?? []);
      setLoading(false);
    };
    fetchRides();
  }, [userId, selectedDate]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const tierLabel: Record<string, string> = { moto: 'Motorcycle', eco: 'Economy', premium: 'Premium' };
  const totalSpent = rides.reduce((s, r) => s + (r.fare || 0), 0);

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-gray-900">Ride History</h2>
          <p className="text-xs text-gray-400 font-medium">{rides.length} trip{rides.length !== 1 ? 's' : ''}{rides.length > 0 ? ` · ₱${totalSpent} spent` : ''}</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => { setSelectedDate(e.target.value); setExpanded(null); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Date label */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5">
        <p className="text-[12px] font-semibold text-gray-500">
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 px-8 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <Clock size={36} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-semibold">No rides yet</p>
            <p className="text-gray-400 text-sm">Your completed trips will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rides.map((ride) => {
              const isOpen = expanded === ride.id;
              return (
                <div key={ride.id} className="bg-white">
                  <button
                    onClick={() => setExpanded(isOpen ? null : ride.id)}
                    className="w-full px-4 py-4 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-emerald-100 overflow-hidden flex items-center justify-center shrink-0 border-2 border-emerald-200">
                      {ride.rider_avatar
                        ? <img src={ride.rider_avatar} alt="Rider" className="w-full h-full object-cover" />
                        : <Navigation size={20} className="text-emerald-600" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{ride.dropoff_label}</p>
                          {ride.rider_name && (
                            <p className="text-xs text-gray-500 font-semibold mt-0.5 truncate">{ride.rider_name}</p>
                          )}
                          <p className="text-xs text-gray-400 font-medium mt-0.5">{formatDate(ride.completed_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-gray-900 text-base">₱{ride.fare}</p>
                          <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                            {tierLabel[ride.ride_type] ?? ride.ride_type}
                          </span>
                        </div>
                      </div>

                      {/* Rating stars */}
                      {ride.rating != null && (
                        <div className="flex items-center gap-0.5 mt-1.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} size={12} className={s <= ride.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
                          ))}
                        </div>
                      )}
                    </div>

                    <ChevronLeft size={16} className={`text-gray-400 shrink-0 mt-1 transition-transform ${isOpen ? '-rotate-90' : 'rotate-180'}`} />
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3 bg-gray-50 border-t border-gray-100">
                          {/* Route */}
                          <div className="pt-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium">Pickup</p>
                                <p className="text-sm font-semibold text-gray-700">{ride.pickup_label}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium">Dropoff</p>
                                <p className="text-sm font-semibold text-gray-700">{ride.dropoff_label}</p>
                              </div>
                            </div>
                          </div>

                          {/* Rider info */}
                          {ride.rider_name && (
                            <div className="flex items-center gap-2 pt-1">
                              <Navigation size={14} className="text-gray-400 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium">Rider</p>
                                <p className="text-sm font-semibold text-gray-700">{ride.rider_name}</p>
                                {ride.vehicle_info && <p className="text-xs text-gray-400 font-medium">{ride.vehicle_info}</p>}
                              </div>
                            </div>
                          )}

                          {/* Fare breakdown */}
                          {ride.fare_breakdown && (
                            <div className="bg-white rounded-2xl p-3 border border-gray-100 space-y-1.5">
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fare Breakdown</p>
                              {[
                                ['Base Fare', ride.fare_breakdown.baseFare],
                                ['Distance Fee', ride.fare_breakdown.distanceFee],
                                ['Time Fee', ride.fare_breakdown.timeFee],
                                ['Booking Fee', ride.fare_breakdown.bookingFee],
                              ].map(([label, amount]) => (
                                <div key={label as string} className="flex justify-between text-sm">
                                  <span className="text-gray-500 font-medium">{label}</span>
                                  <span className="text-gray-700 font-semibold">₱{amount}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm border-t border-gray-100 pt-1.5 mt-1.5">
                                <span className="font-bold text-gray-900">Total</span>
                                <span className="font-black text-emerald-600">₱{ride.fare_breakdown.totalFare}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
