# Maintenance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintenance module that lets admins schedule full or partial maintenance, auto-post announcements, and instantly propagate restrictions to all connected clients via Supabase Realtime.

**Architecture:** New `maintenance` table (singleton id=1) holds mode + schedule. A new `maintenanceService.ts` handles DB reads/writes and Realtime subscriptions. The root `App` component loads maintenance state, subscribes to changes, and gates/passes `effectiveMode` down to `UserApp`, `RiderDashboard`, and `AdminDashboard`. Two new inline components (`MaintenanceScreen`, `MaintenanceBanner`) handle the UI. A new `MaintenanceTab` admin component lives inline in `App.tsx`.

**Tech Stack:** React 19, TypeScript, Supabase (postgres_changes Realtime), Tailwind CSS 4, lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/maintenanceService.ts` | Create | All DB + Realtime logic for maintenance |
| `src/App.tsx` | Modify | Root: load state, subscribe, gate full-maintenance, pass `effectiveMode` prop |
| `src/App.tsx` | Add component | `MaintenanceScreen` — full-page block for non-admins |
| `src/App.tsx` | Add component | `MaintenanceBanner` — amber marquee for half-maintenance |
| `src/App.tsx` | Add component | `MaintenanceTab` — admin form to manage maintenance |
| `src/App.tsx` | Modify `SelectPanel` | Disable book button when `effectiveMode === 'half'` |
| `src/App.tsx` | Modify `RiderDashboard` | Disable go-online, hide remit tab when `effectiveMode === 'half'` |
| `src/App.tsx` | Modify `AdminDashboard` | Add `maintenance` to `AdminTab` type and `ALL_MODULES`, render `MaintenanceTab` |

---

## Task 1: Create Supabase `maintenance` Table

**Files:**
- No file — run SQL in Supabase dashboard SQL editor

- [ ] **Step 1: Run this SQL in Supabase SQL editor**

```sql
create table if not exists public.maintenance (
  id integer primary key default 1,
  mode text not null default 'off' check (mode in ('off', 'half', 'full')),
  message text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  post_news boolean not null default false,
  auto_news_post_id uuid references public.news_posts(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint maintenance_singleton check (id = 1)
);

-- Insert the singleton row
insert into public.maintenance (id, mode) values (1, 'off')
on conflict (id) do nothing;

-- Allow public read (clients need this to check maintenance status)
alter table public.maintenance enable row level security;

create policy "Public can read maintenance"
  on public.maintenance for select
  using (true);

create policy "Service role can write maintenance"
  on public.maintenance for all
  using (auth.role() = 'service_role');

-- Enable Realtime for the table
alter publication supabase_realtime add table public.maintenance;
```

- [ ] **Step 2: Verify table exists**

In Supabase Table Editor, confirm `maintenance` table exists with one row `{id:1, mode:'off'}`.

- [ ] **Step 3: Commit note**

```bash
git commit --allow-empty -m "feat: create maintenance table in Supabase (manual migration)"
```

---

## Task 2: Create `src/lib/maintenanceService.ts`

**Files:**
- Create: `src/lib/maintenanceService.ts`

- [ ] **Step 1: Create the file**

```typescript
import { supabase, supabaseAdmin } from './supabase';

export type MaintenanceMode = 'off' | 'half' | 'full';

export interface MaintenanceSettings {
  id: number;
  mode: MaintenanceMode;
  message: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  post_news: boolean;
  auto_news_post_id: string | null;
  updated_at: string;
}

export function getEffectiveMode(s: MaintenanceSettings | null): MaintenanceMode {
  if (!s || s.mode === 'off') return 'off';
  const now = new Date();
  if (s.scheduled_start && now < new Date(s.scheduled_start)) return 'off';
  if (s.scheduled_end && now >= new Date(s.scheduled_end)) return 'off';
  return s.mode;
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings | null> {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) { console.error('getMaintenanceSettings:', error); return null; }
  return data as MaintenanceSettings;
}

export async function updateMaintenanceSettings(
  settings: Partial<Omit<MaintenanceSettings, 'id' | 'updated_at'>>,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('maintenance')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) { console.error('updateMaintenanceSettings:', error); return false; }
  return true;
}

