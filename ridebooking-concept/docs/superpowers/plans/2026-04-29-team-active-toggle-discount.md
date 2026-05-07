# Team Active Toggle & Booking Fee Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-controlled Active toggle per team; when a team is active and a rider submits remittance for a scheduled day, their booking fee to remit is discounted by a configurable %.

**Architecture:** Add `is_active` column to Supabase `teams` table. Expose `toggleTeamActive()` in `teamService.ts`. Add `teamBookingFeeDiscount` to `PricingConfig` in `fareService.ts` (localStorage). Discount logic is computed client-side in `RiderDashboard` at remittance time. UI changes are in `App.tsx` (monolithic).

**Tech Stack:** React 19 + TypeScript, Vite 6, Supabase (supabaseAdmin for writes), Tailwind CSS 4, localStorage for pricing config.

---

## File Map

| File                     | Change                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/teamService.ts` | Add `is_active` to `Team` interface + `TEAM_SELECT`; add `toggleTeamActive()`                                               |
| `src/lib/fareService.ts` | Add `teamBookingFeeDiscount` to `PricingConfig`, `DEFAULT_PRICING`, `loadPricingConfig()`                                   |
| `src/App.tsx`            | 4 spots: `TeamManagementPanel` toggle button; Pricing tab discount field; Rider remittance display; Rider remittance submit |

No new files. Supabase migration is a manual SQL step.

---

## Task 1: Supabase Migration

**Files:**

- No file change — run SQL in Supabase dashboard

- [ ] **Step 1: Run migration in Supabase SQL editor**

Go to your Supabase project → SQL Editor → run:

```sql
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
```

- [ ] **Step 2: Verify column exists**

In Supabase Table Editor, open the `teams` table and confirm `is_active` column is present with default `false`.

- [ ] **Step 3: Commit migration note**

```bash
git commit --allow-empty -m "chore: applied teams.is_active migration in Supabase"
```

---

## Task 2: Update `teamService.ts`

**Files:**

- Modify: `src/lib/teamService.ts`

- [ ] **Step 1: Add `is_active` to `Team` interface and `TEAM_SELECT`**

In `src/lib/teamService.ts`, replace:

```ts
export interface Team {
  id: string;
  name: string;
  capacity: number;
  schedule_days: number[]; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  leader_id: string | null;
  created_by: string | null;
  created_at: string;
  leader?: Pick<
    Profile,
    "id" | "full_name" | "first_name" | "last_name" | "avatar_url"
  > | null;
  members?: TeamMember[];
}
```

with:

```ts
export interface Team {
  id: string;
  name: string;
  capacity: number;
  schedule_days: number[]; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  is_active: boolean;
  leader_id: string | null;
  created_by: string | null;
  created_at: string;
  leader?: Pick<
    Profile,
    "id" | "full_name" | "first_name" | "last_name" | "avatar_url"
  > | null;
  members?: TeamMember[];
}
```

- [ ] **Step 2: Add `is_active` to `TEAM_SELECT`**

Replace:

```ts
const TEAM_SELECT =
  "id, name, capacity, schedule_days, leader_id, created_by, created_at, leader:profiles!teams_leader_id_fkey(id, full_name, first_name, last_name, avatar_url)";
```

with:

```ts
const TEAM_SELECT =
  "id, name, capacity, schedule_days, is_active, leader_id, created_by, created_at, leader:profiles!teams_leader_id_fkey(id, full_name, first_name, last_name, avatar_url)";
