# ESOP Manager — Complete Setup Guide
**Estimated time: 30–45 minutes. One-time only.**

---

## What you're setting up
| Service | What it does | Cost |
|---|---|---|
| **Supabase** | Database + Google login + File storage | Free |
| **Vercel** | Hosts the app online | Free |
| **Resend** | Sends emails with grant letters | Free (3,000/month) |
| **Claude API** | Reads PDFs automatically | Pay per use (~₹0.10/PDF) |

---

## STEP 1 — Supabase (Database + Auth + Storage)

### 1a. Create account
1. Go to **https://supabase.com** → Sign Up (use your Google account)
2. Create a new project:
   - Name: `esop-manager`
   - Database password: choose a strong password, **save it somewhere**
   - Region: `South Asia (Mumbai)` — closest to India
3. Wait ~2 minutes for the project to provision

### 1b. Run the database schema
1. In your Supabase project → left sidebar → **SQL Editor**
2. Click **New Query**
3. Open the file `supabase/schema.sql` from this project
4. Paste the entire contents into the SQL editor
5. Click **Run** (green button)
6. You should see "Success. No rows returned"

### 1c. Enable Google Authentication
1. Supabase left sidebar → **Authentication** → **Providers**
2. Find **Google** → click to expand → toggle **Enable**
3. You need Google OAuth credentials. Open a new tab:
   - Go to **https://console.cloud.google.com**
   - Create a new project (or use existing)
   - Left menu → **APIs & Services** → **Credentials**
   - Click **+ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `ESOP Manager`
   - Under **Authorized redirect URIs** → Add:
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
     *(replace `your-project-ref` with your actual Supabase project ref — found in Settings → General)*
   - Click **Create**
   - Copy the **Client ID** and **Client Secret**
4. Back in Supabase Google provider → paste Client ID and Client Secret → **Save**

### 1d. Get your Supabase keys
1. Supabase left sidebar → **Settings** → **API**
2. Copy and save these (you'll need them in Step 3):
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ`)
   - **service_role key** (another long string — keep this secret!)

### 1e. Storage buckets are created automatically
The schema.sql file creates the `grant-letters` and `generated-pdfs` buckets for you.

---

## STEP 2 — Resend (Email sending)

1. Go to **https://resend.com** → Sign up
2. Left sidebar → **Domains** → Add your company domain (e.g. `yourcompany.com`)
3. Follow their DNS verification steps (add 3 DNS records to your domain — takes 5-10 mins)
4. Once verified, go to **API Keys** → Create API Key → copy it
5. Note your verified domain (you'll use it as the `from` email: `hr@yourcompany.com`)

> **Don't have a domain?** Use `onboarding@resend.dev` temporarily — works for testing.

---

## STEP 3 — Deploy to Vercel

### 3a. Push code to GitHub
1. Create a free account at **https://github.com** if you don't have one
2. Create a new repository called `esop-manager` (private)
3. Upload this entire project folder to GitHub:
   ```bash
   # If you have Git installed:
   cd esop-app
   git init
   git add .
   git commit -m "Initial ESOP Manager"
   git remote add origin https://github.com/YOUR_USERNAME/esop-manager.git
   git push -u origin main
   ```
   Or use GitHub Desktop (https://desktop.github.com) — drag and drop the folder

### 3b. Deploy on Vercel
1. Go to **https://vercel.com** → Sign up with GitHub
2. Click **Add New Project**
3. Import your `esop-manager` repository
4. Framework: **Next.js** (auto-detected)
5. Before clicking Deploy, click **Environment Variables** and add ALL of these:

```
NEXT_PUBLIC_SUPABASE_URL        = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ... (anon key from Step 1d)
SUPABASE_SERVICE_ROLE_KEY       = eyJ... (service role key from Step 1d)
RESEND_API_KEY                  = re_... (from Step 2)
RESEND_DOMAIN                   = yourcompany.com (your verified domain)
ANTHROPIC_API_KEY               = sk-ant-... (your Claude API key)
NEXT_PUBLIC_APP_URL             = https://esop-manager.vercel.app (you'll update this after deploy)
NEXT_PUBLIC_COMPANY_NAME        = Your Company Pvt Ltd
```

6. Click **Deploy** — takes ~2 minutes
7. Copy your app URL (e.g. `https://esop-manager.vercel.app`)
8. Go back to Vercel → Project Settings → Environment Variables
   → Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL

### 3c. Add Vercel URL to Google OAuth
1. Go back to Google Cloud Console → Credentials → your OAuth client
2. Add to **Authorized redirect URIs**:
   ```
   https://esop-manager.vercel.app/auth/callback
   ```
3. Also add to **Authorized JavaScript origins**:
   ```
   https://esop-manager.vercel.app
   ```
4. Save

---

## STEP 4 — First Login & Make Yourself Admin

1. Open your app at `https://esop-manager.vercel.app`
2. Click **Continue with Google** — sign in with your work Google account
3. You'll land on the dashboard (empty for now — that's fine)
4. Now go to Supabase → SQL Editor → Run this query:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```
   *(Replace with your actual email)*
5. Refresh the app — you now have full admin access

---

## STEP 5 — Add Your Team

For each colleague who needs access:
1. Tell them to go to your app URL and sign in with Google
2. They'll get `viewer` role by default
3. You (admin) go to **User Management** in the sidebar
4. Change their role to `editor` or `admin` as needed

**Role permissions:**
- **Admin**: Everything — add/edit/delete records, manage users, set valuation, download data
- **Editor**: Add and edit records, upload PDFs/CSV. Cannot delete or manage users.
- **Viewer**: Read-only. Can view all data and download reports.

---

## STEP 6 — Link Employees for Self-Service

For employees to log in with Google and see their own grants:
1. Go to **Employees** → click an employee
2. In the edit form, enter their **personal email** (the Google account they'll use)
3. Employee goes to: `https://your-app.vercel.app/employee-portal`
4. They enter their employee code — no password needed

