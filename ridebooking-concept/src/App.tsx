import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center font-sans">
    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl mb-5">
      <Car size={32} className="text-white" />
    </div>
    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Login Screen ─────────────────────────────────────────────────────────────

const LoginScreen = () => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="relative w-full h-screen bg-gray-900 flex flex-col items-center justify-center font-sans overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="relative z-10 flex flex-col items-center px-8 w-full max-w-sm"
      >
        <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/40 mb-6">
          <Car size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight mb-2">Fetch</h1>
        <p className="text-gray-400 font-medium mb-12 text-center">Your ride, on demand.</p>

        <button
          onClick={async () => { setLoading(true); await signInWithGoogle(); setLoading(false); }}
          disabled={loading}
          className="w-full bg-white text-gray-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors shadow-xl disabled:opacity-60"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <p className="text-gray-600 text-xs mt-8 text-center">
          By continuing, you agree to our Terms of Service and Privacy Policy.
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
    <div className="w-full min-h-screen bg-gray-50 flex flex-col items-center justify-center font-sans p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl mx-auto mb-5">
            <Car size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
            Welcome, {profile.full_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-gray-500 font-medium">How will you be using Fetch?</p>
        </div>

        {/* Role Cards */}
        <div className="space-y-4">
          {/* Passenger */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('user')}
            disabled={!!loading}
            className="w-full bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all text-left flex items-center gap-5 disabled:opacity-60"
          >
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
              <MapPin size={28} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">I'm a Passenger</h2>
              <p className="text-gray-500 text-sm font-medium">Book rides to get around the city quickly and safely.</p>
            </div>
            {loading === 'user' && <div className="ml-auto w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          </motion.button>

          {/* Rider */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('rider')}
            disabled={!!loading}
            className="w-full bg-white rounded-3xl p-6 border-2 border-gray-100 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all text-left flex items-center gap-5 disabled:opacity-60"
          >
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0">
              <Navigation size={28} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">I'm a Rider / Driver</h2>
              <p className="text-gray-500 text-sm font-medium">Accept trips, earn money, and be your own boss.</p>
            </div>
            {loading === 'rider' && <div className="ml-auto w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          </motion.button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8 font-medium">You can contact support to change your role later.</p>
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
    <div className="w-full min-h-screen bg-gray-100 font-sans overflow-y-auto">
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-screen md:shadow-xl">
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
      className="w-full min-h-screen bg-gray-100 font-sans overflow-y-auto"
    >
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-screen md:shadow-xl">
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

// ─── User App (Ridebooking) ───────────────────────────────────────────────────

const UserApp = ({ profile: initialProfile }: { profile: Profile }) => {
  const [currentProfile, setCurrentProfile] = useState<Profile>(initialProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [step, setStep] = useState<'home' | 'select' | 'searching' | 'matched'>('home');
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

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleCancelBooking = (broadcast = false) => {
    if (broadcast && currentRideId) {
       supabase.channel('rides').send({ type: 'broadcast', event: 'CANCEL_RIDE', payload: { rideId: currentRideId } });
    }
    setStep('home');
    setPickup('Current Location');
    setPickupCoords(null);
    setDropoff('');
    setDestinationCoords(null);
    setCurrentRideId(null);
    setActiveRider(null);
  };

  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setDeviceLocation([pos.coords.latitude, pos.coords.longitude]),
        () => setDeviceLocation([14.5547, 121.0244]),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
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
      }
    });

    channel.on('broadcast', { event: 'RIDER_ARRIVED' }, (payload) => {
      if (payload.payload.rideId === currentRideId) {
         showNotification('Your rider has arrived at the pickup location!');
      }
    });

    channel.on('broadcast', { event: 'RIDE_COMPLETED' }, (payload) => {
      if (payload.payload.rideId === currentRideId) {
         showNotification('Ride completed. Thank you!');
         handleCancelBooking();
      }
    });

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentRideId]);

  useEffect(() => {
    if (startLoc && endLoc && step !== 'home') {
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

  return (
    <div className="w-full h-screen overflow-hidden flex flex-col md:flex-row font-sans text-gray-900">
      <NotificationToast message={notification} />

      {/* ── Sidebar (desktop) / Floating UI (mobile) ── */}
      <div className="
        absolute inset-0 z-20 pointer-events-none
        md:relative md:inset-auto md:w-[420px] md:flex md:flex-col md:shrink-0
        md:bg-white md:shadow-[4px_0_24px_rgba(0,0,0,0.1)] md:z-20 md:pointer-events-auto md:overflow-hidden
      ">
        {/* Top Nav — floating on mobile, header on desktop */}
        <div className="
          absolute top-0 inset-x-0 z-20 p-4 flex justify-between items-center pointer-events-none
          md:relative md:flex-none md:border-b md:border-gray-100 md:bg-white md:pointer-events-auto md:z-auto
        ">
          {step === 'home' ? (
            <button className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto md:shadow-none md:border md:border-gray-200">
              <Menu size={22} />
            </button>
          ) : (
            <button onClick={() => setStep('home')} className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto md:shadow-none md:border md:border-gray-200">
              <ChevronLeft size={22} />
            </button>
          )}

          <button
            onClick={() => setShowProfile(true)}
            className="w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden border-2 border-white cursor-pointer hover:scale-105 transition-transform pointer-events-auto"
          >
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <User size={22} className="text-gray-600" />}
          </button>
        </div>

        {/* Panel slot — bottom sheet on mobile, fills sidebar on desktop */}
        <div className="
          absolute bottom-0 inset-x-0 pointer-events-none
          md:relative md:inset-auto md:flex-1 md:overflow-hidden md:flex md:flex-col
        ">
          <AnimatePresence mode="wait">
            {step === 'home' && (
              <HomePanel key="home" setStep={setStep} pickup={pickup} setPickup={setPickup}
                setPickupCoords={setPickupCoords} dropoff={dropoff} setDropoff={setDropoff}
                setDestinationCoords={setDestinationCoords} />
            )}
            {step === 'select' && (
              <SelectPanel key="select" setStep={setStep} selectedRide={selectedRide}
                setSelectedRide={setSelectedRide} routeInfo={routeInfo} 
                onBook={(rideId: string, fare: number) => {
                  setStep('searching');
                  setCurrentRideId(rideId);
                  supabase.channel('rides').send({
                    type: 'broadcast',
                    event: 'REQUEST_RIDE',
                    payload: {
                      rideId,
                      user: currentProfile,
                      pickup: { label: pickup, coords: pickupCoords || deviceLocation },
                      dropoff: { label: dropoff, coords: destinationCoords },
                      fare
                    }
                  });
                }} />
            )}
            {step === 'searching' && <SearchingPanel key="search" />}
            {step === 'matched' && (
              <MatchedPanel key="matched" onCancel={() => handleCancelBooking(true)} activeRider={activeRider}
                selectedRide={selectedRide} routeInfo={routeInfo} showNotification={showNotification} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Map — full screen behind on mobile, fills right on desktop */}
      <div className="absolute inset-0 z-0 md:relative md:inset-auto md:flex-1">
        <MapContainer center={startLoc} zoom={15} zoomControl={false} className="w-full h-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <Marker 
            position={startLoc} 
            icon={currentLocationIcon} 
            draggable={step === 'home' || step === 'select'}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                setPickupCoords([position.lat, position.lng]);
                setPickup('Pinned location');
              }
            }}
          />
          {endLoc && step !== 'home' && (
            <>
              <Marker 
                position={endLoc} 
                icon={destinationIcon} 
                draggable={step === 'select'}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    setDestinationCoords([position.lat, position.lng]);
                    setDropoff('Pinned location');
                  }
                }}
              />
              {routeCoords && <Polyline positions={routeCoords} color="#10b981" weight={5} />}
            </>
          )}
          <MapBounds start={startLoc} routeCoords={routeCoords} step={step} />
        </MapContainer>
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
      className="w-full min-h-screen bg-gray-100 font-sans overflow-y-auto"
    >
      <div className="max-w-2xl mx-auto bg-gray-50 min-h-screen md:shadow-xl">
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