```

- [ ] **Step 3: Add `toggleTeamActive` function**

Append after `removeTeamMember`:

```ts
export async function toggleTeamActive(
  teamId: string,
  isActive: boolean,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("teams")
    .update({ is_active: isActive })
    .eq("id", teamId);
  if (error) console.error("toggleTeamActive:", error);
  return !error;
}
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teamService.ts
git commit -m "feat: add is_active to Team interface and toggleTeamActive()"
```

---

## Task 3: Update `fareService.ts`

**Files:**

- Modify: `src/lib/fareService.ts`

- [ ] **Step 1: Add `teamBookingFeeDiscount` to `PricingConfig`**

Replace:

```ts
export interface PricingConfig {
  moto: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
}
```

with:

```ts
export interface PricingConfig {
  moto: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
  teamBookingFeeDiscount: number; // percentage 0-100, applied at remittance time
}
```

- [ ] **Step 2: Add default value**

Replace:

```ts
export const DEFAULT_PRICING: PricingConfig = {
  moto: {
```

with:

```ts
export const DEFAULT_PRICING: PricingConfig = {
  teamBookingFeeDiscount: 0,
  moto: {
```

- [ ] **Step 3: Merge `teamBookingFeeDiscount` in `loadPricingConfig`**

Replace:

```ts
return {
  moto: { ...DEFAULT_PRICING.moto, ...parsed.moto },
  eco: { ...DEFAULT_PRICING.eco, ...parsed.eco },
  premium: { ...DEFAULT_PRICING.premium, ...parsed.premium },
};
```

with:

```ts
return {
  teamBookingFeeDiscount:
    parsed.teamBookingFeeDiscount ?? DEFAULT_PRICING.teamBookingFeeDiscount,
  moto: { ...DEFAULT_PRICING.moto, ...parsed.moto },
  eco: { ...DEFAULT_PRICING.eco, ...parsed.eco },
  premium: { ...DEFAULT_PRICING.premium, ...parsed.premium },
};
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fareService.ts
git commit -m "feat: add teamBookingFeeDiscount to PricingConfig"
```

---

## Task 4: Add Toggle Button to `TeamManagementPanel`

**Files:**

- Modify: `src/App.tsx` — `TeamManagementPanel` component (lines ~3802–4200)

- [ ] **Step 1: Import `toggleTeamActive` in the import line**

Find the teamService import line (~line 21):

```ts
import {
  fetchTeams,
  fetchTeamWithMembers,
  fetchMyTeam,
  fetchRiderMembership,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  type Team,
  type TeamMember,
} from "@/src/lib/teamService";
```

Replace with:

```ts
import {
  fetchTeams,
  fetchTeamWithMembers,
  fetchMyTeam,
  fetchRiderMembership,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  toggleTeamActive,
  type Team,
  type TeamMember,
} from "@/src/lib/teamService";
```

- [ ] **Step 2: Add `handleToggleActive` handler inside `TeamManagementPanel`**

Inside `TeamManagementPanel`, after the `handleRemoveMember` function, add:

```ts
const handleToggleActive = async (teamId: string, current: boolean) => {
  const next = !current;
  setTeams((prev) =>
    prev.map((t) => (t.id === teamId ? { ...t, is_active: next } : t)),
  );
  await toggleTeamActive(teamId, next);
};
```

- [ ] **Step 3: Add toggle button to team card row**

Inside the team card row, find the div that contains the edit and delete buttons:

```tsx
<div className="flex items-center gap-2 shrink-0">
  <button
    onClick={() =>
      setEditingTeam(editingTeam?.id === team.id ? null : { ...team })
    }
    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
  >
    <Edit3 size={14} />
  </button>
  <button
    onClick={() => handleDelete(team.id)}
    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
  >
    <Trash2 size={14} />
  </button>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 shrink-0">
  <button
    onClick={() => handleToggleActive(team.id, team.is_active)}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-normal transition-colors ${
      team.is_active
        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
        : "bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200"
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full ${team.is_active ? "bg-emerald-500" : "bg-gray-400"}`}
    />
    {team.is_active ? "Active" : "Inactive"}
  </button>
  <button
    onClick={() =>
      setEditingTeam(editingTeam?.id === team.id ? null : { ...team })
    }
    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
  >
    <Edit3 size={14} />
  </button>
  <button
    onClick={() => handleDelete(team.id)}
    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
  >
    <Trash2 size={14} />
  </button>
</div>
```

- [ ] **Step 4: Add green left border to active team card**

Find the team card outer div:

```tsx
              <div key={team.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
```

Replace with:

```tsx
              <div key={team.id} className={`bg-white rounded-2xl border overflow-hidden transition-colors ${team.is_active ? 'border-emerald-200 border-l-4 border-l-emerald-400' : 'border-gray-100'}`}>
```

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add active/inactive toggle button to team management panel"
```

---

## Task 5: Add Team Discount % to Pricing Config Tab

**Files:**

- Modify: `src/App.tsx` — Pricing Config tab in `AdminDashboard` (~line 5700+)

- [ ] **Step 1: Find the Save/Reset buttons block in the Pricing Config tab**

Find this block at the end of the pricing config section:

```tsx
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={() => { savePricingConfig(pricingCfg); setPricingSaved(true); }}
                  className="px-6 py-2.5 bg-gray-950 text-white font-normal text-sm rounded-xl hover:bg-gray-800 transition-colors"
                >
                  Save Pricing
                </button>
```

- [ ] **Step 2: Add team discount card above the Save/Reset buttons**

Insert this block immediately before `<div className="mt-5 flex items-center gap-3">`:

```tsx
<div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
  <div className="px-5 py-4 border-b border-gray-100 bg-emerald-50/40">
    <h3 className="font-normal text-sm text-gray-900">
      Team Booking Fee Discount
    </h3>
    <p className="text-[11px] text-gray-400 mt-0.5">
      Applied when a team is active and the rider is on schedule for the
      remittance date.
    </p>
  </div>
  <div className="p-5">
    <label className="block text-[10px] font-normal text-gray-400 uppercase tracking-widest mb-1.5">
      Discount Percentage
    </label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={pricingCfg.teamBookingFeeDiscount}
        onChange={(e) => {
          const val = Math.min(
            100,
            Math.max(0, parseFloat(e.target.value) || 0),
          );
          setPricingCfg((prev) => ({ ...prev, teamBookingFeeDiscount: val }));
          setPricingSaved(false);
        }}
        className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      />
      <span className="text-gray-400 text-sm font-semibold">%</span>
      {pricingCfg.teamBookingFeeDiscount > 0 && (
        <span className="text-[11px] text-emerald-600 font-normal bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
          e.g. ₱50 fee → remit ₱
          {(50 * (1 - pricingCfg.teamBookingFeeDiscount / 100)).toFixed(0)}
        </span>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add team booking fee discount % field to pricing config tab"
```

---

## Task 6: Discount Logic & Display in Rider Remittance Tab

**Files:**

- Modify: `src/App.tsx` — `RiderDashboard` remittance section

- [ ] **Step 1: Load pricing config in `RiderDashboard`**

In `RiderDashboard`, find the state declarations block (around line 2365). After the `remitStats` state line:

```ts
const [remitStats, setRemitStats] = useState<{
  ridesCount: number;
  earnings: number;
  bookingFee: number;
}>({ ridesCount: 0, earnings: 0, bookingFee: 0 });
```

Add:

```ts
const [pricingCfg] = useState<PricingConfig>(() => loadPricingConfig());
```

- [ ] **Step 2: Add discount computation (derived values, no new state)**

After the `pricingCfg` line just added, add:

```ts
const isDiscountEligible = (() => {
  const team = riderTeam ?? myTeam;
  if (!team || !team.is_active) return false;
  const dow = new Date(remitDate + "T00:00:00").getDay();
  return (team.schedule_days ?? []).includes(dow);
})();
const discountPct = isDiscountEligible ? pricingCfg.teamBookingFeeDiscount : 0;
const discountAmount = Math.round((remitStats.bookingFee * discountPct) / 100);
const feeToRemit = remitStats.bookingFee - discountAmount;
```

> Note: `riderTeam` is set for riders who are team members; `myTeam` is set for team leaders. The `??` picks whichever is available. `new Date(remitDate + 'T00:00:00')` forces local-time parsing so `.getDay()` matches the rider's timezone.

- [ ] **Step 3: Update the "Due Fee" card to show discount**

Find the Due Fee card:

```tsx
<div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
  <p className="text-[11px] font-normal text-emerald-600 uppercase tracking-wider mb-1">
    Due Fee
  </p>
  <p className="text-xl font-bold text-emerald-700">₱{remitStats.bookingFee}</p>
  <p className="text-[11px] text-emerald-600/70 mt-1">To remit</p>
</div>
```

Replace with:

```tsx
<div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
  <p className="text-[11px] font-normal text-emerald-600 uppercase tracking-wider mb-1">
    Due Fee
  </p>
  {discountAmount > 0 ? (
    <>
      <p className="text-sm font-normal text-emerald-400 line-through">
        ₱{remitStats.bookingFee}
      </p>
      <p className="text-xl font-bold text-emerald-700">₱{feeToRemit}</p>
      <p className="text-[11px] text-emerald-600 font-normal mt-1 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Team {discountPct}% discount
      </p>
    </>
  ) : (
    <>
      <p className="text-xl font-bold text-emerald-700">
        ₱{remitStats.bookingFee}
      </p>
      <p className="text-[11px] text-emerald-600/70 mt-1">To remit</p>
    </>
  )}
</div>
```

- [ ] **Step 4: Update the submit button to pass `feeToRemit`**

Find the `createRemittance` call inside the submit button `onClick`:

```ts
await createRemittance(
  initialProfile.id,
  initialProfile.full_name || "",
  initialProfile.avatar_url,
  remitDate,
  remitStats.earnings,
  remitStats.bookingFee,
  remitStats.bookingFee, // default to paying full amount
  url,
  remitStats.ridesCount,
);
```

Replace with:

```ts
await createRemittance(
  initialProfile.id,
  initialProfile.full_name || "",
  initialProfile.avatar_url,
  remitDate,
  remitStats.earnings,
  remitStats.bookingFee,
  feeToRemit,
  url,
  remitStats.ridesCount,
);
```

- [ ] **Step 5: Update remittance history cards to show discount**

Find the history card amount display:

```tsx
<p className="font-bold text-[15px] text-gray-900">₱{r.amount_remitted}</p>
```

Replace with:

```tsx
<p className="font-bold text-[15px] text-gray-900">₱{r.amount_remitted}</p>;
{
  r.amount_remitted < r.total_booking_fee && (
    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
      was ₱{r.total_booking_fee} ·{" "}
      {Math.round((1 - r.amount_remitted / r.total_booking_fee) * 100)}% team
      discount
    </p>
  );
}
```

- [ ] **Step 6: Add discount label to team leader remittances subtab**

Find the rider name sub-line in the `teamRemittances.map` block:

```tsx
<div className="flex items-center gap-2 mt-0.5 flex-wrap">
  <span className="text-[10px] text-gray-400">
    {r.rides_count} ride{r.rides_count !== 1 ? "s" : ""}
  </span>
  <span className="text-[10px] text-gray-300">·</span>
  <span className="text-[10px] text-gray-400">
    ₱{r.amount_remitted.toFixed(2)} remitted
  </span>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 mt-0.5 flex-wrap">
  <span className="text-[10px] text-gray-400">
    {r.rides_count} ride{r.rides_count !== 1 ? "s" : ""}
  </span>
  <span className="text-[10px] text-gray-300">·</span>
  <span className="text-[10px] text-gray-400">
    ₱{r.amount_remitted.toFixed(2)} remitted
  </span>
  {r.amount_remitted < r.total_booking_fee && (
    <>
      <span className="text-[10px] text-gray-300">·</span>
      <span className="text-[10px] text-emerald-600 font-normal">
        {Math.round((1 - r.amount_remitted / r.total_booking_fee) * 100)}%
        discount
      </span>
    </>
  )}
</div>
```

- [ ] **Step 7: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: apply team booking fee discount in rider remittance tab"
```

---

## Task 7: Manual Browser Verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify Team Management toggle**

1. Log in as admin → Team Management tab
2. Confirm each team card shows `○ Inactive` pill by default
3. Click toggle on a team → pill turns `● Active` (green), card gets green left border
4. Refresh page → team still shows Active (confirmed Supabase persistence)

- [ ] **Step 3: Verify Pricing Config discount field**

1. Log in as super_admin → Pricing Config tab
2. Scroll to bottom — confirm "Team Booking Fee Discount" card appears
3. Set discount to `50` → example shows `₱50 fee → remit ₱25`
4. Click Save Pricing

- [ ] **Step 4: Verify remittance discount display**

1. Make sure a team is Active and today's day-of-week is in its `schedule_days`
2. Log in as a rider who is a member of that team
3. Go to Remittance tab → select today's date
4. "Due Fee" card shows: strikethrough original, discounted total, "Team 50% discount" badge
5. Select a date whose day is NOT in schedule → Due Fee shows no discount

- [ ] **Step 5: Verify remittance history discount label**

1. Submit a remittance with discount active
2. In Submission History, confirm discounted record shows `was ₱X · Y% team discount` sub-line

- [ ] **Step 6: Final lint**

```bash
npm run lint
```

Expected: no errors.
