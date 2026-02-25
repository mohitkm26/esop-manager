-- ═══════════════════════════════════════════════════════════════════
-- ESOP MANAGER — SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM TYPES ──────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE vest_status AS ENUM ('pending', 'vested', 'lapsed');
CREATE TYPE grant_status AS ENUM ('draft', 'active', 'cancelled');

-- ── PROFILES (extends Supabase auth.users) ──────────────────────────
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  role            user_role NOT NULL DEFAULT 'viewer',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── EMPLOYEES ────────────────────────────────────────────────────────
CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  employee_code   TEXT NOT NULL UNIQUE,
  personal_email  TEXT,
  official_email  TEXT,
  phone           TEXT,
  department      TEXT,
  designation     TEXT,
  join_date       DATE,
  exit_date       DATE,
  auth_user_id    UUID REFERENCES auth.users(id),
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GRANTS ───────────────────────────────────────────────────────────
CREATE TABLE grants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_number    TEXT NOT NULL UNIQUE,  -- G-0001, G-0002 ...
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  grant_date      DATE NOT NULL,
  total_options   INTEGER NOT NULL CHECK (total_options > 0),
  status          grant_status NOT NULL DEFAULT 'active',
  source_file     TEXT,           -- original PDF filename
  letter_path     TEXT,           -- Supabase Storage path for grant letter PDF
  letter_signed   BOOLEAN DEFAULT false,
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── VESTING EVENTS ───────────────────────────────────────────────────
CREATE TABLE vesting_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id        UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  vest_date       DATE NOT NULL,
  options_count   INTEGER NOT NULL CHECK (options_count > 0),
  status          vest_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── VALUATIONS ───────────────────────────────────────────────────────
CREATE TABLE valuations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  effective_date  DATE NOT NULL UNIQUE,
  fair_value      NUMERIC(12,4) NOT NULL CHECK (fair_value > 0),
  note            TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GRANT LETTER UPLOADS (bulk PDF storage) ──────────────────────────
CREATE TABLE grant_letters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id        UUID REFERENCES grants(id) ON DELETE SET NULL,
  grant_number    TEXT,           -- extracted from filename prefix
  storage_path    TEXT NOT NULL,  -- Supabase Storage path
  filename        TEXT NOT NULL,
  file_size       INTEGER,
  matched         BOOLEAN DEFAULT false,
  uploaded_by     UUID REFERENCES profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── AUDIT LOG ────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  table_name      TEXT NOT NULL,
  record_id       UUID,
  action          TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  old_data        JSONB,
  new_data        JSONB,
  performed_by    UUID REFERENCES profiles(id),
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER grants_updated_at    BEFORE UPDATE ON grants    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on Google sign-in
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-lapse vesting events when employee exits
CREATE OR REPLACE FUNCTION lapse_future_vesting()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.exit_date IS NOT NULL AND (OLD.exit_date IS NULL OR OLD.exit_date != NEW.exit_date) THEN
    UPDATE vesting_events
    SET status = 'lapsed'
    WHERE employee_id = NEW.id
      AND vest_date > NEW.exit_date
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_employee_exit
  AFTER UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION lapse_future_vesting();

-- Auto-vest events that have passed
CREATE OR REPLACE FUNCTION refresh_vesting_status()
RETURNS void AS $$
BEGIN
  UPDATE vesting_events ve
  SET status = 'vested'
  FROM employees e
  WHERE ve.employee_id = e.id
    AND ve.vest_date <= CURRENT_DATE
    AND ve.status = 'pending'
    AND (e.exit_date IS NULL OR ve.vest_date <= e.exit_date);
END;
$$ LANGUAGE plpgsql;

-- Sequential grant number generator
CREATE OR REPLACE FUNCTION next_grant_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(grant_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num FROM grants;
  RETURN 'G-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_letters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is admin or editor
CREATE OR REPLACE FUNCTION is_admin_or_editor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','editor') AND is_active = true);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_active = true);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: users see own profile, admins see all
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (id = auth.uid() OR is_admin_or_editor());
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (is_admin());

-- EMPLOYEES: internal users see all; employee sees own row via auth_user_id
CREATE POLICY "employees_internal" ON employees FOR ALL USING (is_admin_or_editor());
CREATE POLICY "employees_viewer_select" ON employees FOR SELECT USING (current_user_role() = 'viewer');
CREATE POLICY "employees_self" ON employees FOR SELECT USING (auth_user_id = auth.uid());

-- GRANTS: internal users see all; employee sees own via employee.auth_user_id
CREATE POLICY "grants_internal" ON grants FOR ALL USING (is_admin_or_editor());
CREATE POLICY "grants_viewer_select" ON grants FOR SELECT USING (current_user_role() = 'viewer');
CREATE POLICY "grants_self" ON grants FOR SELECT USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.id = grants.employee_id AND e.auth_user_id = auth.uid())
);

-- VESTING_EVENTS: same pattern
CREATE POLICY "vesting_internal" ON vesting_events FOR ALL USING (is_admin_or_editor());
CREATE POLICY "vesting_viewer" ON vesting_events FOR SELECT USING (current_user_role() = 'viewer');
CREATE POLICY "vesting_self" ON vesting_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.id = vesting_events.employee_id AND e.auth_user_id = auth.uid())
);

-- VALUATIONS: all authenticated users can read; only admin can write
CREATE POLICY "valuations_read" ON valuations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "valuations_write" ON valuations FOR ALL USING (is_admin());

-- GRANT_LETTERS: internal users manage; employee sees own
CREATE POLICY "letters_internal" ON grant_letters FOR ALL USING (is_admin_or_editor());
CREATE POLICY "letters_self" ON grant_letters FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM grants g JOIN employees e ON e.id = g.employee_id
    WHERE g.id = grant_letters.grant_id AND e.auth_user_id = auth.uid()
  )
);

-- AUDIT LOG: admin read only, system writes
CREATE POLICY "audit_admin_read" ON audit_log FOR SELECT USING (is_admin());

-- ═══════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS (run after creating buckets in Supabase dashboard)
-- ═══════════════════════════════════════════════════════════════════

-- Create these two private buckets in Supabase Storage dashboard:
-- 1. "grant-letters"  (private, 50MB limit)
-- 2. "generated-pdfs" (private, 10MB limit)

-- Storage policies (run after creating buckets):
INSERT INTO storage.buckets (id, name, public) VALUES ('grant-letters', 'grant-letters', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-pdfs', 'generated-pdfs', false) ON CONFLICT DO NOTHING;

CREATE POLICY "letters_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'grant-letters' AND is_admin_or_editor());
CREATE POLICY "letters_read_internal" ON storage.objects FOR SELECT USING (bucket_id = 'grant-letters' AND is_admin_or_editor());
CREATE POLICY "pdfs_manage" ON storage.objects FOR ALL USING (bucket_id = 'generated-pdfs' AND is_admin_or_editor());

-- ═══════════════════════════════════════════════════════════════════
-- SEED: Make first user admin (run AFTER first Google sign-in)
-- Replace 'your@email.com' with your email
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
