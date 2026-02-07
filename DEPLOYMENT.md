# Production deployment (Firebase App Hosting)

Use the **same Firebase project and APIs** as local so production behaves like local: same Firestore, Storage, and Auth.

## 1. Create secrets in Google Cloud

In [Google Cloud Console](https://console.cloud.google.com/) → **Security** → **Secret Manager**, create secrets with these **exact** names (same as in `apphosting.yaml`):

| Secret name | Value | Where to get it |
|-------------|--------|------------------|
| `RESEND_API_KEY` | `re_xxxx...` | [Resend API keys](https://resend.com/api-keys) |
| `GOOGLE_PLACES_API_KEY` | Your API key | Google Cloud Console → APIs & Services → Credentials (enable Places API) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full JSON on one line | Firebase Console → Project settings → Service accounts → Generate new key. Then: `node -e "console.log(JSON.stringify(require('./path/to/key.json')))"` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web app API key | Firebase Console → Project settings → General → Your apps → Web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | Same Web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID | Same Web app config |

Use the **same** Firebase project as local (`roofix-768a5`). Copy values from your `.env.local` if you prefer.

**Grant App Hosting access to secrets:** If you created secrets in the Cloud Console (instead of `firebase apphosting:secrets:set`), the App Hosting backend must be granted access. List your backend and region with `firebase apphosting:backends:list --project roofix-768a5`, then from the project root run (use your backend name and region; example below uses `roofix-website` and `us-east4`):

```bash
firebase apphosting:secrets:grantaccess RESEND_API_KEY --backend roofix-website --location us-east4 --project roofix-768a5
firebase apphosting:secrets:grantaccess GOOGLE_PLACES_API_KEY --backend roofix-website --location us-east4 --project roofix-768a5
firebase apphosting:secrets:grantaccess FIREBASE_SERVICE_ACCOUNT_KEY --backend roofix-website --location us-east4 --project roofix-768a5
firebase apphosting:secrets:grantaccess NEXT_PUBLIC_FIREBASE_API_KEY --backend roofix-website --location us-east4 --project roofix-768a5
firebase apphosting:secrets:grantaccess NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --backend roofix-website --location us-east4 --project roofix-768a5
firebase apphosting:secrets:grantaccess NEXT_PUBLIC_FIREBASE_APP_ID --backend roofix-website --location us-east4 --project roofix-768a5
```

Then redeploy. See [Configure secret parameters](https://firebase.google.com/docs/app-hosting/configure#secret-parameters).

## 2. Deploy Firestore and Storage rules

From the project root:

```bash
npm run deploy:storage   # or: npx firebase-tools deploy --only storage
npx firebase-tools deploy --only firestore
```

This applies:

- **Firestore:** public read; create/update/delete only for signed-in admins (`users/{uid}.role == "admin"`).
- **Storage:** `content/**` public read; write only when signed in (control-centre uploads).

## 3. GA4: public site + control-centre Analytics

- **`NEXT_PUBLIC_GA4_ID`** (e.g. `G-XXXX`): Measurement ID for the **public site**. Enables page views and conversion events (lead_submit, call_click, quote_click). Safe to expose.
- **`GA4_PROPERTY_ID`** (numeric): Used by the **control-centre Analytics** page (`/control-centre/analytics`) to fetch metrics via the Google Analytics Data API and show a custom dashboard (summary cards + trend chart). Set in `apphosting.yaml` or env; keep the value private (server-only).
  - **Setup:** In [Google Cloud Console](https://console.cloud.google.com/) (same project as Firebase), enable **Google Analytics Data API**. In GA4 → Admin → Property → **Property access management**, add your **Firebase service account** email (from the key JSON) as a **Viewer**. The Property ID is in GA4 Admin → Property settings (numeric, e.g. `123456789`).

## 4. (Optional) Adjust production env in `apphosting.yaml`

- `CONTACT_FORM_TO_EMAIL` and `CONTACT_FORM_FROM_EMAIL` are set for Roofix; change if needed.
- `FIREBASE_PROJECT_ID` and the `NEXT_PUBLIC_FIREBASE_*` value entries are set for `roofix-768a5`. If you use another project, update them (and create secrets for any you switch to secret).

## 5. Deploy the app

Deploy via Firebase App Hosting (Git integration or CLI). The build will read env and secrets; the app will use the same Firestore, Storage, and Auth as local.

---

## Verifying GA4 (local and production)

1. **Realtime report:** In GA4 → Reports → Realtime, open your site and click around; you should see active users and events.
2. **DebugView:** In GA4 → Admin → DebugView, add `?debug_mode=true` to the URL of your site (or use the Chrome extension “Google Analytics Debugger”) and trigger a conversion (submit contact form, click Call, or click a quote CTA). You should see `lead_submit`, `call_click`, or `quote_click` with optional `location` parameter.
3. **Tag Assistant / GA Debugger:** Use [Tag Assistant](https://tagassistant.google.com/) or the “Google Analytics Debugger” Chrome extension to confirm the GA4 tag loads and events fire. No secrets are sent; only the Measurement ID and event data go to Google.

**Summary:** Create the 6 secrets in Secret Manager, set `NEXT_PUBLIC_GA4_ID` and `GA4_PROPERTY_ID` for production (and enable Google Analytics Data API + add service account to GA4), deploy Firestore + Storage rules, then deploy the app. APIs and storage in production are the same as local.

---

## Contact form works locally but not in production

Production does **not** use `.env.local`. It uses secrets from **Google Cloud Secret Manager**.

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select the same project as Firebase (e.g. `roofix-768a5`) → **Security** → **Secret Manager**.
2. Find the secret **`RESEND_API_KEY`**:
   - If it doesn’t exist: **Create secret** → name `RESEND_API_KEY` → set the secret value to your Resend key (e.g. `re_xxxx...`, no quotes) → Create.
   - If it exists: open it → **New version** → paste the same key that works in `.env.local` (no quotes) → Add new version.
3. **Redeploy** the app (e.g. push a commit to trigger App Hosting, or deploy via Firebase CLI). The running app only picks up the new secret after a new deployment.
4. Test the contact form on the live site again.
