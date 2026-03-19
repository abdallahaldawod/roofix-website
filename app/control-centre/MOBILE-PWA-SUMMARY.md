# Control Centre Mobile-First PWA – Implementation Summary

## Files changed

### Layout and navigation
- **`app/control-centre/dashboard-layout.tsx`** – Added bottom tab bar (mobile), safe-area padding for top bar and main content, bottom padding for tab bar; integrated `ControlCentreBottomNav`.
- **`app/control-centre/ControlCentreBottomNav.tsx`** (new) – Mobile-only bottom nav: Dashboard, Leads, Analytics, More (opens drawer). Fixed bottom with safe-area inset.
- **`app/control-centre/layout.tsx`** – Control-centre manifest link (`/control-centre.webmanifest`), `RegisterControlCentreSW` for service worker.

### PWA
- **`public/control-centre.webmanifest`** (new) – Name "Roofix Control Centre", short_name "Control Centre", start_url `/control-centre`, scope `/control-centre/`, display standalone, theme_color, icons (192, 512).
- **`public/sw-control-centre.js`** (new) – Minimal service worker (install/activate only) for iOS Add to Home Screen.
- **`app/control-centre/register-sw.tsx`** (new) – Client component that registers the service worker with scope `/control-centre/`.
- **`app/layout.tsx`** – Viewport: added `viewportFit: "cover"` for notched devices.
- **`app/globals.css`** – Safe-area utility classes (`.safe-top`, `.safe-bottom`, `.safe-left`, `.safe-right`) and `.tap-target` (44px min size).

### Leads
- **`app/control-centre/leads/LeadsPageClient.tsx`** – Mobile card list (visible below `md`) for lead rows; desktop table unchanged. Bulk bar and filter inputs use `min-h-[44px]`; New/Accepted tab buttons 44px.
- **`app/control-centre/leads/SourcesTable.tsx`** – Mobile card list per source; desktop table in `hidden md:block`. Action buttons 44px on mobile.
- **`app/control-centre/leads/RuleSetsTable.tsx`** – Mobile card list per rule set; desktop table in `hidden md:block`. Edit/Delete 44px.
- **`app/control-centre/leads/ActivityTab.tsx`** – Mobile card list for activity rows; desktop table in `hidden md:block`. Filter selects `min-h-[44px]`.
- **`app/control-centre/leads/LeadManagementTabs.tsx`** – Scrollable horizontal tabs on mobile, `min-h-[44px]` per tab.
- **`app/control-centre/leads/management/page.tsx`** – “Back to Leads” link `min-h-[44px]`.

### Analytics
- **`app/control-centre/analytics/page.tsx`** – Chart container `min-h-[220px]` and `h-56` on mobile; date range wrapper full width on mobile; live range buttons `min-h-[44px]` / `min-w-[44px]`.
- **`app/control-centre/analytics/DateRangeDropdown.tsx`** – Trigger button `min-h-[44px]`, full width on mobile (`w-full sm:w-auto`).

### Dashboard, Site Pages, Login
- **`app/control-centre/dashboard-overview.tsx`** – Stat cards `min-h-[44px]`.
- **`app/control-centre/dashboard-cards.tsx`** – Content and Insights cards `min-h-[44px]`.
- **`app/control-centre/site-pages/page.tsx`** – “View on site” and “Edit with live editor” buttons `min-h-[44px]`.
- **`app/control-centre/login/LoginForm.tsx`** – Email and password inputs `min-h-[44px]`.

### Audit and docs
- **`app/control-centre/MOBILE-AUDIT.md`** (new) – Short list of desktop-only layout issues identified.
- **`app/control-centre/MOBILE-PWA-SUMMARY.md`** (this file) – Summary, testing steps, limitations.

---

## How to test on iPhone

1. **Serve over HTTPS**  
   Use a tunnel (e.g. ngrok, Cloudflare Tunnel) or deploy to a host with HTTPS. Safari requires HTTPS for service worker and installability.

2. **Open the control centre**  
   In Safari, go to `https://<your-host>/control-centre` (or your admin subdomain root if configured).

3. **Sign in**  
   Use your admin credentials. Confirm the login form is usable and redirects to the dashboard.

4. **Navigation**  
   - Confirm the **bottom tab bar** shows: Dashboard, Leads, Analytics, More.  
   - Tap **More** and confirm the drawer opens with Pages, Projects, Services, Testimonials, Lead Management, Log out.  
   - Tap **hamburger** and confirm the same drawer opens.  
   - Switch between Dashboard, Leads, Analytics via the bottom bar and confirm the correct page loads.

5. **Leads**  
   - Open Leads; confirm **card list** on mobile (no horizontal scroll).  
   - Tap a lead card “View” (eye) and confirm the lead detail modal opens (bottom-sheet style).  
   - Use Accept/Decline/Waitlist if available; use filters and New/Accepted tabs.

6. **Analytics**  
   - Open Analytics; confirm the **date range** button is full width and at least 44px tall.  
   - Open the date picker and select a range.  
   - Confirm the chart renders and has a fixed height (no layout jump).

7. **Add to Home Screen**  
   - In Safari: Share → **Add to Home Screen**.  
   - Confirm the icon and name (“Control Centre” or “Roofix Control Centre”) appear.  
   - Open the app from the home screen; it should open in **standalone** (no browser UI).  
   - Sign in again if required; confirm navigation and key flows work in standalone.

8. **Session and logout**  
   - In standalone, sign out via the drawer.  
   - Reopen from home screen and confirm you are on the login page.  
   - Sign in again and confirm the session persists until you log out or it expires.

9. **Safe area**  
   - On a notched iPhone, confirm the top bar and bottom tab bar do not sit under the notch or home indicator; content should be fully visible.

---

## Limitations of iPhone PWA vs native app

- **No push notifications** – Web Push may be available in some Safari/PWA contexts but is not implemented here.
- **No background sync** – The app does not run in the background; no background sync or long-running tasks.
- **Storage and session** – Storage and cookies can be cleared under storage pressure. In standalone, session persistence (e.g. Firebase `browserSessionPersistence`) may behave like a separate context; if users lose session after closing and reopening from the home screen, consider `indexedDBLocalPersistence` (if supported by your auth SDK).
- **Standalone window** – No access to some native APIs (e.g. Face ID for login unless using Web Authn).
- **Safari quirks** – e.g. `100vh` can include browser chrome until scroll; the app uses `100dvh` where relevant (e.g. login). Input zoom on focus can be reduced with `font-size: 16px` on inputs (already common in the app).
- **Install prompt** – iOS does not show a browser install banner for PWAs; users must use Share → Add to Home Screen.
- **Updates** – After deploying a new version, users may need to refresh or reopen the PWA to get the latest service worker and assets.
