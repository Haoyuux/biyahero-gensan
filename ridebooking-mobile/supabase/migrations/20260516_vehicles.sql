-- Vehicles table: stores all rider vehicles (including additional vehicles beyond the first)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_number INT NOT NULL DEFAULT 1,
  vehicle_type TEXT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  vehicle_color TEXT,
  vehicle_image_url TEXT,
  or_url TEXT,
  cr_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT vehicles_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Riders can read their own vehicles
CREATE POLICY "riders_select_own_vehicles" ON vehicles
  FOR SELECT USING (auth.uid() = rider_id);

-- Riders can insert their own vehicles
CREATE POLICY "riders_insert_own_vehicles" ON vehicles
  FOR INSERT WITH CHECK (auth.uid() = rider_id);

-- Riders can update their own vehicles
CREATE POLICY "riders_update_own_vehicles" ON vehicles
  FOR UPDATE USING (auth.uid() = rider_id);