const RiderActiveRide = ({ request, onComplete, onArrive }: { request: any, onComplete: () => void, onArrive: () => void }) => {
  const [riderCoords, setRiderCoords] = useState<[number, number] | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [ridePhase, setRidePhase] = useState<'pickup' | 'dropoff'>('pickup');
  const targetCoords = ridePhase === 'pickup' ? request.pickup.coords : request.dropoff.coords;
  const pickupCoords = request.pickup.coords;

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setRiderCoords([pos.coords.latitude, pos.coords.longitude]),
      () => setRiderCoords([6.1164, 125.1716]), // fallback: GenSan city center
    );
  }, []);

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

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900 font-sans">
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

      {/* Bottom Panel */}
      <div className="bg-white rounded-t-3xl px-6 pt-5 pb-8 shadow-2xl">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* User + fare */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-black text-blue-600 text-lg">
            {request.user?.first_name?.[0] || request.user?.email?.[0] || 'U'}
          </div>
          <div className="flex-1">
            <p className="font-black text-gray-900 text-base">{request.user?.first_name} {request.user?.last_name || ''}</p>
            <p className="text-xs text-gray-400 font-medium">Passenger</p>
          </div>
          <div className="text-right">
            <p className="font-black text-2xl text-emerald-600">₱{request.fare}</p>
            <div className="flex items-center gap-2 justify-end text-xs text-gray-400 font-medium">
              <span>{distanceLabel}</span>
              <span>·</span>
              <span>{durationLabel} away</span>
            </div>
          </div>
        </div>

        {/* Route */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-5 space-y-3">
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

        <button
          onClick={() => {
            if (ridePhase === 'pickup') {
              setRidePhase('dropoff');
              if (onArrive) onArrive();
            } else {
              onComplete();
            }
          }}
          className={`w-full py-4 text-white font-black text-base rounded-2xl transition-all shadow-lg ${
            ridePhase === 'pickup' 
              ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/30' 
              : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'
          }`}
        >
          {ridePhase === 'pickup' ? 'Arrive at Pickup' : 'Complete Ride'}
        </button>
      </div>
    </div>
  );
};

// ─── Rider Dashboard ──────────────────────────────────────────────────────────

