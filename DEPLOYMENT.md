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

## 2. Deploy Firestore and Storage rules

From the project root:

```bash
npm run deploy:storage   # or: npx firebase-tools deploy --only storage
npx firebase-tools deploy --only firestore
```

This applies:

- **Firestore:** public read; create/update/delete only for signed-in admins (`users/{uid}.role == "admin"`).
- **Storage:** `content/**` public read; write only when signed in (control-centre uploads).

## 3. (Optional) Adjust production env in `apphosting.yaml`

- `CONTACT_FORM_TO_EMAIL` and `CONTACT_FORM_FROM_EMAIL` are set for Roofix; change if needed.
- `FIREBASE_PROJECT_ID` and the `NEXT_PUBLIC_FIREBASE_*` value entries are set for `roofix-768a5`. If you use another project, update them (and create secrets for any you switch to secret).

## 4. Deploy the app

Deploy via Firebase App Hosting (Git integration or CLI). The build will read env and secrets; the app will use the same Firestore, Storage, and Auth as local.

---

**Summary:** Create the 6 secrets in Secret Manager, deploy Firestore + Storage rules, then deploy the app. APIs and storage in production are the same as local.
