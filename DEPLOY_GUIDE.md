# UCLA RSU Housing Tracker — Deployment Guide

## Quickest Option: Vercel (Free, ~15 min)

This is the recommended approach. You'll get a live URL like `ucla-housing.vercel.app`.

### What you need
- A free [Vercel](https://vercel.com) account (sign up with GitHub)
- A free [GitHub](https://github.com) account
- Node.js installed on your computer ([download here](https://nodejs.org))

### Step-by-step

```bash
# 1. Create the project on your computer
npx create-next-app@latest ucla-housing --typescript --tailwind --app --no-src-dir
cd ucla-housing

# 2. Replace the files with the ones I've provided (see below)

# 3. Install dependencies
npm install papaparse recharts

# 4. Test locally
npm run dev
# Open http://localhost:3000 in your browser

# 5. Deploy
npx vercel
# Follow the prompts, link to your Vercel account
# You'll get a live URL instantly
```

### How the admin password works
- The app has an "Admin Upload" button
- Clicking it prompts for a password
- Only the correct password lets you upload a new CSV
- Regular visitors can only view/filter the data
- Set your password as an **environment variable** in Vercel:
  - Go to your Vercel dashboard → Project → Settings → Environment Variables
  - Add: `ADMIN_PASSWORD` = `your-secret-password-here`

---

## Alternative: Netlify (also free)

Same idea, slightly different deploy command:
```bash
npm run build
npx netlify deploy --prod --dir=.next
```

## Alternative: Railway / Render (free tier)

Good if you want a traditional server. Same code works.

---

## File Structure

After running `create-next-app`, replace/create these files:

```
ucla-housing/
├── app/
│   ├── layout.tsx          (keep default)
│   ├── page.tsx            ← replace with provided file
│   ├── globals.css         ← replace with provided file
│   └── api/
│       ├── data/
│       │   └── route.ts    ← create this (API endpoint)
│       └── upload/
│           └── route.ts    ← create this (admin upload endpoint)
├── data/
│   └── housing.json        ← create this (data storage)
├── package.json
└── .env.local              ← create this (password)
```

## Setting Your Admin Password

Create a `.env.local` file in the project root:

```
ADMIN_PASSWORD=your-secret-password-here
```

**Never commit this file to GitHub.** It's already in `.gitignore` by default.

On Vercel, add this same variable in Settings → Environment Variables.
