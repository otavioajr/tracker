# Codebase Concerns

**Analysis Date:** 2026-04-05

## Tech Debt

**Gateway flush buffer is write-only:**
- Issue: Failed position batches are enqueued into `Buffer`, but the running gateway never drains or replays buffered positions back into PostgreSQL.
- Files: `gateway/cmd/gateway/main.go`, `gateway/internal/storage/writer.go`, `gateway/internal/storage/buffer.go`
- Impact: A database outage degrades into silent data backlog accumulation and eventual data loss once the in-memory ring reaches capacity.
- Fix approach: Add a replay worker that drains `Buffer`, retries inserts with backoff, and exposes backlog metrics/alerts.

**Partition management is manual and time-bound:**
- Issue: The partitioned `positions` table is created with only two monthly partitions and no automation for future months or retention.
- Files: `supabase/migrations/20260318104457_positions.sql`, `supabase/migrations/20260318110000_add_vehicle_id_to_positions.sql`
- Impact: Ingestion remains operational only while `server_time` lands inside the hardcoded ranges, and long-term storage growth has no cleanup path.
- Fix approach: Add a scheduled partition-management function/job and document retention rules close to the migrations.

**History playback is concentrated in one client component:**
- Issue: Query state, data loading, playback control, route rendering, highlight selection, and empty/loading states all live in one file.
- Files: `web/src/components/map/history-player.tsx`, `web/src/lib/history/history-player-utils.ts`
- Impact: Small changes in history UX or query behavior carry high regression risk because one component owns most of the behavior.
- Fix approach: Split query/loading, playback state, and map rendering into isolated hooks/components and keep `history-player.tsx` as composition.

## Known Bugs

**Reports use different timezone handling than history playback:**
- Symptoms: Reports receive raw `datetime-local` strings, while history playback explicitly converts the same input to ISO before querying.
- Files: `web/src/app/(dashboard)/reports/page.tsx`, `web/src/lib/actions/reports.ts`, `web/src/components/map/history-player.tsx`
- Trigger: Generate a report with local browser timestamps near timezone boundaries or compare report output against history playback for the same interval.
- Workaround: Manually convert report date inputs to UTC before calling `getTripsReport()` or reuse the history conversion path.

**`last_communication_at` stays stale:**
- Symptoms: The device table can show `Nunca` or outdated timestamps even while fresh positions are being ingested.
- Files: `gateway/internal/storage/writer.go`, `gateway/cmd/gateway/main.go`, `web/src/components/devices/device-table.tsx`
- Trigger: Ingest positions normally and inspect the devices screen.
- Workaround: Use `latest_positions.server_time`-based screens such as the dashboard and vehicle views as the fresher signal.

**Geofence alert rules are stored but never evaluated:**
- Symptoms: The schema and seed data allow `geofence` rules, but the engine ignores them and produces no alert.
- Files: `gateway/internal/alerts/engine.go`, `gateway/internal/alerts/sync.go`, `supabase/migrations/20260318104529_geofences_and_alerts.sql`, `supabase/seed.sql`
- Trigger: Create an active `geofence` rule or rely on the seeded geofence rule.
- Workaround: Limit production rules to `speed`, `ignition`, and `battery` until geofence evaluation exists.

**Alert conditions fire on every matching packet:**
- Symptoms: Speed, ignition, and battery alerts are generated statelessly, so sustained rule matches produce repeated rows instead of edge-triggered events.
- Files: `gateway/internal/alerts/engine.go`, `gateway/cmd/gateway/main.go`
- Trigger: Keep a device above the speed threshold or with ignition on across multiple packets.
- Workaround: Downstream consumers must deduplicate alerts by device/type/time window.

## Security Considerations

**Public signup can join any active tenant by UUID:**
- Risk: Registration accepts a free-form `tenant_id`, and signup stays enabled without confirmations or captcha.
- Files: `web/src/components/auth/register-form.tsx`, `web/src/lib/actions/auth.ts`, `supabase/migrations/20260318104558_rls_policies.sql`, `supabase/config.toml`
- Current mitigation: `public.handle_new_user()` checks that the tenant exists and is active.
- Recommendations: Replace raw tenant UUID entry with invite tokens or admin-issued join links, enable email confirmation, and add captcha/rate limits.

