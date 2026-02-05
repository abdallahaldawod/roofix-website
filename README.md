This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3100](http://localhost:3100) with your browser to see the result.

## Local API configuration

To use the **contact form** (email) and **address autocomplete** locally:

1. Copy the example env file:
   ```bash
   cp .env.local.example .env.local
   ```
2. Edit `.env.local` and set:
   - **GOOGLE_PLACES_API_KEY** — from [Google Cloud Console](https://console.cloud.google.com/) (enable Places API, create an API key).
   - **RESEND_API_KEY** — from [Resend](https://resend.com/api-keys) (keys start with `re_`).
   - **CONTACT_FORM_TO_EMAIL** — email address where contact form submissions are sent.
   - **CONTACT_FORM_FROM_EMAIL** (optional) — sender address; if omitted, Resend’s test sender is used (you can only send to your Resend account email).
3. Restart the dev server after changing `.env.local`.

### Admin panel (Control Centre)

The site has a hidden admin panel at **/control-centre** (not linked from the public site) for managing projects, services, and testimonials.

**Folder structure (relevant to admin + Firebase):**

```
app/
  control-centre/           # Admin UI (no header/footer from main site)
    layout.tsx              # Auth guard + conditional dashboard layout
    page.tsx                 # Dashboard home
    login/page.tsx           # Email/password login
    projects/page.tsx        # CRUD + image upload for projects
    services/page.tsx        # CRUD for services
    testimonials/page.tsx    # CRUD for testimonials
    auth-guard.tsx           # Redirects unauthenticated / non-admin to login
    control-centre-wrapper.tsx
    dashboard-layout.tsx     # Sidebar nav
    use-auth.ts              # Firebase Auth + Firestore users/{uid}.role
lib/
  firebase/
    client.ts                # Browser: auth, Firestore, Storage (NEXT_PUBLIC_*)
    admin.ts                 # Server: Firestore read (FIREBASE_SERVICE_ACCOUNT_KEY)
    upload.ts                # Upload image to Storage, return URL
  data.ts                    # Server-only: getProjects, getServices, getTestimonials (read-only)
  firestore-types.ts         # Project, Service, Testimonial, UserDoc
firestore.rules              # Public read; write only if users/{uid}.role == "admin"
storage.rules                # Read all; write if request.auth != null (content/*)
```

**Firebase setup:**

1. **Firebase Console**: Create a project, enable **Authentication** (Email/Password), **Firestore**, and **Storage**.
2. **Firestore**: Create collections `projects`, `services`, `testimonials`, and `users`. For each admin user, add a document in `users` with document ID = their Firebase Auth UID and fields: `email`, `role: "admin"`.
3. **Deploy rules**: `firebase deploy --only firestore:rules` and `firebase deploy --only storage`.
4. **Env**: Copy `.env.local.example` and set `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY` (server), and all `NEXT_PUBLIC_FIREBASE_*` (client) from Project settings → General and Service accounts.

**Auth guard:** Only signed-in users with `users/{uid}.role === "admin"` can access `/control-centre`. Login is Email/Password; role is read from Firestore `users` (each user can read their own doc via rules).

**Image upload:** In the Projects CRUD form, images are uploaded to Firebase Storage under `content/projects/` and the returned URLs are stored in the project’s `imageUrls` array in Firestore.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