const RiderDashboard = ({ profile: initialProfile }: { profile: Profile }) => {
  const [currentProfile, setCurrentProfile] = useState<Profile>(initialProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [hasRequest, setHasRequest] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [currentRequest, setCurrentRequest] = useState<any>(null);

  useEffect(() => {
    if (currentProfile.rider_status !== 'approved') setIsOnline(false);
  }, [currentProfile.rider_status]);

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
       setIncomingRequests(prev => [...prev, payload.payload]);
    });
    channel.on('broadcast', { event: 'CANCEL_RIDE' }, (payload) => {
       setIncomingRequests(prev => prev.filter(req => req.rideId !== payload.payload.rideId));
       // If currently displaying this request, drop it
       setCurrentRequest((current: any) => {
          if (current?.rideId === payload.payload.rideId) {
             setHasRequest(false);
             setRequestAccepted(false);
             alert('The passenger cancelled the ride.');
             return null;
          }
          return current;
       });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOnline]);

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

  if (requestAccepted && currentRequest) {
    return (
      <RiderActiveRide 
        request={currentRequest}
        onComplete={() => {
          supabase.channel('rides').send({ type: 'broadcast', event: 'RIDE_COMPLETED', payload: { rideId: currentRequest.rideId } });
          setRequestAccepted(false);
          setCurrentRequest(null);
          setHasRequest(false);
        }}
        onArrive={() => {
          supabase.channel('rides').send({ type: 'broadcast', event: 'RIDER_ARRIVED', payload: { rideId: currentRequest.rideId } });
        }}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Car size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-black text-lg text-gray-900 leading-none">Fetch Driver</h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">{currentProfile.full_name || currentProfile.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full text-xs font-black ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
          <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-emerald-400 transition-colors">
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-gray-200 flex items-center justify-center"><User size={18} className="text-gray-500" /></div>}
          </button>
          <div className="relative group">
            <div className="w-8 h-8 flex items-center justify-center cursor-pointer text-gray-400 hover:text-red-500 transition-colors">
              <LogOut size={18} />
            </div>
            <button
              onClick={() => signOut()}
              className="absolute right-0 top-10 bg-white shadow-lg rounded-xl px-4 py-2 text-sm font-bold text-red-500 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-6 space-y-5">
        {/* Go Online Toggle */}
        {currentProfile.rider_status !== 'approved' ? (
          <div className="rounded-3xl p-6 text-center bg-white border border-gray-100 shadow-sm">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${currentProfile.rider_status === 'pending' ? 'bg-yellow-100' : currentProfile.rider_status === 'rejected' ? 'bg-red-100' : 'bg-gray-100'}`}>
              {currentProfile.rider_status === 'pending'
                ? <AlertCircle size={24} className="text-yellow-500" />
                : currentProfile.rider_status === 'rejected'
                ? <AlertCircle size={24} className="text-red-500" />
                : <AlertCircle size={24} className="text-gray-400" />}
            </div>
            <h2 className="text-gray-900 font-black text-xl mb-1">Account Not Approved</h2>
            <p className="text-gray-500 text-sm font-medium mb-2">
              {currentProfile.rider_status === 'pending'
                ? 'Your account is under review. Please wait for admin approval.'
                : currentProfile.rider_status === 'rejected'
                ? 'Your application was rejected. Please update your documents and resubmit.'
                : 'Submit your documents to get verified before going online.'}
            </p>
            <button
              onClick={() => setShowProfile(true)}
              className="mt-3 w-full py-3.5 rounded-2xl font-black text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {currentProfile.rider_status === 'rejected' ? 'Update & Resubmit' : 'View Profile'}
            </button>
          </div>
        ) : (
          <motion.div
            className={`rounded-3xl p-6 text-center shadow-sm border transition-colors ${isOnline ? 'bg-emerald-500 border-emerald-400' : 'bg-white border-gray-100'}`}
            layout
          >
            {isOnline ? (
              <>
                <div className="w-4 h-4 bg-white rounded-full animate-pulse mx-auto mb-3" />
                <h2 className="text-white font-black text-xl mb-1">You're Online</h2>
                <p className="text-emerald-100 text-sm font-medium mb-5">Waiting for ride requests nearby...</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Navigation size={24} className="text-gray-400" />
                </div>
                <h2 className="text-gray-900 font-black text-xl mb-1">You're Offline</h2>
                <p className="text-gray-500 text-sm font-medium mb-5">Go online to start receiving ride requests.</p>
              </>
            )}
            <button
              onClick={() => setIsOnline(prev => !prev)}
              className={`w-full py-4 rounded-2xl font-black text-base transition-colors ${isOnline ? 'bg-white text-emerald-600 hover:bg-emerald-50' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </motion.div>
        )}

        {/* Incoming Request */}
        <AnimatePresence>
          {hasRequest && !requestAccepted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 border-2 border-emerald-400 shadow-xl shadow-emerald-100"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-600 font-black text-sm uppercase tracking-wide">New Ride Request</span>
              </div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center font-black text-blue-600 text-lg">
                  {currentRequest?.user?.first_name?.[0] || 'U'}
                </div>
                <div>
                  <h3 className="font-black text-gray-900">{currentRequest?.user?.first_name} {currentRequest?.user?.last_name || ''}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" /> 4.8 • 24 trips
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className="font-black text-2xl text-emerald-600">₱{currentRequest?.fare}</p>
                  <p className="text-xs text-gray-400 font-medium">3.2 km away</p>
                </div>
              </div>
              <div className="space-y-2 mb-5 bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-sm font-medium text-gray-700">{currentRequest?.pickup?.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-sm font-medium text-gray-700">{currentRequest?.dropoff?.label}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setHasRequest(false);
                    setCurrentRequest(null);
                  }}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={() => { 
                    setRequestAccepted(true);
                    setHasRequest(false);
                    supabase.channel('rides').send({ type: 'broadcast', event: 'RIDE_ACCEPTED', payload: { rideId: currentRequest.rideId, rider: currentProfile } });
                  }}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-600 transition-colors shadow-md"
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
            { label: "Today's Trips", value: '3', icon: Car, color: 'blue' },
            { label: "Earnings", value: '₱285', icon: DollarSign, color: 'emerald' },
            { label: "Rating", value: '4.9', icon: Star, color: 'yellow' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 bg-${color}-50`}>
                <Icon size={18} className={`text-${color}-500`} />
              </div>
              <p className="font-black text-lg text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Recent Trips */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="font-black text-gray-800">Recent Trips</h3>
          </div>
          {[
            { from: 'SM City', to: 'KCC Mall', fare: '₱120', time: '10:30 AM', rating: 5 },
            { from: 'Robinsons', to: 'City Hall', fare: '₱95', time: '09:10 AM', rating: 5 },
            { from: 'Airport', to: 'Gaisano', fare: '₱70', time: '08:00 AM', rating: 4 },
          ].map((t, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between border-b border-gray-50 last:border-0">
              <div>
                <p className="font-bold text-sm text-gray-800">{t.from} → {t.to}</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">{t.time}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-emerald-600">{t.fare}</p>
                <div className="flex justify-end mt-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={10} className="text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Admin / Super Admin Dashboard ───────────────────────────────────────────

type AdminTab = 'live' | 'drivers' | 'analytics' | 'finances' | 'users' | 'riders';

const AdminDashboard = ({ profile, isSuperAdmin }: { profile: Profile, isSuperAdmin: boolean }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('live');
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [riders, setRiders] = useState<Profile[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [selectedRider, setSelectedRider] = useState<Profile | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    if (activeTab === 'users' && isSuperAdmin && allUsers.length === 0) {
      setUsersLoading(true);
      supabase.rpc('get_all_profiles').then(({ data }) => {
        setAllUsers((data as Profile[]) || []);
        setUsersLoading(false);
      });
    }
    if (activeTab === 'riders') {
      setRidersLoading(true);
      getRiderProfiles().then(data => { setRiders(data); setRidersLoading(false); });
    }
  }, [activeTab, isSuperAdmin]);

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
    ...(isSuperAdmin ? [{ id: 'users' as AdminTab, label: 'User Management', icon: Settings }] : []),
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans text-gray-900">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield className="text-emerald-400" size={22} />
            <div>
              <h1 className="font-black text-base leading-none">{isSuperAdmin ? 'Super Admin' : 'Admin'}</h1>
              <p className="text-xs text-slate-400 mt-0.5 font-medium truncate max-w-[130px]">{profile.full_name || profile.email}</p>
            </div>
          </div>
          {profile.avatar_url && (
            <img src={profile.avatar_url} alt="avatar" className="w-9 h-9 rounded-full border-2 border-slate-700" />
          )}
        </div>

        <div className="flex-1 py-4 px-3 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${activeTab === id ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-slate-800 text-gray-400'}`}
            >
              <Icon size={18} />
              <span className="font-bold text-sm">{label}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-red-900/40 text-gray-300 hover:text-red-400 py-3 rounded-xl transition-colors font-bold text-sm"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto">

          {/* Live Operations */}
          {activeTab === 'live' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-slate-800">Live Operations</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {[
                  { label: 'Active Rides', value: '1,204', icon: Car, bg: 'bg-blue-50', color: 'text-blue-600' },
                  { label: 'Online Drivers', value: '849', icon: Users, bg: 'bg-emerald-50', color: 'text-emerald-600' },
                  { label: 'Revenue (Today)', value: '₱342.5k', icon: CreditCard, bg: 'bg-purple-50', color: 'text-purple-600' },
                ].map(({ label, value, icon: Icon, bg, color }) => (
                  <div key={label} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div className={`w-12 h-12 ${bg} ${color} rounded-2xl flex items-center justify-center mb-4`}><Icon size={24} /></div>
                    <p className="text-gray-500 font-bold mb-1">{label}</p>
                    <h3 className="text-4xl font-black text-slate-800">{value}</h3>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">System Map</h3>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Live
                  </span>
                </div>
                <div className="h-[400px] w-full">
                  <MapContainer center={[6.1164, 125.1716]} zoom={13} zoomControl={false} className="w-full h-full">
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    <Marker position={[6.1100, 125.1650]} icon={currentLocationIcon} />
                    <Marker position={[6.1200, 125.1780]} icon={destinationIcon} />
                  </MapContainer>
                </div>
              </div>
            </>
          )}

          {/* Driver Management */}
          {activeTab === 'drivers' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-slate-800">Driver Management</h2>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">Active Drivers</h3>
                  <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800">Add Driver</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                        <th className="p-4 font-semibold">Driver</th>
                        <th className="p-4 font-semibold">Vehicle</th>
                        <th className="p-4 font-semibold">Status</th>
                        <th className="p-4 font-semibold">Rating</th>
                        <th className="p-4 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: 'Juan Dela Cruz', car: 'Toyota Vios • ABC 1234', status: 'In Ride', style: 'text-blue-600 bg-blue-50', rating: '4.9' },
                        { name: 'Maria Santos', car: 'Mitsubishi Mirage • XYZ 987', status: 'Online', style: 'text-emerald-600 bg-emerald-50', rating: '4.8' },
                        { name: 'Pedro Reyes', car: 'Honda Click 125i • MNO 456', status: 'Offline', style: 'text-gray-600 bg-gray-100', rating: '4.6' },
                      ].map((d, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-bold text-slate-800">{d.name}</td>
                          <td className="p-4 text-gray-600 font-medium text-sm">{d.car}</td>
                          <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${d.style}`}>{d.status}</span></td>
                          <td className="p-4 text-sm font-bold text-slate-800">
                            <span className="flex items-center gap-1"><Star size={13} className="text-yellow-400 fill-yellow-400" />{d.rating}</span>
                          </td>
                          <td className="p-4"><button className="text-emerald-600 font-bold hover:text-emerald-700 text-sm">View</button></td>
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
              <h2 className="text-3xl font-bold mb-8 text-slate-800">Booking Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-gray-500 font-bold mb-6">Booking Conversion Rate</h3>
                  <div className="flex items-end gap-2 h-40">
                    {[65, 78, 82, 70, 89, 95, 88].map((h, i) => (
                      <div key={i} className="flex-1 bg-emerald-100 rounded-t-lg relative">
                        <div className="absolute bottom-0 w-full bg-emerald-500 rounded-t-lg" style={{ height: `${h}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-4 text-xs font-bold text-gray-400">
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-gray-500 font-bold mb-4">Average Wait Time</h3>
                  <div className="flex items-center gap-4 mb-6">
                    <Clock size={40} className="text-blue-500" />
                    <div>
                      <h4 className="text-4xl font-black text-slate-800">4.2<span className="text-xl text-gray-400 font-bold ml-1">mins</span></h4>
                      <p className="text-sm font-medium text-emerald-600 flex items-center gap-1 mt-1"><TrendingUp size={14}/> 12% faster than last week</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {[{ zone: 'Metro Center', time: '3.1 mins', pct: '33%' }, { zone: 'Suburbs', time: '6.5 mins', pct: '66%' }].map(z => (
                      <div key={z.zone}>
                        <div className="flex justify-between text-sm font-bold text-slate-800 mb-2"><span>{z.zone}</span><span>{z.time}</span></div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: z.pct }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Revenue Dashboard */}
          {activeTab === 'finances' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-slate-800">Revenue Dashboard</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg">
                  <p className="text-slate-400 font-bold mb-1">Total Gross Volume</p>
                  <h3 className="text-4xl font-black mb-4">₱1.24M</h3>
                  <p className="text-sm text-emerald-400 font-medium flex items-center gap-1"><TrendingUp size={14}/> +8.4% this week</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-gray-500 font-bold mb-1">Platform Revenue (20%)</p>
                  <h3 className="text-4xl font-black text-slate-800 mb-4">₱248.5k</h3>
                  <p className="text-sm text-emerald-600 font-medium flex items-center gap-1"><TrendingUp size={14}/> +8.4% this week</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-gray-500 font-bold mb-1">Pending Payouts</p>
                  <h3 className="text-4xl font-black text-slate-800 mb-4">₱84.2k</h3>
                  <button className="w-full text-blue-600 font-bold text-sm bg-blue-50 px-3 py-3 rounded-xl hover:bg-blue-100 text-center transition-colors">Process Payouts</button>
                </div>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100"><h3 className="font-bold text-lg text-slate-800">Recent Transactions</h3></div>
                <div className="divide-y divide-gray-50">
                  {[
                    { id: 'TRX-9938', driver: 'Juan Dela Cruz', amount: '₱120.00', fee: '₱24.00', time: '10:42 AM' },
                    { id: 'TRX-9937', driver: 'Maria Santos', amount: '₱450.00', fee: '₱90.00', time: '10:15 AM' },
                    { id: 'TRX-9936', driver: 'Pedro Reyes', amount: '₱85.00', fee: '₱17.00', time: '09:30 AM' },
                  ].map((t, i) => (
                    <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><CheckCircle size={20} /></div>
                        <div>
                          <p className="font-bold text-slate-800">Ride Completed</p>
                          <p className="text-xs text-gray-500 font-medium">{t.id} • {t.driver} • {t.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">{t.amount}</p>
                        <p className="text-xs text-emerald-600 font-bold">Fee: {t.fee}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Rider Verification */}
          {activeTab === 'riders' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-slate-800">Rider Verification</h2>

              {/* Rider detail modal */}
              <AnimatePresence>
                {selectedRider && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedRider(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
                      onClick={e => e.stopPropagation()}
                      className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    >
                      {/* Modal header */}
                      <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                          {selectedRider.avatar_url
                            ? <img src={selectedRider.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                            : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"><User size={22} className="text-gray-400" /></div>}
                          <div>
                            <h3 className="font-black text-lg text-slate-800">{selectedRider.full_name || '—'}</h3>
                            <p className="text-sm text-gray-400 font-medium">{selectedRider.email}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedRider(null)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"><X size={20} /></button>
                      </div>

                      <div className="p-6 space-y-6">
                        {/* Status badge */}
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`px-3 py-1.5 rounded-full text-sm font-black ${
                            selectedRider.rider_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            selectedRider.rider_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            selectedRider.rider_status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{selectedRider.rider_status.toUpperCase()}</span>
                          {selectedRider.reviewed_by && selectedRider.reviewed_at ? (
                            <span className="text-sm text-gray-500">
                              {selectedRider.rider_status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                              <span className="font-bold text-gray-700">{selectedRider.reviewed_by_name || 'Admin'}</span>
                              {' · '}{new Date(selectedRider.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">{selectedRider.rider_status !== 'unsubmitted' ? 'Submitted for review' : 'Not yet submitted'}</span>
                          )}
                        </div>

                        {/* Personal Info */}
                        <div>
                          <h4 className="font-black text-gray-700 mb-3 text-sm uppercase tracking-wider">Personal Information</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'First Name', value: selectedRider.first_name },
                              { label: 'Last Name', value: selectedRider.last_name },
                              { label: 'Phone', value: selectedRider.phone },
                              { label: 'Birthday', value: selectedRider.birthday ? new Date(selectedRider.birthday + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null },
                              { label: 'Sex', value: selectedRider.sex },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-gray-50 rounded-2xl px-4 py-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                                <p className="font-bold text-gray-800 text-sm">{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Vehicle Info */}
                        <div>
                          <h4 className="font-black text-gray-700 mb-3 text-sm uppercase tracking-wider">Vehicle Information</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Type', value: selectedRider.vehicle_type },
                              { label: 'Make / Brand', value: selectedRider.vehicle_make },
                              { label: 'Model', value: selectedRider.vehicle_model },
                              { label: 'Plate Number', value: selectedRider.vehicle_plate },
                              { label: 'Color', value: selectedRider.vehicle_color },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-gray-50 rounded-2xl px-4 py-3">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                                <p className="font-bold text-gray-800 text-sm">{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Documents */}
                        <div>
                          <h4 className="font-black text-gray-700 mb-3 text-sm uppercase tracking-wider">Uploaded Documents</h4>
                          <div className="space-y-3">
                            {[
                              { label: "Driver's License", url: selectedRider.drivers_license_url },
                              { label: 'OR (Official Receipt)', url: selectedRider.or_url },
                              { label: 'CR (Certificate of Registration)', url: selectedRider.cr_url },
                              { label: 'Vehicle Photo', url: selectedRider.vehicle_image_url },
                            ].map(({ label, url }) => (
                              <div key={label} className="border border-gray-100 rounded-2xl overflow-hidden">
                                <p className="text-xs font-black text-gray-500 uppercase tracking-wider px-4 py-2 bg-gray-50 border-b border-gray-100">{label}</p>
                                {url
                                  ? <a href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt={label} className="w-full max-h-56 object-contain bg-gray-100 hover:opacity-90 transition-opacity cursor-zoom-in" />
                                    </a>
                                  : <div className="px-4 py-6 flex items-center gap-2 text-gray-400"><AlertCircle size={16} /><span className="text-sm font-medium">Not uploaded yet</span></div>}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Approve / Reject */}
                        {selectedRider.rider_status === 'pending' && (
                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => handleStatusChange(selectedRider.id, 'rejected')}
                              disabled={statusUpdating}
                              className="flex-1 py-3.5 rounded-2xl border-2 border-red-200 text-red-600 font-black hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleStatusChange(selectedRider.id, 'approved')}
                              disabled={statusUpdating}
                              className="flex-1 py-3.5 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-600 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {statusUpdating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                              Approve
                            </button>
                          </div>
                        )}
                        {selectedRider.rider_status === 'approved' && (
                          <button onClick={() => handleStatusChange(selectedRider.id, 'rejected')} disabled={statusUpdating}
                            className="w-full py-3.5 rounded-2xl border-2 border-red-200 text-red-600 font-black hover:bg-red-50 transition-colors">
                            Revoke Approval
                          </button>
                        )}
                        {selectedRider.rider_status === 'rejected' && (
                          <button onClick={() => handleStatusChange(selectedRider.id, 'approved')} disabled={statusUpdating}
                            className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-600 transition-colors">
                            Approve Instead
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Riders table */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">All Riders</h3>
                  <span className="text-sm text-gray-400 font-medium">{riders.length} total</span>
                </div>
                {ridersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                          <th className="p-4 font-semibold">Rider</th>
                          <th className="p-4 font-semibold">Vehicle</th>
                          <th className="p-4 font-semibold">Documents</th>
                          <th className="p-4 font-semibold">Status</th>
                          <th className="p-4 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riders.map(r => (
                          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {r.avatar_url
                                  ? <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                                  : <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-black text-gray-500">{r.full_name?.[0] || '?'}</div>}
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{r.full_name || '—'}</p>
                                  <p className="text-xs text-gray-400">{r.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-sm text-gray-600 font-medium">
                              {r.vehicle_make && r.vehicle_model ? `${r.vehicle_make} ${r.vehicle_model}` : '—'}
                              {r.vehicle_plate && <span className="block text-xs text-gray-400">{r.vehicle_plate}</span>}
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1">
                                {[r.drivers_license_url, r.or_url, r.cr_url, r.vehicle_image_url].map((url, i) => (
                                  <div key={i} className={`w-2 h-2 rounded-full ${url ? 'bg-emerald-500' : 'bg-gray-200'}`} title={['License', 'OR', 'CR', 'Vehicle'][i]} />
                                ))}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">{[r.drivers_license_url, r.or_url, r.cr_url, r.vehicle_image_url].filter(Boolean).length}/4 uploaded</p>
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                                r.rider_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                r.rider_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                r.rider_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>{r.rider_status}</span>
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => setSelectedRider(r)}
                                className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                              >
                                <Eye size={15} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                        {riders.length === 0 && !ridersLoading && (
                          <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-medium">No riders found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* User Management (Super Admin only) */}
          {activeTab === 'users' && isSuperAdmin && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-slate-800">User Management</h2>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">All Users</h3>
                  <span className="text-sm text-gray-400 font-medium">{allUsers.length} total</span>
                </div>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                          <th className="p-4 font-semibold">User</th>
                          <th className="p-4 font-semibold">Email</th>
                          <th className="p-4 font-semibold">Role</th>
                          <th className="p-4 font-semibold">Joined</th>
                          <th className="p-4 font-semibold">Change Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u) => (
                          <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {u.avatar_url
                                  ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                  : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-black text-gray-500">{u.full_name?.[0] || '?'}</div>}
                                <span className="font-bold text-slate-800 text-sm">{u.full_name || '—'}</span>
                              </div>
                            </td>
                            <td className="p-4 text-gray-500 text-sm font-medium">{u.email}</td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                                u.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                                u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                                u.role === 'rider' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{u.role}</span>
                            </td>
                            <td className="p-4 text-gray-400 text-sm font-medium">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              {roleUpdating === u.id ? (
                                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <select
                                  value={u.role}
                                  onChange={e => handleRoleChange(u.id, e.target.value)}
                                  className="text-sm font-bold border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
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
                          <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-medium">No users found.</td></tr>
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

// ─── Panel Components ─────────────────────────────────────────────────────────

const HomePanel = ({ setStep, pickup, setPickup, setPickupCoords, dropoff, setDropoff, setDestinationCoords }: any) => {
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff'>('dropoff');
  const [query, setQuery] = useState(dropoff);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
  };

  const handleSelect = (place: any) => {
    const shortName = place.name || place.display_name.split(',')[0];
    const coords: [number, number] = [parseFloat(place.lat), parseFloat(place.lon)];
    if (activeField === 'pickup') {
      setPickup(shortName); setPickupCoords(coords); setActiveField('dropoff'); setQuery(dropoff);
    } else {
      setDropoff(shortName); setDestinationCoords(coords); setStep('select');
    }
  };

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none p-6 pb-10 pointer-events-auto flex flex-col max-h-[88vh] md:max-h-none md:flex-1 md:overflow-y-auto"
    >
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 md:hidden" />
      <h2 className="text-3xl font-black tracking-tight mb-6">Where to?</h2>

      {/* Location Inputs */}
      <div className="bg-gray-50 rounded-3xl p-4 mb-4 space-y-2 border border-gray-100">
        <div
          className={`flex items-center gap-3 p-3 rounded-2xl transition-colors ${activeField === 'pickup' ? 'bg-white shadow-sm' : 'hover:bg-white/50 cursor-pointer'}`}
          onClick={() => handleFocus('pickup')}
        >
          <div className="w-3 h-3 bg-blue-500 rounded-full shrink-0" />
          {activeField === 'pickup' ? (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search pickup..." className="flex-1 bg-transparent outline-none text-sm font-bold text-gray-800 placeholder-gray-400" />
          ) : (
            <span className={`text-sm font-bold ${pickup ? 'text-gray-800' : 'text-gray-400'}`}>{pickup || 'Set pickup'}</span>
          )}
        </div>
        <div className="border-t border-gray-100 mx-3" />
        <div
          className={`flex items-center gap-3 p-3 rounded-2xl transition-colors ${activeField === 'dropoff' ? 'bg-white shadow-sm' : 'hover:bg-white/50 cursor-pointer'}`}
          onClick={() => handleFocus('dropoff')}
        >
          <div className="w-3 h-3 bg-emerald-500 rounded-full shrink-0" />
          {activeField === 'dropoff' ? (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Where to?" className="flex-1 bg-transparent outline-none text-sm font-bold text-gray-800 placeholder-gray-400" />
          ) : (
            <span className={`text-sm font-bold ${dropoff ? 'text-gray-800' : 'text-gray-400'}`}>{dropoff || 'Choose destination'}</span>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg mb-4 overflow-hidden max-h-60 overflow-y-auto">
          {loading && <div className="p-4 text-center text-sm text-gray-400 font-medium">Searching...</div>}
          {suggestions.map((place, i) => (
            <div key={i} onClick={() => handleSelect(place)}
              className="flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors">
              <MapPin size={16} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-800 leading-tight">{place.name || place.display_name.split(',')[0]}</p>
                <p className="text-xs text-gray-400 font-medium truncate">{place.display_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!suggestions.length && (
        <div className="flex-1 overflow-y-auto">
          {activeField === 'pickup' && (
            <div className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors mb-2"
              onClick={() => { setPickup('Current Location'); setPickupCoords(null); setActiveField('dropoff'); setQuery(dropoff); }}>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 shrink-0"><Navigation size={20} /></div>
              <div><p className="font-bold text-lg">Current Location</p><p className="text-sm text-gray-500 font-medium">Use GPS location</p></div>
            </div>
          )}
          {activeField === 'dropoff' && (
            <>
              <h4 className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quick Destinations</h4>
              <div className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors"
                onClick={() => { setDropoff('Home'); setDestinationCoords([6.1000, 125.1700]); setStep('select'); }}>
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shrink-0"><Home size={20} /></div>
                <div><p className="font-bold text-lg">Home</p><p className="text-sm text-gray-500 font-medium">General Santos City</p></div>
              </div>
              <div className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors"
                onClick={() => { setDropoff('Work'); setDestinationCoords([6.1164, 125.1716]); setStep('select'); }}>
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 shrink-0"><Briefcase size={20} /></div>
                <div><p className="font-bold text-lg">Work</p><p className="text-sm text-gray-500 font-medium">CBD, General Santos</p></div>
              </div>
              <h4 className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">Recent</h4>
              <div className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors"
                onClick={() => { setDropoff('SM City GenSan'); setDestinationCoords([6.1070, 125.1640]); setStep('select'); }}>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 shrink-0"><Clock size={20} /></div>
                <div><p className="font-bold text-lg">SM City GenSan</p><p className="text-sm text-gray-500 font-medium">General Santos City</p></div>
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
};

const SelectPanel = ({ setStep, selectedRide, setSelectedRide, routeInfo, onBook }: any) => {
  const getDynamicRides = () => {
    if (!routeInfo) return RIDE_OPTIONS;
    const distanceKm = routeInfo.distance / 1000;
    const durationMin = routeInfo.duration / 60;
    return RIDE_OPTIONS.map(ride => {
      let price = ride.price;
      if (ride.id === 'moto') price = Math.round(40 + (distanceKm * 10) + (durationMin * 2));
      else if (ride.id === 'eco') price = Math.round(60 + (distanceKm * 15) + (durationMin * 3));
      else price = Math.round(100 + (distanceKm * 25) + (durationMin * 5));
      return { ...ride, price, time: `${Math.round(durationMin)} min` };
    });
  };
  const dynamicRides = getDynamicRides();

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none p-6 pb-8 pointer-events-auto flex flex-col max-h-[80vh] md:max-h-none md:flex-1 md:overflow-y-auto"
    >
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 md:hidden" />
      <h3 className="text-2xl font-bold mb-4 tracking-tight">Choose a ride</h3>
      <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-2 pb-2">
        {dynamicRides.map((ride) => (
          <div key={ride.id} onClick={() => setSelectedRide(ride.id)}
            className={`flex items-center p-4 rounded-3xl border-2 transition-all cursor-pointer ${selectedRide === ride.id ? 'border-emerald-500 bg-emerald-50/30 shadow-md shadow-emerald-100' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${selectedRide === ride.id ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-gray-600 shadow-sm'}`}>
              <ride.icon size={32} />
            </div>
            <div className="ml-4 flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-lg">{ride.name}</span>
                <span className="font-bold text-xl">₱{ride.price}</span>
              </div>
              <div className="flex items-center text-sm text-gray-500 font-medium">
                <Clock size={14} className="mr-1.5" /> {ride.time} away
                <span className="mx-2">•</span>
                <User size={14} className="mr-1.5" /> {ride.capacity}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl mb-6 border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center"><CreditCard size={16} className="text-emerald-600" /></div>
          <span className="font-bold">GCash</span>
        </div>
        <MoreHorizontal size={20} className="text-gray-400" />
      </div>
      <button
        onClick={() => {
           const fare = dynamicRides.find(r => r.id === selectedRide)?.price;
           if (onBook) onBook(Date.now().toString(), fare);
           else { setStep('searching'); setTimeout(() => setStep('matched'), 3500); }
        }}
        className="w-full bg-black text-white font-bold text-lg py-5 rounded-2xl hover:bg-gray-800 transition-transform active:scale-[0.98] shadow-xl shadow-black/20"
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
    className="bg-white rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none p-8 pb-12 pointer-events-auto flex flex-col items-center justify-center min-h-[45vh] md:min-h-0 md:flex-1"
  >
    <div className="relative w-28 h-28 mb-8">
      <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
      <div className="absolute inset-2 border-4 border-emerald-200 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.4s' }} />
      <div className="absolute inset-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/40 z-10">
        <Search size={36} className="text-white" />
      </div>
    </div>
    <h3 className="text-2xl font-bold text-center tracking-tight">Finding your driver...</h3>
    <p className="text-gray-500 text-center mt-2 font-medium">Connecting to nearby drivers</p>
  </motion.div>
);

const MatchedPanel = ({ onCancel, selectedRide, routeInfo, showNotification, activeRider }: any) => {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'driver', text: 'Hi! I am on my way to your location.', time: '10:02 AM' }
  ]);
  const [newMessage, setNewMessage] = useState('');

  const handleSend = () => {
    if (!newMessage.trim()) return;
    setMessages(prev => [...prev, { sender: 'user', text: newMessage, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setNewMessage('');
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'driver', text: 'Noted, thanks!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      showNotification('New message from Juan: "Noted, thanks!"');
    }, 2000);
  };

  const getDynamicRides = () => {
    if (!routeInfo) return RIDE_OPTIONS;
    const dk = routeInfo.distance / 1000, dm = routeInfo.duration / 60;
    return RIDE_OPTIONS.map(ride => {
      let price = ride.id === 'moto' ? Math.round(40 + dk * 10 + dm * 2)
        : ride.id === 'eco' ? Math.round(60 + dk * 15 + dm * 3)
        : Math.round(100 + dk * 25 + dm * 5);
      return { ...ride, price, time: `${Math.round(dm)} min` };
    });
  };

  const ride = getDynamicRides().find(r => r.id === selectedRide);

  if (isChatOpen) {
    return (
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-white rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none pointer-events-auto flex flex-col md:flex-1 w-full h-[85vh] md:h-full"
      >
        <div className="flex items-center p-5 bg-emerald-600 text-white shadow-md z-10 shrink-0 md:rounded-none rounded-t-[2.5rem]">
          <button onClick={() => setIsChatOpen(false)} className="p-2 -ml-2 hover:bg-emerald-700 rounded-full transition-colors"><ChevronLeft size={24} /></button>
          <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden border-2 border-emerald-400 ml-2">
            {activeRider?.avatar_url ? (
               <img src={activeRider.avatar_url} alt="Driver" className="w-full h-full object-cover" />
            ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold">{activeRider?.first_name?.[0] || 'D'}</div>
            )}
          </div>
          <div className="ml-3">
            <h4 className="font-bold">{activeRider ? `${activeRider.first_name || ''} ${activeRider.last_name || ''}`.trim() : 'Juan Dela Cruz'}</h4>
            <p className="text-xs text-emerald-100 font-medium">{activeRider?.vehicle_make} {activeRider?.vehicle_model} • {activeRider?.vehicle_plate}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50 flex flex-col pt-6">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col max-w-[85%] ${m.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl ${m.sender === 'user' ? 'bg-black text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 shadow-sm rounded-bl-sm'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.text}</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-gray-400 mt-1 px-1">{m.time}</span>
            </div>
          ))}
        </div>
        <div className="p-4 bg-white border-t border-gray-100 flex gap-3 shrink-0">
          <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-gray-100 rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium" />
          <button onClick={handleSend} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 shrink-0 shadow-md">
            <Send size={20} className="-ml-1" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none p-6 pb-8 pointer-events-auto flex flex-col md:flex-1 md:overflow-y-auto"
    >
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 md:hidden" />
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-3xl font-bold tracking-tight text-emerald-600 mb-1">Arriving in 4 min</h3>
          <p className="text-gray-500 font-medium text-lg">Toyota Vios • ABC 1234</p>
        </div>
        <div className="bg-gray-50 px-4 py-2 rounded-xl font-bold text-xl border border-gray-100">₱{ride?.price}</div>
      </div>
      <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-3xl mb-6 border border-gray-100">
        <div className="w-16 h-16 bg-gray-300 rounded-full overflow-hidden shadow-sm">
          {activeRider?.avatar_url ? (
            <img src={activeRider.avatar_url} alt="Driver" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-gray-500 font-bold">{activeRider?.first_name?.[0] || 'D'}</div>
          )}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-xl mb-1">{activeRider ? `${activeRider.first_name || ''} ${activeRider.last_name || ''}`.trim() : 'Juan Dela Cruz'}</h4>
          <div className="flex items-center text-sm text-gray-600 font-medium">
            <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1.5" /> 4.9 (1.2k rides)
          </div>
          <p className="text-xs font-bold text-emerald-600 mt-1">{activeRider?.vehicle_make} {activeRider?.vehicle_model} • {activeRider?.vehicle_plate}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsChatOpen(true)}
            className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors">
            <MessageSquare size={20} />
          </button>
          <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors">
            <Phone size={20} />
          </button>
        </div>
      </div>
      <div className="mb-8 bg-gray-50 rounded-3xl p-5 border border-gray-100">
        <h5 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><ThumbsUp size={16} className="text-emerald-500" /> Recent Reviews</h5>
        <div className="space-y-3">
          {[
            { init: 'M', color: 'emerald', review: '"Very polite and drove safely."', who: 'Maria • Today' },
            { init: 'L', color: 'blue', review: '"Car was exceptionally clean!"', who: 'Luis • Yesterday' },
          ].map(r => (
            <div key={r.init} className="flex gap-3">
              <div className={`w-8 h-8 rounded-full bg-${r.color}-100 flex items-center justify-center text-${r.color}-700 font-bold text-sm shrink-0`}>{r.init}</div>
              <div>
                <p className="text-sm font-medium text-gray-800">{r.review}</p>
                <p className="text-xs text-gray-500">{r.who}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      {showCancelConfirm ? (
        <div className="bg-red-50 p-5 rounded-3xl border border-red-100">
          <h4 className="font-bold text-red-800 mb-2">Cancel your ride?</h4>
          <p className="text-red-600 text-sm mb-4 font-medium">You may be charged a small cancellation fee if the driver is already on the way.</p>
          <div className="flex gap-3">
            <button onClick={() => setShowCancelConfirm(false)} className="flex-1 bg-white text-gray-700 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">Keep Ride</button>
            <button onClick={onCancel} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-red-700 transition-colors">Yes, Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <button className="flex-1 bg-gray-100 text-gray-800 font-bold text-lg py-5 rounded-2xl hover:bg-gray-200 transition-colors">Share ETA</button>
          <button onClick={() => setShowCancelConfirm(true)} className="flex-1 bg-red-50 text-red-600 font-bold text-lg py-5 rounded-2xl hover:bg-red-100 transition-colors">Cancel</button>
        </div>
      )}
    </motion.div>
  );
};