**Pending device data is visible across tenants:**
- Risk: Any authenticated user can read all `pending_devices` rows, including serial numbers and source IPs for devices outside their tenant.
- Files: `supabase/migrations/20260319_add_serial_and_pending_devices.sql`, `web/src/lib/actions/pending-devices.ts`, `web/src/components/devices/pending-devices-table.tsx`
- Current mitigation: Write access is still limited, and rows do not carry tenant business data yet.
- Recommendations: Restrict reads to platform admins or introduce a controlled triage flow that assigns ownership before exposure.

**Gateway and metrics endpoints are unauthenticated transport surfaces:**
- Risk: The GPS TCP listener and JSON metrics server start without TLS, client authentication, or request filtering.
- Files: `gateway/cmd/gateway/main.go`, `gateway/internal/server/tcp.go`, `gateway/internal/metrics/metrics.go`, `gateway/internal/config/config.go`
- Current mitigation: Idle connection timeouts reduce some abuse surface.
- Recommendations: Put both ports behind private networking or a proxy, add source allowlists where possible, and treat `METRICS_PORT` as internal-only.

## Performance Bottlenecks

**Initial dashboard load bypasses `latest_positions`:**
- Problem: `getLatestPositions()` fetches active devices first and then runs one latest-position query per device against `positions`.
- Files: `web/src/lib/actions/positions.ts`, `web/src/app/(dashboard)/page.tsx`, `supabase/migrations/20260403_latest_positions_realtime.sql`
- Cause: The realtime table exists for subscriptions, but the initial server render still uses an N+1 scan against the partitioned history table.
- Improvement path: Read from `latest_positions` directly for initial hydration and join vehicle metadata in one query or view.

**Vehicle listing has the same N+1 pattern:**
- Problem: `getVehicles()` enriches each vehicle with a separate latest-position lookup.
- Files: `web/src/lib/actions/vehicles.ts`, `web/src/app/(dashboard)/vehicles/page.tsx`, `web/src/components/vehicles/vehicle-table.tsx`
- Cause: `Promise.all()` issues one `positions` query per vehicle.
- Improvement path: Replace per-vehicle lookups with `latest_positions`, a view, or a single SQL query that returns vehicle status fields together.

**History and report generation load entire ranges into memory:**
- Problem: Long date ranges pull all matching rows into the application and compute playback summaries or trip reports in TypeScript.
- Files: `web/src/lib/actions/positions.ts`, `web/src/lib/actions/reports.ts`, `web/src/components/map/history-player.tsx`, `web/src/app/(dashboard)/reports/page.tsx`
- Cause: Both flows query ordered position ranges without paging, sampling, or SQL-side aggregation.
- Improvement path: Enforce bounded windows, paginate history, and push report aggregation into PostgreSQL/PostGIS or stored procedures.

**Batch flushing can fan out concurrent writes under load:**
- Problem: Every full batch starts `go w.Flush(context.Background())`, which can create many concurrent flush goroutines when ingress is high.
- Files: `gateway/internal/storage/writer.go`
- Cause: Flush triggering is edge-less and not serialized around a single worker.
- Improvement path: Move to one writer goroutine with a bounded channel or explicit flush semaphore.

## Fragile Areas

**Gateway persistence path:**
- Files: `gateway/cmd/gateway/main.go`, `gateway/internal/storage/writer.go`, `gateway/internal/storage/buffer.go`
- Why fragile: The ingest path depends on batching, direct SQL string generation, optional spill-to-disk, and a fallback buffer that has no live replay path.
- Safe modification: Treat the writer and buffer as one unit, add end-to-end failure tests before changing flush semantics, and avoid partial changes to only one side.
- Test coverage: `gateway/internal/storage/writer_test.go` and `gateway/internal/storage/buffer_test.go` cover helper behavior, not database-backed recovery.

**Pending device tracking:**
- Files: `gateway/internal/storage/pending.go`, `supabase/migrations/20260319_add_serial_and_pending_devices.sql`, `web/src/lib/actions/pending-devices.ts`
- Why fragile: Deduplication relies on an in-memory `seen` map with no eviction, while the database table has no retention policy and no tenant ownership.
- Safe modification: Add TTL eviction and cleanup jobs before increasing traffic or exposing the screen more broadly.
- Test coverage: `gateway/internal/storage/pending_test.go` checks only timestamp comparisons and never exercises the database path.

**History player UI:**
- Files: `web/src/components/map/history-player.tsx`, `web/src/components/map/history-map-controller.tsx`, `web/src/components/map/history-mission-sidebar.tsx`
- Why fragile: Query lifecycle, playback, and map rendering are coupled across a large client-only surface, so regressions can appear in multiple interaction modes at once.
- Safe modification: Change one concern at a time and add component tests around the affected interaction before refactoring.
- Test coverage: Coverage exists for several history/map helpers, but not for the full search-to-playback flow.

