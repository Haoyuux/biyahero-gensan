CREATE OR REPLACE FUNCTION public.accept_errand(
  p_errand_id uuid,
  p_rider_name text DEFAULT NULL,
  p_rider_avatar text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE errands
     SET status = 'accepted',
         rider_id = auth.uid(),
         rider_name = p_rider_name,
         rider_avatar = p_rider_avatar
   WHERE id = p_errand_id
     AND status = 'pending'
     AND rider_id IS NULL
   RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_errand(uuid, text, text) TO authenticated;
