# UCLA RSU Housing Tracker — Deploy Guide

## Architecture

Data is stored in `data/housing.json` in the git repo. A GitHub Action runs hourly, fetches the UCLA Housing CSV from Box, parses it, appends a new snapshot to the JSON file, and commits. Each commit triggers an automatic Vercel redeploy, so the site stays up to date with zero manual effort.

## Setup

### 1. Install and test locally

```bash
unzip ucla-rsu-tracker.zip -d ucla-rsu-tracker
cd ucla-rsu-tracker
npm install
npm run dev
# Open http://localhost:3000
```

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Deploy — you'll get a live URL

### 4. Enable the GitHub Action

The Action at `.github/workflows/fetch-data.yml` runs every hour automatically. It needs write access to push commits:

1. Go to your GitHub repo → **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select **Read and write permissions**
3. Save

### 5. Test the Action

1. Go to **Actions** tab in your repo
2. Click **Fetch Housing Data** → **Run workflow**
3. Watch it fetch the CSV and commit `data/housing.json`
4. Vercel will auto-redeploy

## How it works

- **GitHub Action** fetches the CSV from UCLA's Box link every hour
- Parses building, room type, gender, bed spaces, and the "Last Updated" timestamp
- Appends a snapshot to `data/housing.json` and commits
- **Vercel** auto-deploys on each push
- The site reads `data/housing.json` and renders the table, filters, and trend charts
- Duplicate snapshots (same "Last Updated" timestamp) are automatically skipped

## Important notes

- The Box URL may require the file to be publicly shared. If the Action fails to fetch, check that the link is still active.
- You can also manually run the Action anytime from the Actions tab.
- The `data/housing.json` file will grow over RSU week as snapshots accumulate. This is fine — even 100+ snapshots is small.
- To reset data, delete the contents of `data/housing.json` (set it to `{"snapshots":[],"lastUpdated":null}`), commit, and push.
