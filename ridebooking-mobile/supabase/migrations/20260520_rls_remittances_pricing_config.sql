-- Enable RLS on remittances (policies already exist but RLS was not enabled)
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;

-- Riders: read own remittances
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remittances' AND policyname = 'riders_read_own_remittances'
  ) THEN
    CREATE POLICY "riders_read_own_remittances"
    ON public.remittances FOR SELECT TO authenticated
    USING (auth.uid() = rider_id);
  END IF;
END $$;

-- Riders: insert own remittances
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remittances' AND policyname = 'riders_insert_own_remittances'
  ) THEN
    CREATE POLICY "riders_insert_own_remittances"
    ON public.remittances FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = rider_id);
  END IF;
END $$;

-- Admins: full access to remittances
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'remittances' AND policyname = 'admins_all_remittances'
  ) THEN
    CREATE POLICY "admins_all_remittances"
    ON public.remittances FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'team_leader')
      )
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on pricing_config
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pricing_config (needed for fare calculation)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pricing_config' AND policyname = 'authenticated_read_pricing_config'
  ) THEN
    CREATE POLICY "authenticated_read_pricing_config"
    ON public.pricing_config FOR SELECT TO authenticated
    USING (true);
  END IF;
END $$;

-- Admins only can write pricing_config
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pricing_config' AND policyname = 'admins_write_pricing_config'
  ) THEN
    CREATE POLICY "admins_write_pricing_config"
    ON public.pricing_config FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
      )
    );
  END IF;
END $$;
