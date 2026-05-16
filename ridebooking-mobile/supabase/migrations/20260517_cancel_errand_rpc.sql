CREATE OR REPLACE FUNCTION public.cancel_errand(p_errand_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rider_id uuid;
  v_status text;
BEGIN
  SELECT user_id, rider_id, status
    INTO v_user_id, v_rider_id, v_status
    FROM errands
   WHERE id = p_errand_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- must be the booking user or the assigned rider
  IF auth.uid() IS DISTINCT FROM v_user_id AND auth.uid() IS DISTINCT FROM v_rider_id THEN
    RETURN false;
  END IF;

  -- already terminal
  IF v_status IN ('cancelled', 'completed') THEN
    RETURN true;
  END IF;

  UPDATE errands
     SET status = 'cancelled', completed_at = now()
   WHERE id = p_errand_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_errand(uuid) TO authenticated;