export function subscribeToMaintenance(
  cb: (s: MaintenanceSettings) => void,
): () => void {
  const channel = supabase
    .channel('maintenance-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'maintenance', filter: 'id=eq.1' },
      (payload) => { if (payload.new) cb(payload.new as MaintenanceSettings); },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/maintenanceService.ts
git commit -m "feat: add maintenanceService with DB, Realtime, and effectiveMode logic"
```

---

## Task 3: Load Maintenance State in Root `App` Component

**Files:**
- Modify: `src/App.tsx` — around line 24 (imports) and lines 368–374 (globalSettings setup)

- [ ] **Step 1: Add import at line 24 (after the settingsService import)**

Find this line:
```typescript
import { getAppSettings, updateAppSettings, uploadSettingImage, type AppSettings } from '@/src/lib/settingsService';
```
Add after it:
```typescript
import { getMaintenanceSettings, updateMaintenanceSettings, subscribeToMaintenance, getEffectiveMode, type MaintenanceSettings, type MaintenanceMode } from '@/src/lib/maintenanceService';
```

- [ ] **Step 2: Add maintenance state after the `globalSettings` state (around line 368)**

Find:
```typescript
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
```
Add `maintenanceSettings` state between them:
```typescript
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [maintenanceSettings, setMaintenanceSettings] = useState<MaintenanceSettings | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
```

- [ ] **Step 3: Add load + subscribe effect after the existing `getAppSettings` effect (around line 372)**

Find:
```typescript
  useEffect(() => {
    getAppSettings().then(setGlobalSettings);
  }, []);
```
Add after it:
```typescript
  useEffect(() => {
    getMaintenanceSettings().then(setMaintenanceSettings);
    const unsub = subscribeToMaintenance(setMaintenanceSettings);
    const interval = setInterval(() => {
      setMaintenanceSettings(prev => prev ? { ...prev } : prev);
    }, 60000);
    return () => { unsub(); clearInterval(interval); };
  }, []);
```

- [ ] **Step 4: Add `effectiveMode` derivation just before the return guards (around line 421)**

Find:
```typescript
  if (authLoading || (session && !profile)) return <SplashScreen settings={globalSettings} />;
```
Add before it:
```typescript
  const effectiveMode: MaintenanceMode = getEffectiveMode(maintenanceSettings);
  const isAdminRole = profile?.role === 'admin' || profile?.role === 'super_admin';
```

- [ ] **Step 5: Add full-maintenance gate after the `is_blocked` check (around line 424)**

Find:
```typescript
  if (!profile.profile_completed && (profile.role === 'user' || profile.role === 'rider'))
    return <ProfileSetupScreen profile={profile} onComplete={setProfile} />;
```
Add after it:
```typescript
  if (effectiveMode === 'full' && !isAdminRole)
    return <MaintenanceScreen settings={maintenanceSettings} appSettings={globalSettings} />;
```

- [ ] **Step 6: Pass `effectiveMode` to `UserApp` and `RiderDashboard` in the normal render (lines 450–453)**

Find:
```typescript
  if (profile.role === 'rider' || profile.role === 'team_leader') return <RiderDashboard profile={profile} settings={globalSettings} />;
  if (profile.role === 'admin') return <AdminDashboard profile={profile} isSuperAdmin={false} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} />;
  if (profile.role === 'super_admin') return <AdminDashboard profile={profile} isSuperAdmin={true} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} onImpersonate={setImpersonating} />;
  return <UserApp profile={profile} settings={globalSettings} />;
```
Replace with:
```typescript
  if (profile.role === 'rider' || profile.role === 'team_leader') return <RiderDashboard profile={profile} settings={globalSettings} maintenanceMode={effectiveMode} />;
  if (profile.role === 'admin') return <AdminDashboard profile={profile} isSuperAdmin={false} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} maintenanceSettings={maintenanceSettings} />;
  if (profile.role === 'super_admin') return <AdminDashboard profile={profile} isSuperAdmin={true} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} onImpersonate={setImpersonating} maintenanceSettings={maintenanceSettings} />;
  return <UserApp profile={profile} settings={globalSettings} maintenanceMode={effectiveMode} />;
