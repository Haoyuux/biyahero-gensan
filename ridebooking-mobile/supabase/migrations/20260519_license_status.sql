ALTER TABLE profiles ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'unsubmitted';
