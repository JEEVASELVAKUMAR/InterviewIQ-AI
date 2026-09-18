/*
# InterviewIQ AI — Phase 0: notifications link_path + profile avatar_url

## Overview
Adds two nullable columns required by Phase 0 features:
1. `notifications.link_path` — stores the in-app route a notification should
   navigate to when clicked (e.g. `/mock-interview?id=<uuid>`). This fixes the
   bug where clicking a notification did nothing — the bell now routes the
   user directly to the referenced page/section.
2. `profiles.avatar_url` — stores the profile picture URL pulled from a Google
   account on Google Sign-In. Nullable so existing email/password users
   (who have no Google avatar) remain valid.

## Modified Tables
1. `notifications` — added nullable `link_path text`.
2. `profiles` — added nullable `avatar_url text`.

## Security
- No new tables; RLS already enabled on both tables.
- No policy changes needed (existing owner-scoped CRUD covers the new columns).

## Backward Compatibility
- Both columns are nullable with no default, so existing rows stay valid.
- No data migration required.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'link_path'
  ) THEN
    ALTER TABLE notifications ADD COLUMN link_path text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text;
  END IF;
END $$;
