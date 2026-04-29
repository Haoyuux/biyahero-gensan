# Team Active Toggle & Booking Fee Discount

**Date:** 2026-04-29

## Overview

Admins can toggle a team as Active/Inactive. When a team is active and a rider submits remittance for a day that matches their team's schedule, the booking fee they must remit is discounted by a configurable percentage. The discount % is set in the Pricing Config (super admin only).

---

## Requirements

- Admin-only toggle (Active / Inactive) per team in Team Management panel
- Toggle state persists in Supabase (`teams.is_active`)
- One global team booking fee discount % configured in Pricing Config (super admin), stored in localStorage alongside existing pricing
- Discount applies at remittance time when:
  1. Rider's team `is_active === true`
  2. The remittance date's day-of-week is in the team's `schedule_days`
- Discount applies to leader and all members equally
- Remittance display shows original fee, discount line, and discounted total
- `amount_remitted` stored in Supabase is the discounted amount

---

## Section 1: Database & Service Layer

### Supabase Migration

```sql
ALTER TABLE teams ADD COLUMN is_active BOOLEAN DEFAULT FALSE;
```

### `Team` Interface Update (`src/lib/teamService.ts`)

```ts
export interface Team {
  // ...existing fields...
  is_active: boolean;
}
```

Add `is_active` to `TEAM_SELECT` constant.

### New Function

```ts
export async function toggleTeamActive(teamId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin.from('teams').update({ is_active: isActive }).eq('id', teamId);
  if (error) console.error('toggleTeamActive:', error);
  return !error;
}
```

### `PricingConfig` Update (`src/lib/fareService.ts`)

```ts
export interface PricingConfig {
  moto: TierPricing;
  eco: TierPricing;
  premium: TierPricing;
  teamBookingFeeDiscount: number; // percentage 0-100
}

export const DEFAULT_PRICING: PricingConfig = {
  // ...existing...
  teamBookingFeeDiscount: 0,
};
```

`loadPricingConfig()` merges `teamBookingFeeDiscount` from localStorage (defaults to 0).

---

## Section 2: Admin Team Management UI (`TeamManagementPanel`)

### Toggle Button

- Placed next to edit/delete buttons on each team card row
- **Active state**: green pill — `● Active`
- **Inactive state**: gray pill — `○ Inactive`
- Clicking calls `toggleTeamActive(team.id, !team.is_active)`, updates local state optimistically
- Team card row shows a green left border (`border-l-4 border-emerald-400`) when active

### Pricing Config Tab Addition

Below the existing tier cards, add a new card (super admin only):

```
Team Booking Fee Discount
[ % ] [ 0 ]
Applied when team is active and rider is on schedule for the remittance date.
```

Saved alongside existing pricing via `savePricingConfig()`.

---

## Section 3: Remittance Logic & Display

### Discount Eligibility Check

At remittance tab load (rider side), after fetching team membership:

```ts
function isTeamDiscountEligible(team: Team | null, remitDate: string): boolean {
  if (!team || !team.is_active) return false;
  const dow = new Date(remitDate).getDay(); // 0=Sun...6=Sat
  return (team.schedule_days ?? []).includes(dow);
}
```

### Discounted Fee Calculation

```ts
const discount = pricingConfig.teamBookingFeeDiscount; // e.g. 50
const discountAmount = Math.round(remitStats.bookingFee * discount / 100);
const feeToRemit = remitStats.bookingFee - discountAmount;
```

### "Due Fee" Card Display (Rider Remittance Tab)

When discount applies:
```
Due Fee
₱50  [strikethrough — original]
₱25  [bold green — to remit]
🟢 Team Discount 50% off
```

When no discount:
```
Due Fee
₱50
To remit
```

### Remittance Submission

Pass `feeToRemit` (discounted amount) as `amount_remitted` to `createRemittance()`.

### Remittance History Cards

Show: `₱25 remitted` with a sub-line `(was ₱50 · 50% team discount)` when `amount_remitted < bookingFee`.

### Team Leader Remittances Subtab

Each member row shows the same discount badge if applicable.

---

## Discount Logic Summary

| Condition | Result |
|-----------|--------|
| Team inactive OR no team | No discount — remit full booking fee |
| Team active + day not in schedule | No discount |
| Team active + day in schedule | Discount applies to booking fee |

---

## Scope Boundaries

- Booking fee charged to passengers is **not changed** — discount only affects what the rider remits
- Discount is global (one % for all teams) — no per-team discount
- Toggle is manual — admin controls when team is active
- No automatic schedule-based auto-activation
