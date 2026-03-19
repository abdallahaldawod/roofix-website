# Control Centre – Mobile / iPhone layout audit

Short list of desktop-only layout problems identified for the mobile-first PWA work.

## Navigation
- **Sidebar-only on mobile:** All sections are behind the hamburger drawer; no bottom tab bar. Poor discoverability on iPhone.
- **No “More” grouping:** Primary (Dashboard, Leads, Analytics) and secondary (Pages, Projects, Services, Testimonials, Lead Management) are mixed in one list.

## Tables
- **Leads list (LeadsPageClient):** Wide table (Customer, Source, Suburb, Score, Cost, Posted, Reasons, Actions); `overflow-x-auto` only; no card/list fallback on small viewports. Row action buttons (Accept/Decline/Waitlist, View) are small.
- **Sources table:** Many columns (Source Name, Platform, Type, Status, Mode, Rule Set, Auth, Last Scan, New leads today, Scanner, Actions); horizontal scroll only.
- **Rule sets table:** Same pattern; horizontal scroll.
- **Activity tab table:** Same pattern; horizontal scroll.

## Controls
- **Checkboxes:** `h-4 w-4`; hit area below 44px. Table sort headers may be hard to tap.
- **Action buttons:** Some inline buttons (e.g. in leads table) not consistently 44px.
- **Dropdowns:** DateRangeDropdown uses `min-w-[280px]`; may need full-width or 44px trigger on mobile.

## Analytics
- **Chart:** Fixed `h-56` on mobile; X-axis `angle={-40}` for long ranges; tooltips and axis labels need verification on touch.
- **Date range:** Trigger button should be full-width or min 44px height on mobile.

## Lead management
- **Tabs (Sources / Rule Sets / Activity / Settings):** Horizontal tabs with `gap-6`; can overflow on 320px. Need scrollable or stacked tabs.

## Modals / overlays
- **ActivityLeadModal:** Already bottom-sheet on mobile (`items-end`), good.
- **Others:** Ensure all modals/dropdowns respect safe-area and don’t overflow viewport on iPhone.

## PWA
- **Manifest:** No control-centre-specific manifest; root `site.webmanifest` is site-wide. No `start_url`/`scope` for admin-only installs.
- **Service worker:** None; required for reliable “Add to Home Screen” on iOS.

## Login
- **Form:** Submit and “Back to site” already use `min-h-[44px]`. Input fields could use 44px-min tap height for consistency.

## Summary
- Add bottom tab bar (Dashboard, Leads, Analytics, More) and keep drawer for full nav.
- Replace wide tables with mobile card/list layouts below `md`.
- Enforce 44px minimum tap targets for buttons, inputs, checkboxes, and dropdown triggers.
- Make lead management tabs scrollable or stacked on narrow screens.
- Add control-centre manifest and minimal service worker for installability.
