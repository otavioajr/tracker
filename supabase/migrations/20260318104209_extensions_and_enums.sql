-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enums
CREATE TYPE tenant_plan AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE user_role AS ENUM ('admin_platform', 'client');
CREATE TYPE device_protocol AS ENUM ('suntech');
CREATE TYPE geofence_type AS ENUM ('inclusion', 'exclusion');
CREATE TYPE alert_type AS ENUM ('speed', 'geofence', 'ignition', 'battery');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