```

- [ ] **Step 7: Also pass props in the impersonation branch (lines 442–445)**

Find:
```typescript
        {p.role === 'rider' ? <RiderDashboard profile={p} settings={globalSettings} /> :
         p.role === 'admin' ? <AdminDashboard profile={p} isSuperAdmin={false} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} /> :
         p.role === 'super_admin' ? <AdminDashboard profile={p} isSuperAdmin={true} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} /> :
         <UserApp profile={p} settings={globalSettings} />}
```
Replace with:
```typescript
        {p.role === 'rider' ? <RiderDashboard profile={p} settings={globalSettings} maintenanceMode={effectiveMode} /> :
         p.role === 'admin' ? <AdminDashboard profile={p} isSuperAdmin={false} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} maintenanceSettings={maintenanceSettings} /> :
         p.role === 'super_admin' ? <AdminDashboard profile={p} isSuperAdmin={true} settings={globalSettings} onRefreshSettings={() => getAppSettings().then(setGlobalSettings)} maintenanceSettings={maintenanceSettings} /> :
         <UserApp profile={p} settings={globalSettings} maintenanceMode={effectiveMode} />}
```

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load and subscribe to maintenance state in root App"
```

---

## Task 4: Add `MaintenanceScreen` Component

**Files:**
- Modify: `src/App.tsx` — add new component near other full-screen components (e.g., after `BlockedScreen`)

- [ ] **Step 1: Find `BlockedScreen` component and add `MaintenanceScreen` after it**

Search for `const BlockedScreen` in `App.tsx`. Add the following component right after its closing `};`:

```typescript
const MaintenanceScreen = ({ settings, appSettings }: { settings: MaintenanceSettings | null, appSettings: AppSettings | null }) => {
  const msg = settings?.message || 'The system is currently under maintenance. Please check back later.';
  const end = settings?.scheduled_end ? new Date(settings.scheduled_end) : null;
  const endLabel = end ? end.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div className="w-full h-[100dvh] bg-gray-950 flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      {/* Animated background rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full border border-white/5 animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-white/5 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm">
        {appSettings?.app_logo_url ? (
          <img src={appSettings.app_logo_url} alt="Logo" className="w-16 h-16 rounded-2xl object-cover opacity-90" />
        ) : (
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-black text-white mb-2">We'll be right back</h1>
          <p className="text-white/50 text-sm leading-relaxed">{msg}</p>
        </div>

        {endLabel && (
          <div className="bg-white/10 rounded-2xl px-5 py-3 border border-white/10">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-1">Expected back</p>
            <p className="text-white font-bold text-sm">{endLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add MaintenanceScreen full-page component"
```

---

## Task 5: Add `MaintenanceBanner` Component

**Files:**
- Modify: `src/App.tsx` — add component after `MaintenanceScreen`

- [ ] **Step 1: Add `MaintenanceBanner` component after `MaintenanceScreen`**

```typescript
const MaintenanceBanner = ({ settings }: { settings: MaintenanceSettings | null }) => {
  if (!settings) return null;

  const now = new Date();
  const start = settings.scheduled_start ? new Date(settings.scheduled_start) : null;
  const end = settings.scheduled_end ? new Date(settings.scheduled_end) : null;
  const fmt = (d: Date) => d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  let text: string;
  if (start && now < start) {
    text = `Scheduled maintenance on ${fmt(start)}${end ? ` until ${fmt(end)}` : ''}. Some features will be temporarily unavailable.`;
  } else if (end) {
    text = `System maintenance in progress — expected back ${fmt(end)}.`;
  } else {
    text = 'System is under partial maintenance. Some features are temporarily unavailable.';
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[300] bg-amber-400 overflow-hidden h-8 flex items-center">
      <div className="flex animate-[marquee_30s_linear_infinite] whitespace-nowrap">
        {[0, 1, 2].map(i => (
          <span key={i} className="text-amber-950 text-xs font-bold px-12">
            🔧 {text}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
};
```

- [ ] **Step 2: Render `MaintenanceBanner` in UserApp**

Find the `UserApp` component signature:
```typescript
const UserApp = ({ profile, settings }: { profile: Profile, settings: AppSettings | null }) => {
```
Replace with:
```typescript
const UserApp = ({ profile, settings, maintenanceMode }: { profile: Profile, settings: AppSettings | null, maintenanceMode?: MaintenanceMode }) => {
```