> To give them Google login (so they sign in with Google instead of just employee code):
> Go to Supabase → SQL Editor:
> ```sql
> UPDATE employees
> SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'employee@gmail.com')
> WHERE employee_code = 'XIN005';
> ```

---

## STEP 7 — Upload Your Existing Data

**Option A — CSV (fastest, free)**
1. Go to **Upload Data** → **CSV Bulk Import**
2. Download the template, fill it in, upload
3. Your exact format from the template you shared is supported

**Option B — PDF Extraction (needs Claude API key)**
1. Go to **Upload Data** → **PDF Extraction**
2. Drop all 150 PDFs at once
3. Claude reads each one, extracts all data (3 at a time, auto-retry)

**Option C — Bulk Grant Letters**
1. Rename your PDF files to start with the grant number: `G-0001_Priya_Sharma.pdf`
2. Go to **Upload Data** → **Bulk Grant Letters**
3. Drop all files — they auto-match to the correct grant records

---

## STEP 8 — Set Current Fair Value

1. Go to **Valuation** in the sidebar
2. Add today's fair value per option (₹ amount)
3. Add historical valuations for past dates — the system keeps the full history
4. All vesting calculations, forecasts, and the employee portal automatically use the correct valuation for any date

---

## Custom Domain (Optional)
1. Buy a domain like `esop.yourcompany.com`
2. Vercel → Project Settings → Domains → Add domain
3. Follow Vercel's DNS instructions
4. Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables

---

## Troubleshooting

**"Failed to fetch" on PDF upload**
→ Check that `ANTHROPIC_API_KEY` is set correctly in Vercel environment variables

**Google login not working**
→ Make sure your Vercel URL is added to Google OAuth's authorized redirect URIs AND authorized origins

**Email not sending**
→ Check that your Resend domain is verified (DNS records can take up to 24 hours)
→ Temporarily use `onboarding@resend.dev` as the from address for testing

**"User not found" after first login**
→ Run the SQL to set yourself as admin (Step 4)

**Data not showing up**
→ Check Supabase → Table Editor → make sure tables exist (schema.sql ran successfully)

---

## What's where in the app

| Page | What it does |
|---|---|
| Dashboard | Overview of all grants — vested, lapsed, pipeline, current value |
| Employees | All employees with vesting progress |
| Grants | All grants with grant numbers, letters, status |
| Upload | PDF extraction, CSV import, bulk grant letter upload |
| Valuation | Add valuations by date — full history maintained |
| User Management | Assign roles to team members (admin only) |
| Employee Portal | `yourapp.vercel.app/employee-portal` — employees view their own data |

---

## Support
If anything goes wrong, take a screenshot and share it. Common issues are usually:
1. A missing environment variable in Vercel
2. The SQL schema didn't fully run
3. Google OAuth redirect URI mismatch
