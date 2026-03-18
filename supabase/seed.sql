-- supabase/seed.sql
-- Development seed data — creates a test tenant, devices, vehicles, geofence, and alert rules
-- Note: UUIDs must use valid hex chars only (a-f, 0-9)
-- Prefix legend: a=tenant, d=device, b=vehicle, e=geofence, f=alert_rule

-- Test tenant
INSERT INTO tenants (id, name, slug, plan)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Demo Fleet', 'demo-fleet', 'starter')
ON CONFLICT (id) DO NOTHING;

-- Test devices
INSERT INTO devices (id, tenant_id, imei, protocol, model, active)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '123456789012345', 'suntech', 'ST340LC', true),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '123456789012346', 'suntech', 'ST340LC', true),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '123456789012347', 'suntech', 'ST340LC', true)
ON CONFLICT (id) DO NOTHING;

-- Test vehicles
INSERT INTO vehicles (id, tenant_id, device_id, plate, brand, model, year, color)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'ABC-1234', 'Toyota', 'Hilux', 2023, 'Branco'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'DEF-5678', 'Fiat', 'Strada', 2024, 'Prata'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'GHI-9012', 'VW', 'Saveiro', 2022, 'Preto')
ON CONFLICT (id) DO NOTHING;

-- Test geofence (polygon around São Paulo city center)
INSERT INTO geofences (id, tenant_id, name, area, type)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Base SP',
  ST_GeomFromText('POLYGON((-46.66 -23.55, -46.64 -23.55, -46.64 -23.53, -46.66 -23.53, -46.66 -23.55))', 4326),
  'inclusion'
)
ON CONFLICT (id) DO NOTHING;

-- Test alert rules
INSERT INTO alert_rules (id, tenant_id, device_id, type, config, notify_email, active)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL, 'speed', '{"max_speed": 120}', false, true),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', NULL, 'geofence', '{"geofence_id": "e0000000-0000-0000-0000-000000000001"}', false, true)
ON CONFLICT (id) DO NOTHING;