Then find the `maintenanceSettings` state — we need to pass it to the banner. Since `UserApp` doesn't have access to `maintenanceSettings` directly (only `maintenanceMode`), add a banner based on `maintenanceMode` with a text. Search for the outermost return div in `UserApp` (look for the `<div className="relative h-[100dvh]` or similar top-level wrapper) and prepend the banner:

Actually, the banner needs the full `maintenanceSettings` for the timestamp text. Pass it as a separate prop:

Find the `UserApp` signature you just changed and update to:
```typescript
const UserApp = ({ profile, settings, maintenanceMode, maintenanceSettings }: { profile: Profile, settings: AppSettings | null, maintenanceMode?: MaintenanceMode, maintenanceSettings?: MaintenanceSettings | null }) => {
```

Update all 4 `<UserApp ...>` call sites (lines ~442, ~445, ~453) to pass `maintenanceSettings={maintenanceSettings}`.

At the very start of UserApp's JSX return, add:
```typescript
    <>
      {maintenanceMode === 'half' && <MaintenanceBanner settings={maintenanceSettings ?? null} />}
      {/* existing JSX wrapped below — add pt-8 to the top wrapper if banner is shown */}
```

Find the top-level wrapper div of UserApp's return and add conditional top padding:
```typescript
      <div className={`relative h-[100dvh] ... ${maintenanceMode === 'half' ? 'pt-8' : ''}`}>
```

- [ ] **Step 3: Render `MaintenanceBanner` in RiderDashboard**

Find:
```typescript
const RiderDashboard = ({ profile: initialProfile, settings }: { profile: Profile, settings: AppSettings | null }) => {
```
Replace with:
```typescript
const RiderDashboard = ({ profile: initialProfile, settings, maintenanceMode, maintenanceSettings }: { profile: Profile, settings: AppSettings | null, maintenanceMode?: MaintenanceMode, maintenanceSettings?: MaintenanceSettings | null }) => {
```

Update all `<RiderDashboard ...>` call sites to pass both `maintenanceMode={effectiveMode}` and `maintenanceSettings={maintenanceSettings}`.

