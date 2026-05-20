-- Allow authenticated riders to update their own license_url and license_status.
-- The existing dashboard-created UPDATE policy may have a WITH CHECK that blocks
-- setting license_status = 'pending'. Adding this permissive policy ensures the
-- update is allowed as long as the user is updating their own row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'riders_update_own_license'
  ) THEN
    CREATE POLICY "riders_update_own_license"
    ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;
