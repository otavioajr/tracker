-- Geocercas: suporte a múltiplas formas (polygon, rectangle, circle)
-- Mantém `area GEOMETRY(POLYGON)` obrigatório para todos os tipos.
-- Círculos adicionalmente guardam `center` (POINT) e `radius_m` exatos para render fiel no UI.

CREATE TYPE geofence_shape AS ENUM ('polygon', 'rectangle', 'circle');

ALTER TABLE geofences
  ADD COLUMN shape_type geofence_shape NOT NULL DEFAULT 'polygon',
  ADD COLUMN center GEOMETRY(POINT, 4326),
  ADD COLUMN radius_m NUMERIC(10, 2);

ALTER TABLE geofences
  ADD CONSTRAINT geofences_circle_consistency CHECK (
    (shape_type = 'circle' AND center IS NOT NULL AND radius_m IS NOT NULL AND radius_m > 0)
    OR (shape_type <> 'circle' AND center IS NULL AND radius_m IS NULL)
  );

COMMENT ON COLUMN geofences.shape_type IS 'Tipo da forma desenhada; "rectangle" e "polygon" guardam apenas area, "circle" também guarda center e radius_m.';
COMMENT ON COLUMN geofences.center IS 'Centro do círculo em EPSG:4326. NULL quando shape_type != circle.';
COMMENT ON COLUMN geofences.radius_m IS 'Raio do círculo em metros. NULL quando shape_type != circle.';

-- View com geometrias serializadas como GeoJSON para o frontend consumir sem parser WKT/WKB.
CREATE OR REPLACE VIEW geofences_geojson
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  name,
  type,
  active,
  shape_type,
  radius_m,
  ST_AsGeoJSON(area)::jsonb AS area,
  CASE WHEN center IS NULL THEN NULL ELSE ST_AsGeoJSON(center)::jsonb END AS center,
  created_at,
  updated_at
FROM geofences;

COMMENT ON VIEW geofences_geojson IS 'Geocercas com area e center como GeoJSON JSONB — usada pelo frontend. RLS herda da tabela base via security_invoker.';
