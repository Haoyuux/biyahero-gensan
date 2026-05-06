# Marquee Message Customization — Design Spec
Date: 2026-05-06

## Overview
Add a custom marquee text input to the Maintenance tab. When set, this text replaces the auto-generated message in the `MaintenanceBanner` (shown during half maintenance mode). When empty, the banner falls back to its existing auto-generated schedule-based text.

## Scope
- Affects: `MaintenanceBanner` (user + rider views), `MaintenanceTab` (admin), `MaintenanceSettings` type, `maintenanceService.ts`
- Only visible during `half` maintenance mode (existing behavior unchanged)

## DB Change
Add column to `maintenance` table:
```sql
ALTER TABLE maintenance ADD COLUMN marquee_message text DEFAULT NULL;
```

## Type Change (`maintenanceService.ts`)
Add to `MaintenanceSettings` interface:
```ts
marquee_message: string | null;
```

## MaintenanceTab (`App.tsx`)
- Add local state: `const [marqueeMessage, setMarqueeMessage] = React.useState(settings?.marquee_message ?? "")`
- New section below the Message textarea, labeled **"Marquee Text"**
- Single-line `<input type="text">` with placeholder: `"System is under partial maintenance. Some features are temporarily unavailable."`
- Helper text: `"Shown in the scrolling banner during half maintenance. Leave blank to use the default."`
- Include `marquee_message: marqueeMessage || null` in the `updateMaintenanceSettings` call inside `handleSave`
- Include in the `updated` object passed to `onSaved`

## MaintenanceBanner (`App.tsx`, line ~960)
Change the `text` resolution logic:
```ts
const text = settings.marquee_message?.trim()
  || (auto-generated text from schedule dates — existing logic)
```

## Default Message
When `marquee_message` is null or empty, the banner shows the existing auto-generated text:
- Scheduled (future): `"Scheduled maintenance on {date}..."`
- Active with end: `"System maintenance in progress — expected back {date}."`
- Active no end: `"System is under partial maintenance. Some features are temporarily unavailable."`

## Out of Scope
- No changes to full maintenance mode or `MaintenanceScreen`
- No changes to the existing `message` field (used for news posts / maintenance screen)
- No marquee outside of half mode
