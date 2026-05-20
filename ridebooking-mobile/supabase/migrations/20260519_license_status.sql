-- Rename drivers_license_url to license_url to match the app's Profile interface
ALTER TABLE profiles RENAME COLUMN drivers_license_url TO license_url;

-- Add license_status column for per-document approval tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'unsubmitted';