At the start of RiderDashboard's JSX return, add the same banner:
```typescript
    <>
      {maintenanceMode === 'half' && <MaintenanceBanner settings={maintenanceSettings ?? null} />}
```
And add `pt-8` to the top-level wrapper div when banner is shown.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add MaintenanceBanner marquee component for half-maintenance"
```

---

## Task 6: Apply Half-Maintenance Restrictions to UserApp

**Files:**
- Modify: `src/App.tsx` — `SelectPanel` component around line 9249 and its call site around line 2068

- [ ] **Step 1: Pass `maintenanceMode` to `SelectPanel`**

Find the `SelectPanel` call site around line 2068:
```typescript
            {step === 'select' && (
              <SelectPanel key="select" setStep={setStep} selectedRide={selectedRide}
                setSelectedRide={setSelectedRide} routeInfo={routeInfo} pricingConfig={pricingConfig}
                isBooking={isBooking}
                onBook={async (rideId: string, breakdown: FareBreakdown, distanceM: number) => {
```
Add `maintenanceMode={maintenanceMode}` to the props:
```typescript
            {step === 'select' && (
              <SelectPanel key="select" setStep={setStep} selectedRide={selectedRide}
                setSelectedRide={setSelectedRide} routeInfo={routeInfo} pricingConfig={pricingConfig}
                isBooking={isBooking} maintenanceMode={maintenanceMode}
                onBook={async (rideId: string, breakdown: FareBreakdown, distanceM: number) => {
```

- [ ] **Step 2: Update `SelectPanel` to accept and use `maintenanceMode`**

Find:
```typescript
const SelectPanel = ({ setStep, selectedRide, setSelectedRide, routeInfo, onBook, pricingConfig, isBooking }: any) => {
```
Replace with:
```typescript
const SelectPanel = ({ setStep, selectedRide, setSelectedRide, routeInfo, onBook, pricingConfig, isBooking, maintenanceMode }: any) => {
```

Find the Book Ride button (around line 9398):
```typescript
            disabled={isBooking}
            className="w-full bg-gray-950 text-white font-bold text-[15px] py-[17px] rounded-2xl hover:bg-gray-800 transition-colors active:scale-[0.98] shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-wait"
          >
            {isBooking ? 'Booking...' : 'Book Ride'}
```
Replace with:
```typescript
            disabled={isBooking || maintenanceMode === 'half'}
            className="w-full bg-gray-950 text-white font-bold text-[15px] py-[17px] rounded-2xl hover:bg-gray-800 transition-colors active:scale-[0.98] shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBooking ? 'Booking...' : maintenanceMode === 'half' ? 'Unavailable — Maintenance' : 'Book Ride'}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: disable book button during half-maintenance"
```

---

## Task 7: Apply Half-Maintenance Restrictions to RiderDashboard

**Files:**
- Modify: `src/App.tsx` — `RiderDashboard` component

- [ ] **Step 1: Disable Go-Online toggle**

Find the Go Online button (around line 4051):
```typescript
            <button
              onClick={() => {
                if (!isOnline && (riderLocationDenied || (remittanceRequired && hasPendingRemit))) return;
                setIsOnline(prev => !prev);
              }}
              className={`w-full py-[15px] rounded-xl font-bold text-[15px] transition-colors ${
                isOnline ? 'bg-white text-gray-950 hover:bg-gray-100'
                : (riderLocationDenied || (remittanceRequired && hasPendingRemit)) ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-950 text-white hover:bg-gray-800'
              }`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
```
Replace with:
```typescript
            <button
              onClick={() => {
                if (maintenanceMode === 'half' && !isOnline) return;
                if (!isOnline && (riderLocationDenied || (remittanceRequired && hasPendingRemit))) return;
                setIsOnline(prev => !prev);
              }}
              className={`w-full py-[15px] rounded-xl font-bold text-[15px] transition-colors ${
                isOnline ? 'bg-white text-gray-950 hover:bg-gray-100'
                : (maintenanceMode === 'half' || riderLocationDenied || (remittanceRequired && hasPendingRemit)) ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-950 text-white hover:bg-gray-800'
              }`}
            >
              {isOnline ? 'Go Offline' : maintenanceMode === 'half' ? 'Unavailable — Maintenance' : 'Go Online'}
            </button>
```

- [ ] **Step 2: Hide remit tab during half-maintenance**

Find the tab bar array (appears twice — desktop and mobile, around lines 3742 and 3755):
```typescript
((['home', 'history', ...(remittanceRequired ? ['remit'] : []), ...(isTeamLeader ? ['team'] : []), 'news'] as const)
```
Replace both occurrences with:
```typescript
((['home', 'history', ...(remittanceRequired && maintenanceMode !== 'half' ? ['remit'] : []), ...(isTeamLeader ? ['team'] : []), 'news'] as const)
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: disable go-online toggle and hide remit tab during half-maintenance"
```

---

## Task 8: Add `MaintenanceTab` Admin Component

**Files:**
- Modify: `src/App.tsx` — add new component before `AdminDashboard`

- [ ] **Step 1: Add `MaintenanceTab` component just before `const AdminDashboard`**

Find `// ─── Admin Dashboard ───` and insert the following component before it:

```typescript
const MaintenanceTab = ({ settings, onSaved, profile }: { settings: MaintenanceSettings | null, onSaved: (s: MaintenanceSettings) => void, profile: Profile }) => {
  const [mode, setMode] = React.useState<MaintenanceMode>(settings?.mode ?? 'off');
  const [message, setMessage] = React.useState(settings?.message ?? '');
  const [immediate, setImmediate] = React.useState(!settings?.scheduled_start);
  const [scheduledStart, setScheduledStart] = React.useState(
    settings?.scheduled_start ? settings.scheduled_start.slice(0, 16) : ''
  );
  const [scheduledEnd, setScheduledEnd] = React.useState(
    settings?.scheduled_end ? settings.scheduled_end.slice(0, 16) : ''
  );
  const [postNews, setPostNews] = React.useState(settings?.post_news ?? false);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const effectiveNow = getEffectiveMode(settings);
  const statusLabel = (() => {
    if (!settings || effectiveNow === 'off') return { color: 'bg-emerald-500', text: 'Maintenance is OFF' };
    const start = settings.scheduled_start ? new Date(settings.scheduled_start) : null;
    const fmt = (d: Date) => d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    if (start && new Date() < start) {
      return { color: effectiveNow === 'full' ? 'bg-red-500' : 'bg-amber-500', text: `${effectiveNow === 'full' ? 'Full' : 'Half'} maintenance scheduled for ${fmt(start)}` };
    }
    return { color: effectiveNow === 'full' ? 'bg-red-500' : 'bg-amber-500', text: `${effectiveNow === 'full' ? 'Full' : 'Half'} maintenance is ACTIVE` };
  })();

  const handleSave = async () => {
    if (!immediate && !scheduledStart) { showToast('Set a start date/time or enable "Activate immediately".'); return; }
    setSaving(true);

    const startIso = immediate ? null : new Date(scheduledStart).toISOString();
    const endIso = scheduledEnd ? new Date(scheduledEnd).toISOString() : null;

    let auto_news_post_id = settings?.auto_news_post_id ?? null;

    if (postNews && mode !== 'off') {
      const startLabel = startIso ? new Date(startIso).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }) : 'immediately';
      const endLabel = endIso ? new Date(endIso).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }) : 'further notice';
      const newsTitle = mode === 'full' ? 'System Maintenance' : 'Partial System Maintenance';
      const newsContent = `${message || 'We are performing scheduled maintenance.'}\n\nMaintenance window: ${startLabel} until ${endLabel}.`;

      if (auto_news_post_id) {
        await updateNewsPost(auto_news_post_id, { title: newsTitle, content: newsContent, category: 'Important', published: true, is_archived: false });
      } else {
        const post = await createNewsPost(newsTitle, newsContent, 'Important', null, profile.id, `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin', profile.avatar_url ?? null, true);
        if (post) auto_news_post_id = post.id;
      }
    } else if (mode === 'off' && auto_news_post_id) {
      await updateNewsPost(auto_news_post_id, { is_archived: true });
      auto_news_post_id = null;
    }

    const ok = await updateMaintenanceSettings({ mode, message: message || null, scheduled_start: startIso, scheduled_end: endIso, post_news: postNews, auto_news_post_id });
    setSaving(false);
    if (ok) {
      showToast('Maintenance settings saved.');
      const updated: MaintenanceSettings = { id: 1, mode, message: message || null, scheduled_start: startIso, scheduled_end: endIso, post_news: postNews, auto_news_post_id, updated_at: new Date().toISOString() };
      onSaved(updated);
    } else {
      showToast('Failed to save. Try again.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[500] bg-gray-950 text-white text-sm font-bold px-4 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Status indicator */}
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <div className={`w-2.5 h-2.5 rounded-full ${statusLabel.color}`} />
        <span className="text-sm font-semibold text-gray-700">{statusLabel.text}</span>
      </div>

      {/* Mode selector */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Maintenance Mode</p>
        <div className="flex gap-2">
          {(['off', 'half', 'full'] as MaintenanceMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-3 rounded-xl font-bold text-sm capitalize transition-colors ${mode === m
                ? m === 'off' ? 'bg-emerald-500 text-white' : m === 'half' ? 'bg-amber-400 text-amber-950' : 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div className="space-y-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Schedule</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={immediate} onChange={e => setImmediate(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-semibold text-gray-700">Activate immediately</span>
        </label>
        {!immediate && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Start date &amp; time</p>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={e => setScheduledStart(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400 mb-1">End date &amp; time <span className="text-gray-300">(optional)</span></p>
          <input
            type="datetime-local"
            value={scheduledEnd}
            onChange={e => setScheduledEnd(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Message */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Message</p>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={3}
          placeholder="We are performing scheduled maintenance. Thank you for your patience."
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Post news checkbox */}
      {mode !== 'off' && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={postNews} onChange={e => setPostNews(e.target.checked)} className="w-4 h-4 rounded" />
          <div>
            <p className="text-sm font-semibold text-gray-700">Post maintenance announcement</p>
            <p className="text-xs text-gray-400">Auto-creates or updates a news post with the maintenance details</p>
          </div>
        </label>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-gray-950 text-white font-bold text-[15px] py-4 rounded-2xl hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Maintenance Settings'}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add MaintenanceTab admin component"
```

---

## Task 9: Wire `MaintenanceTab` into `AdminDashboard`

**Files:**
- Modify: `src/App.tsx` — `AdminDashboard` component

- [ ] **Step 1: Update `AdminTab` type (around line 5520)**

Find:
```typescript
type AdminTab = 'live' | 'drivers' | 'analytics' | 'finances' | 'reviews' | 'users' | 'riders' | 'pricing' | 'roles' | 'blocking' | 'remittances' | 'teams' | 'news' | 'settings';
```
Replace with:
```typescript
type AdminTab = 'live' | 'drivers' | 'analytics' | 'finances' | 'reviews' | 'users' | 'riders' | 'pricing' | 'roles' | 'blocking' | 'remittances' | 'teams' | 'news' | 'settings' | 'maintenance';
```

- [ ] **Step 2: Add to `ALL_MODULES` (around line 5535)**

Find:
```typescript
  { id: 'settings', label: 'App Settings' },
];
```
Replace with:
```typescript
  { id: 'settings', label: 'App Settings' },
  { id: 'maintenance', label: 'Maintenance' },
];
```

- [ ] **Step 3: Update `AdminDashboard` signature to accept `maintenanceSettings`**

Find:
```typescript
const AdminDashboard = ({ profile, isSuperAdmin, settings, onRefreshSettings, onImpersonate }: { profile: Profile, isSuperAdmin: boolean, settings: AppSettings | null, onRefreshSettings: () => void, onImpersonate?: (p: Profile) => void }) => {
```
Replace with:
```typescript
const AdminDashboard = ({ profile, isSuperAdmin, settings, onRefreshSettings, onImpersonate, maintenanceSettings: initialMaintenanceSettings }: { profile: Profile, isSuperAdmin: boolean, settings: AppSettings | null, onRefreshSettings: () => void, onImpersonate?: (p: Profile) => void, maintenanceSettings?: MaintenanceSettings | null }) => {
```

- [ ] **Step 4: Add local maintenance state inside `AdminDashboard` body**

Find the first `useState` in `AdminDashboard` (the `activeTab` state around line 5539) and add before it:
```typescript
  const [localMaintenanceSettings, setLocalMaintenanceSettings] = React.useState<MaintenanceSettings | null>(initialMaintenanceSettings ?? null);
  React.useEffect(() => { setLocalMaintenanceSettings(initialMaintenanceSettings ?? null); }, [initialMaintenanceSettings]);
```

- [ ] **Step 5: Render `MaintenanceTab` in the tab content area**

Find the admin tab content render section — look for where `activeTab === 'settings'` is rendered (search for `activeTab === 'settings'`). Add after it:
```typescript
          {activeTab === 'maintenance' && (
            <MaintenanceTab
              settings={localMaintenanceSettings}
              onSaved={setLocalMaintenanceSettings}
              profile={profile}
            />
          )}
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire MaintenanceTab into AdminDashboard"
```

---

## Task 10: Manual Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test full maintenance**

1. Log in as `super_admin` or `admin`
2. Go to Maintenance tab
3. Set mode = Full, message = "Test maintenance", activate immediately, no end time
4. Save
5. Open a new incognito window and log in as a regular `user` — should see `MaintenanceScreen` with the message
6. Log in as a `rider` — should also see `MaintenanceScreen`
7. Admin still sees full dashboard — confirm no `MaintenanceScreen`

- [ ] **Step 3: Test half maintenance**

1. Set mode = Half, activate immediately, save
2. As `user`: go to select ride step — Book Ride button should be greyed out saying "Unavailable — Maintenance"
3. As `user`: amber marquee banner should be visible at the top
4. As `rider`: Go Online button should be greyed out saying "Unavailable — Maintenance"
5. As `rider`: remit tab should be hidden from nav
6. As `rider`: amber marquee banner should be visible at the top
7. History, news, profile upload all still work for both

- [ ] **Step 4: Test scheduling**

1. Set mode = Full, start time = 2 minutes from now, end time = 5 minutes from now
2. Users should see normal app until start time
3. After start: users see `MaintenanceScreen`
4. After end: users see normal app again (60s interval check)

- [ ] **Step 5: Test auto news post**

1. Set mode = Full, check "Post announcement", save
2. Go to News tab in admin — should see a new "System Maintenance" post
3. Update the settings (change message), save again — same post updated, no duplicate

- [ ] **Step 6: Test Realtime propagation**

1. Have two browser windows open (admin + user)
2. Admin sets mode = Full
3. User window should switch to `MaintenanceScreen` within seconds without refresh

- [ ] **Step 7: Commit final**

```bash
git add src/App.tsx
git commit -m "feat: complete maintenance module"
```
