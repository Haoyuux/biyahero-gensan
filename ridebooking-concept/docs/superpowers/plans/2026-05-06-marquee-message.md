# Marquee Message Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a custom marquee text input to the Maintenance tab that replaces the auto-generated scrolling banner text during half maintenance mode; falls back to the auto-generated text when empty.

**Architecture:** Add `marquee_message` column to the `maintenance` Supabase table, extend the `MaintenanceSettings` TypeScript interface, wire a new text input in `MaintenanceTab`, and update `MaintenanceBanner` to prefer the custom text over the auto-generated fallback.

**Tech Stack:** React 19 + TypeScript, Supabase (postgres_changes realtime), Tailwind CSS 4

---

### Task 1: Add `marquee_message` column to Supabase

**Files:**

- No code file — SQL migration run in Supabase SQL editor

- [ ] **Step 1: Run migration in Supabase dashboard SQL editor**

```sql
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS marquee_message text DEFAULT NULL;
```

- [ ] **Step 2: Verify column exists**

In Supabase Table Editor, open the `maintenance` table and confirm `marquee_message` column is present with type `text`, nullable.

---

### Task 2: Extend `MaintenanceSettings` interface

**Files:**

- Modify: `src/lib/maintenanceService.ts`

- [ ] **Step 1: Add field to interface**

In `src/lib/maintenanceService.ts`, update `MaintenanceSettings`:

```ts
export interface MaintenanceSettings {
  id: number;
  mode: MaintenanceMode;
  message: string | null;
  marquee_message: string | null; // ← add this line
  scheduled_start: string | null;
  scheduled_end: string | null;
  post_news: boolean;
  auto_news_post_id: string | null;
  reg_user_disabled: boolean;
  reg_rider_disabled: boolean;
  updated_at: string;
}
```

No other changes needed — `getMaintenanceSettings` uses `select('*')` so it picks up the new column automatically, and `updateMaintenanceSettings` spreads the partial so it will persist `marquee_message` when included.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/maintenanceService.ts
git commit -m "feat: add marquee_message to MaintenanceSettings interface"
```

---

### Task 3: Add marquee input to `MaintenanceTab`

**Files:**

- Modify: `src/App.tsx` (around lines 9544–9862)

- [ ] **Step 1: Add local state for `marqueeMessage`**

In `MaintenanceTab`, after the existing `message` state (line ~9547), add:

```ts
const [marqueeMessage, setMarqueeMessage] = React.useState(
  settings?.marquee_message ?? "",
);
```

- [ ] **Step 2: Add input section after the Message textarea**

In the JSX, after the closing `</div>` of the Message section (around line 9792, just before the `{mode !== "off" && (` post-news block), insert:

```tsx
{
  /* Marquee Text */
}
<div>
  <p className="text-xs font-normal text-gray-400 uppercase tracking-widest mb-3">
    Marquee Text
  </p>
  <input
    type="text"
    value={marqueeMessage}
    onChange={(e) => setMarqueeMessage(e.target.value)}
    placeholder="System is under partial maintenance. Some features are temporarily unavailable."
    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
  />
  <p className="text-[11px] text-gray-400 mt-1.5 ml-1">
    Shown in the scrolling banner during half maintenance. Leave blank to use
    the default.
  </p>
</div>;
```

- [ ] **Step 3: Include `marquee_message` in `handleSave`**

In `handleSave`, update the `updateMaintenanceSettings` call (around line 9662) to include the new field:

```ts
const ok = await updateMaintenanceSettings({
  mode,
  message: message || null,
  marquee_message: marqueeMessage || null, // ← add this line
  scheduled_start: startIso,
  scheduled_end: endIso,
  post_news: mode !== "off" && postNews,
  auto_news_post_id,
  reg_user_disabled: regUserDisabled,
  reg_rider_disabled: regRiderDisabled,
});
```

- [ ] **Step 4: Include `marquee_message` in the `updated` object passed to `onSaved`**

Update the `updated` object (around line 9674) to include:

```ts
const updated: MaintenanceSettings = {
  id: 1,
  mode,
  message: message || null,
  marquee_message: marqueeMessage || null, // ← add this line
  scheduled_start: startIso,
  scheduled_end: endIso,
  post_news: mode !== "off" && postNews,
  auto_news_post_id,
  reg_user_disabled: regUserDisabled,
  reg_rider_disabled: regRiderDisabled,
  updated_at: new Date().toISOString(),
};
```

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add marquee text input to MaintenanceTab"
```

---

### Task 4: Update `MaintenanceBanner` to use custom text

**Files:**

- Modify: `src/App.tsx` (around lines 941–990)

- [ ] **Step 1: Replace `text` resolution in `MaintenanceBanner`**

The current `MaintenanceBanner` builds `text` from schedule dates (lines ~960–968). Replace the entire `let text: string;` block with:

```ts
const autoText = (() => {
  if (start && now < start) {
    return `Scheduled maintenance on ${fmt(start)}${end ? ` until ${fmt(end)}` : ""}. Some features will be temporarily unavailable.`;
  } else if (end) {
    return `System maintenance in progress — expected back ${fmt(end)}.`;
  }
  return "System is under partial maintenance. Some features are temporarily unavailable.";
})();

const text = settings.marquee_message?.trim() || autoText;
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

1. Start dev server: `npm run dev`
2. In admin → Maintenance tab, set mode to **Half**, enter custom marquee text, save.
3. Open user or rider view — confirm the scrolling banner shows the custom text.
4. Clear the marquee text field, save — confirm the banner falls back to the auto-generated text.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: use custom marquee_message in MaintenanceBanner with auto-generated fallback"
```