## Scaling Limits

**Monthly partitions stop at April 2026:**
- Current capacity: `positions_2026_03` and `positions_2026_04` are the only defined partitions.
- Limit: Inserts fail once `server_time` falls outside those ranges.
- Scaling path: Automate future partition creation and validate partition presence during deployment.

**Pending device memory and table growth are unbounded:**
- Current capacity: `PendingWriter` keeps every seen serial in memory, and `pending_devices` accumulates rows until users delete them.
- Limit: Long-lived gateway processes and noisy unknown devices increase memory use and operator cleanup burden.
- Scaling path: Add TTL eviction in `gateway/internal/storage/pending.go` and a scheduled archival/purge process for `pending_devices`.

**Realtime duplication adds write amplification:**
- Current capacity: Every insert into `positions` also upserts `latest_positions` via trigger.
- Limit: Higher ingest rates double the write path and make trigger cost part of the hot path.
- Scaling path: Benchmark trigger overhead, keep `latest_positions` lean, and consider alternative fan-out strategies if ingest volume rises materially.

## Dependencies at Risk

**Not detected:**
- Risk: No immediate package-level abandonment or deprecation stands out more than the code-path and schema issues above.
- Impact: Operational risk is dominated by data-flow and query-shape concerns rather than library churn.
- Migration plan: Reassess after dependency upgrades or framework changes in `web/package.json`, `gateway/go.mod`, and `simulator/go.mod`.

## Missing Critical Features

**Geofence operations are incomplete end-to-end:**
- Problem: The schema and navigation support geofences, but the web app exposes listing/deletion only and the gateway does not evaluate geofence rules.
- Blocks: Tenant-managed geofence setup, geofence-based alerting, and meaningful use of seeded geofence rules.

**Alert rule management and notification delivery are incomplete:**
- Problem: `alert_rules.notify_email` exists in the schema, but there is no rule CRUD UI in `web/src`, and the gateway never sends notifications.
- Blocks: Operator-configurable alert policies and any production use of email notification settings.

**Recovered backlog replay is missing:**
- Problem: The buffer can retain failed writes, but there is no implemented mechanism that pushes recovered backlog back into `positions`.
- Blocks: Reliable offline buffering and safe recovery from temporary database outages.

## Test Coverage Gaps

**Auth and request-gating flows:**
- What's not tested: Login, registration, logout, profile creation side effects, and redirect/session refresh behavior.
- Files: `web/src/lib/actions/auth.ts`, `web/src/lib/supabase/middleware.ts`, `web/src/proxy.ts`, `web/src/components/auth/login-form.tsx`, `web/src/components/auth/register-form.tsx`
- Risk: Access-control regressions and tenant-join regressions can ship without detection.
- Priority: High

**Web server actions and query behavior:**
- What's not tested: CRUD and read actions for devices, vehicles, alerts, geofences, pending devices, positions, and reports.
- Files: `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, `web/src/lib/actions/alerts.ts`, `web/src/lib/actions/geofences.ts`, `web/src/lib/actions/pending-devices.ts`, `web/src/lib/actions/positions.ts`, `web/src/lib/actions/reports.ts`
- Risk: Query-shape regressions, RLS surprises, and timezone mistakes only surface at runtime against Supabase.
- Priority: High

**Database policy and trigger behavior:**
- What's not tested: RLS helper functions, signup trigger behavior, `latest_positions` trigger behavior, and partition assumptions.
- Files: `supabase/migrations/20260318104558_rls_policies.sql`, `supabase/migrations/20260403_latest_positions_realtime.sql`, `supabase/migrations/20260318104457_positions.sql`, `supabase/migrations/20260319_add_serial_and_pending_devices.sql`
- Risk: Multi-tenant isolation, signup safety, and realtime correctness can drift silently as migrations change.
- Priority: High

**Gateway persistence side effects:**
- What's not tested: Pending-device writes, alert persistence, `last_communication_at` freshness, and recovery from PostgreSQL failures.
- Files: `gateway/cmd/gateway/main.go`, `gateway/internal/storage/writer.go`, `gateway/internal/storage/pending.go`, `gateway/internal/alerts/engine.go`
- Risk: The most operationally important failure paths remain unverified end-to-end.
- Priority: High

---

*Concerns audit: 2026-04-05*
