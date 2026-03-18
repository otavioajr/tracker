-- Helper function: get tenant_id from the authenticated user's JWT
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin_platform'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================
-- ENABLE RLS
-- =====================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

-- =====================
-- TENANTS policies
-- =====================
CREATE POLICY "admin_all_tenants" ON tenants
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_read_own_tenant" ON tenants
  FOR SELECT USING (id = public.get_user_tenant_id());

-- =====================
-- PROFILES policies
-- =====================
CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_read_own_profile" ON profiles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_update_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- =====================
-- DEVICES policies
-- =====================
CREATE POLICY "admin_all_devices" ON devices
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_devices" ON devices
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- VEHICLES policies
-- =====================
CREATE POLICY "admin_all_vehicles" ON vehicles
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_vehicles" ON vehicles
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- POSITIONS policies
-- =====================
CREATE POLICY "admin_read_all_positions" ON positions
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "client_read_own_positions" ON positions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- INSERT is done by the Gateway using service_role key (bypasses RLS)

-- =====================
-- GEOFENCES policies
-- =====================
CREATE POLICY "admin_all_geofences" ON geofences
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_geofences" ON geofences
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- ALERTS policies
-- =====================
CREATE POLICY "admin_all_alerts" ON alerts
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_read_own_alerts" ON alerts
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_update_own_alerts" ON alerts
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id());

-- =====================
-- ALERT_RULES policies
-- =====================
CREATE POLICY "admin_all_alert_rules" ON alert_rules
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_alert_rules" ON alert_rules
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- AUTH TRIGGER: auto-create profile on signup
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
BEGIN
  -- Validate tenant_id is provided and exists
  _tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user metadata';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND active = true) THEN
    RAISE EXCEPTION 'tenant_id % does not exist or is inactive', _tenant_id;
  END IF;

  -- Always assign 'client' role on signup.
  -- Admin role is assigned separately via admin-only API using service_role key.
  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'client'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
