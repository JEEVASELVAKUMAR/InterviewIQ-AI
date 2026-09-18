/*
# InterviewIQ AI — Admin demographics: status column + admin RLS policies

## Overview
1. Adds a `status` column to `profiles` so the admin dashboard can report
   user demographics by employment status (Student / Employee / Graduate /
   Job Seeker / Other).
2. Adds an admin-only SELECT policy on `profiles` so that users flagged as
   admin (via `raw_app_meta_data.role = 'admin'`) can read ALL profile rows
   in aggregate for the demographics dashboard. Non-admin users are still
   restricted to their own row by the existing `select_own_profiles` policy.

## Modified Tables
1. `profiles` — added nullable `status text` column with a CHECK constraint
   limiting values to 'Student','Employee','Graduate','Job Seeker','Other'.
   Nullable so existing rows (created before this migration) remain valid;
   the signup form will require it for NEW accounts.

## Security
- New policy `select_all_profiles_admin` on `profiles` FOR SELECT
  TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin').
  This is ADDITIVE — it does not replace the existing `select_own_profiles`
  policy. A user sees their own row via the ownership policy; an admin sees
  all rows (including their own) via this admin policy. Non-admin users
  gain nothing because the admin predicate evaluates to false for them.
- No INSERT / UPDATE / DELETE changes — admins manage user data through
  the Supabase dashboard / service role, not through the client. Regular
  users still only mutate their own row.

## Backward Compatibility
- The `status` column is nullable with no default — no data migration needed.
- No existing policy is dropped or modified.
- No tables or columns dropped or renamed.
*/

-- 1. Add status column to profiles (nullable, CHECK-constrained)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN status text CHECK (status IN ('Student','Employee','Graduate','Job Seeker','Other'));
  END IF;
END $$;

-- 2. Admin-only SELECT policy on profiles (additive — does not replace ownership policy)
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
