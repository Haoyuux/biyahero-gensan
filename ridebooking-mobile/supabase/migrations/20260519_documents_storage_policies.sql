-- Storage RLS policies for the 'documents' bucket
-- Riders upload license at: <uid>/license.ext
-- Riders upload vehicle docs at: vehicles/<uid>/<vehicle_id>/<subfolder>.ext
-- upsert: true in the client requires INSERT + SELECT + UPDATE

DO $$
BEGIN
  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'riders_insert_own_documents'
  ) THEN
    CREATE POLICY "riders_insert_own_documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'documents' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (
          (storage.foldername(name))[1] = 'vehicles'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    );
  END IF;

  -- SELECT (required so upsert can check if the file already exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'riders_select_own_documents'
  ) THEN
    CREATE POLICY "riders_select_own_documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'documents' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (
          (storage.foldername(name))[1] = 'vehicles'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    );
  END IF;

  -- UPDATE (required for upsert when file already exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'riders_update_own_documents'
  ) THEN
    CREATE POLICY "riders_update_own_documents"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'documents' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (
          (storage.foldername(name))[1] = 'vehicles'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    )
    WITH CHECK (
      bucket_id = 'documents' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (
          (storage.foldername(name))[1] = 'vehicles'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    );
  END IF;
END $$;
