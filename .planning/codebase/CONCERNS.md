# Codebase Concerns

**Analysis Date:** 2026-04-04

## Tech Debt

**Unbounded context.Background() in goroutines:**
- Issue: Multiple `Flush()` and database operations use `context.Background()` instead of request/shutdown context, causing uncontrolled goroutines that may not gracefully shut down on timeout
- Files: `gateway/cmd/gateway/main.go` (line 151, 166), `gateway/internal/storage/writer.go` (lines 117, 161, 183)
- Impact: On shutdown or deployment restart, pending database writes may be abandoned; no timeout enforcement on database operations in background tasks
- Fix approach: Thread shutdown context through `Enqueue()` and accept context in `Flush()`. Store context in gateway struct, pass to `HandlePosition()`, and timeout pending flushes during shutdown

**Silent JSON parsing in alert rule syncer:**
- Issue: `json.Unmarshal()` error is discarded (line 87 in `gateway/internal/alerts/sync.go`); malformed rule config silently fails with empty map
- Files: `gateway/internal/alerts/sync.go` (line 87)
- Impact: Alert rules with invalid JSON will be silently skipped, causing rules to appear active in database but never trigger
- Fix approach: Log parse errors and either skip the rule with warning or fail sync entirely

**Buffer disk spill has no file size limits:**
- Issue: If database is unavailable for extended period, fallback file can grow unbounded (one-per-line append with no rotation)
- Files: `gateway/internal/storage/buffer.go` (lines 87-102)
- Impact: Disk space exhaustion possible under prolonged database outage; no monitoring of file size
- Fix approach: Add max file size configuration, implement file rotation, add disk space monitoring/alerts

**Ignored error in timezone-naive datetime conversion:**
- Issue: History player converts browser datetime-local to ISO8601, but client timezone offset not preserved; users in non-UTC zones get wrong time range
- Files: `web/src/components/map/history-player.tsx` (lines 134-137)
- Impact: History searches shifted by timezone offset (e.g., São Paulo -3:00); user sees positions from wrong time period
- Fix approach: Use `new Date().getTimezoneOffset()` to compute local offset and add to ISO string, or capture timezone in datetime-local input

**No bounds checking on alert rule evaluation:**
- Issue: Alert engine reads `rule.Config` with type assertions (`.Config["max_speed"].(float64)`) that silently fail if type wrong; also no validation that required config keys exist
- Files: `gateway/internal/alerts/engine.go` (lines 75-77, 107-109)
- Impact: Misconfigured rules (wrong type, missing field) silently produce false alerts or no alerts; no visibility into config errors
- Fix approach: Add config validation when rules load, return alert only if validation passes, log config errors in sync

## Known Bugs

**Ignition alert triggers on every position:**
- Symptoms: Ignition alert fires repeatedly while vehicle is moving with ignition on
- Files: `gateway/internal/alerts/engine.go` (lines 92-104)
- Trigger: Rule type "ignition" == true returns true for every position where ignition=true (no state tracking)
- Workaround: Create rule only to alert on ignition state *change*, not continuous state
- Fix approach: Add previous position state to engine, only trigger if ignition transitioned from false to true

**Leaflet SSR workaround uses `require()` which breaks tree-shaking:**
- Symptoms: Lazy require of "leaflet" in history-player breaks minification/dead code elimination; history-player adds 100KB+ to bundle
- Files: `web/src/components/map/history-player.tsx` (lines 15-17)
- Trigger: Dynamic import of react-leaflet already prevents SSR; lazy require() for leaflet icon not needed
- Workaround: Accept larger bundle size; use `require()` only if dynamic import still renders during SSR
- Fix approach: Remove lazy require, import leaflet at top (it's already loaded for dynamic MapContainer). Test SSR with simple import first.

**Timezone-aware position queries missing:**
- Symptoms: Position history queries use `server_time` for filtering but UI displays `server_time` in user's browser timezone without conversion
- Files: `web/src/lib/actions/positions.ts` (line 88-89)
- Trigger: `server_time` is UTC, but history-player datetime-local is browser local; mismatch on page boundary at midnight
- Workaround: None; users accept timezone shift
- Fix approach: Convert datetime-local to UTC before query, or adjust history player to show UTC time

**Promise.all() in getLatestPositions without error handling:**
- Symptoms: If one device position fetch fails, entire dashboard breaks; no partial results returned
- Files: `web/src/lib/actions/positions.ts` (lines 38-72)
- Trigger: Single device with malformed location data causes Promise.all to reject
- Workaround: None; reload page
- Fix approach: Use `Promise.allSettled()` and filter failed results; log errors separately

**Missing validation on tenant_id in registration:**
- Symptoms: User can register with non-existent tenant_id; signup succeeds but user cannot query any data
- Files: `web/src/lib/actions/auth.ts` (lines 31-33)
- Trigger: Registration doesn't check if tenant_id exists before creating user
- Workaround: User must be created manually with correct tenant_id, or re-registered
- Fix approach: Query tenants table before signup, return error if not found

## Security Considerations

**Service role key exposed in web/.env.local:**
- Risk: If `.env.local` is accidentally committed or leaked, service role key can bypass all RLS policies and read/write any data as superuser
- Files: `web/.env.local` (present), referenced in `web/src/lib/supabase/server.ts`
- Current mitigation: `.env.local` in `.gitignore`; example file at `web/.env.local.example`
- Recommendations: 
  - Ensure CI/CD never logs env vars
  - Rotate service role key immediately if committed
  - Consider using Supabase's JWT token with custom claims instead of service role for admin operations

**RLS policies assume tenant_id in all rows:**
- Risk: If INSERT query omits tenant_id, RLS allows it and row becomes visible to all tenants
- Files: `supabase/migrations/20260318104558_rls_policies.sql` (lines 55-58, 66-69)
- Current mitigation: RLS SELECT policies check tenant_id match; INSERT not explicitly restricted
- Recommendations:
  - Add explicit CHECK on tenant_id for INSERT policies: `WITH CHECK (tenant_id = get_user_tenant_id())`
  - Test INSERT without tenant_id to verify rejection

**No authentication context in gateway TCP handler:**
- Risk: TCP protocol (Suntech) has no built-in auth; IMEI/serial lookup is only validation. Attacker can send positions for any known device
- Files: `gateway/cmd/gateway/main.go` (line 149), `gateway/internal/storage/writer.go` (line 102)
- Current mitigation: Oracle server restricted to private network (port 5001)
- Recommendations:
  - Add allowlist of trusted IPs if deployed to shared network
  - Implement device-specific token/secret in protocol negotiation
  - Log all unregistered device attempts (already done for pending_devices)

**Supabase anon key visible in client JS:**
- Risk: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is intentionally public but can be used by attacker to brute-force auth or bypass RLS if misconfigured
- Files: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`
- Current mitigation: RLS policies enforce tenant isolation; anon key restricted to row-level access
- Recommendations:
  - Regularly audit RLS policies for overpermissive SELECT/INSERT
  - Test RLS policies with SQL directly: `SET ROLE anon; SELECT * FROM devices` → should return 0 rows

## Performance Bottlenecks

**Device cache never invalidates stale entries:**
- Problem: If IMEI reassigned or device deleted, writer.devices cache still maps old IMEI → old DeviceInfo until restart
- Files: `gateway/internal/storage/writer.go` (lines 67-99)
- Cause: Reload happens on 30s interval but only appends; deleted devices remain cached
- Improvement path: On reload, replace entire cache (already done in LoadDevices line 94). Verify reassignments tested.

**Position history query returns all columns then filters in JS:**
- Problem: `getPositionHistory()` selects "location, speed, heading..." but fetches all rows, then loops to filter GeoJSON
- Files: `web/src/lib/actions/positions.ts` (lines 84-114)
- Cause: Should use `.filter((p) => p.location.type === 'Point')` on query, not in JS (though minor impact)
- Improvement path: Move filter to Supabase query if supported, or accept current JS filter (typically <100 rows per query)

**Real-time subscription doesn't debounce rapid updates:**
- Problem: If device sends 10 positions/sec, UI rerenders 10 times; no throttling on marker updates
- Files: `web/src/lib/hooks/use-realtime-positions.ts` (lines 49-66)
- Cause: Every Postgres change event triggers setState immediately
- Improvement path: Add debounce(300ms) on setPositionsMap or use useTransition to batch updates

**TrackingMap renders all markers every position update:**
- Problem: `positions.map()` on line 135 of `tracking-map.tsx` rerenders every marker when any position changes
- Files: `web/src/components/map/tracking-map.tsx` (lines 135-141)
- Cause: VehicleMarker not memoized; position array change causes all children to remount
- Improvement path: Wrap VehicleMarker in React.memo, verify key stability

**Ignition rule evaluation has no caching between position evaluations:**
- Problem: Engine loops all rules for each position; with 100 rules × 10 devices/sec = 1000 evaluations/sec with no optimization
- Files: `gateway/internal/alerts/engine.go` (lines 42-59)
- Cause: No indexing of rules by device/tenant; O(n) scan per position
- Improvement path: Build device_id → [rules] map in Syncer, use map lookup in Evaluate

## Fragile Areas

**Suntech protocol parser hardcoded field positions:**
- Files: `gateway/internal/protocol/suntech.go` (lines 37-88)
- Why fragile: Field indices (7=lat, 8=lon, 9=speed, etc.) are magic numbers; if protocol version adds field, indices shift and silent data corruption occurs
- Safe modification: Add constants for field names; document protocol spec inline; add test cases for multiple protocol versions
- Test coverage: suntech_test.go has basic parsing; missing edge cases: malformed fields, extra fields, missing optional fields

**Binary protocol uses fixed offset hardcoded:**
- Files: `gateway/internal/protocol/suntech_binary.go` (lines 71-96)
- Why fragile: Offset 18-21 for latitude assumed correct; no frame version checking; if Suntech adds new header type, offsets invalid
- Safe modification: Extract offsets to named constants; add frame type enum; add version field handling
- Test coverage: Binary tests only cover happy path; missing: truncated frames, wrong ETX, invalid coordinates

**RLS policies on dependent tables don't cascade:**
- Files: `supabase/migrations/20260318104558_rls_policies.sql` (lines 55-69)
- Why fragile: If geofence INSERT bypasses tenant_id check, it becomes visible to entire tenant; positions table policy doesn't verify device.tenant_id
- Safe modification: Add WITH CHECK (device.tenant_id = get_user_tenant_id()) on positions INSERT; test policy chain
- Test coverage: No integration tests for RLS policy violations; need test suite

**History player assumes exactly one latest position per vehicle:**
- Files: `web/src/lib/actions/positions.ts` (lines 40-46)
- Why fragile: `.single()` throws error if 0 or 2+ positions; no error handling if query returns array
- Safe modification: Use `.maybeSingle()` instead, check for null, handle edge cases
- Test coverage: None; missing tests for devices with 0 positions, multiple positions same timestamp

**Map re-renders on every new position via useEffect dependency array:**
- Files: `web/src/components/map/map-controller.tsx` (line 66)
- Why fragile: `positions` dependency array causes effect to run even if same position repeated (network retry); recentering causes jank
- Safe modification: Memoize positions array or use useCallback with stable reference; compare latitude/longitude only
- Test coverage: None; missing tests for repeated positions, rapid updates

## Scaling Limits

**Device cache grows unbounded in memory:**
- Current capacity: ~1000s of devices per IMEI+serial mapping
- Limit: At ~1KB per device entry, 10K devices = ~10MB (acceptable); 100K devices = ~100MB
- Scaling path: Implement LRU cache with eviction; add cache size monitoring; consider time-based TTL

**Alert rule evaluation is O(rules × messages/sec):**
- Current capacity: 100 rules × 10 devices × 10 msg/sec = 10K evaluations/sec on single core
- Limit: At ~1ms per evaluation, CPU maxes out around 1000 msg/sec
- Scaling path: Add rule indexing by device_id; consider rule engine sharding; profile hot path

**Supabase database row limit on positions table:**
- Current capacity: Time-partitioned by week; ~100K positions/day = ~3M/month
- Limit: Partition growth unbounded; TTL/archival not implemented
- Scaling path: Add constraint on positions retention (e.g., 90 days); archive old partitions to cold storage

**Real-time subscription broadcasts all updates to all clients:**
- Current capacity: Supabase realtime broadcasts position changes to every connected dashboard; ~100 clients × 10 msg/sec = 1000 broadcast messages/sec
- Limit: Realtime channel becomes bottleneck around 1000 concurrent clients
- Scaling path: Implement client-side filtering (only subscribe to devices user follows); use webhook delivery for low-latency updates

## Dependencies at Risk

**Leaflet/react-leaflet version pinned without security monitoring:**
- Risk: No automated dependency updates; mapping library vulnerabilities not tracked
- Impact: XSS via malicious tile layer URL, DOM clobbering attacks possible
- Migration plan: Upgrade to mapbox-gl or deck.gl if leaflet becomes unmaintained; add dependabot to CI

**Supabase SDK version locked:**
- Risk: Auth API changes could break upgrades; RLS policy format may change
- Impact: Forced to stay on outdated SDK or rewrite auth/RLS
- Migration plan: Test upgrades in staging; monitor Supabase changelog; consider Postgres driver directly if SDK becomes blocker

**Suntech GPS protocol is proprietary, undocumented outside of device manual:**
- Risk: Protocol version bumps not tracked; binary format versioning unclear
- Impact: New device firmware could break parser; no version negotiation mechanism
- Migration plan: Add protocol versioning header; document format in code; request open-source Suntech spec if possible

## Missing Critical Features

**No transaction support for device lifecycle:**
- Problem: Creating device → assigning to vehicle → linking to geofence requires multiple queries; if step 2 fails, orphaned device remains
- Blocks: Atomic multi-tenant operations; rollback on constraint violations
- Fix: Implement stored procedure for device creation with all steps in single transaction

**No audit trail for alert rule changes:**
- Problem: Admin modifies rule; affected devices get different behavior; no record of who/when/what changed
- Blocks: Compliance audits; debugging alert misfires; user support investigations
- Fix: Add audit_logs table with rule change events; log via trigger on alert_rules

**No dead device detection:**
- Problem: Device stops sending positions; no alert if vehicle is stationary too long
- Blocks: Fleet manager can't detect stolen/broken devices; needs manual checking
- Fix: Add rule type "staleness" that triggers if no position in N minutes

**No geofence violation history:**
- Problem: Geofence alerts trigger in real-time, but log is lost if alert expires before user sees it
- Blocks: Post-incident analysis; proving vehicle left geofence at time T
- Fix: Add geofence_violations table; record entry/exit times; query historical violations

**No batch export of positions/reports:**
- Problem: User must query history page to see trips; no CSV export, no scheduled reports
- Blocks: Integration with fleet analytics; spreadsheet reporting
- Fix: Add report export endpoint; implement scheduled email delivery via background job

## Test Coverage Gaps

**Alert rule engine has no negative test cases:**
- What's not tested: Invalid config types (max_speed="string"), missing config keys, rule type not matching any handler
- Files: `gateway/internal/alerts/engine_test.go`
- Risk: Misconfigured rules fail silently; alert triggers unpredictably
- Priority: High — affects production fleet safety

**TCP server connection handling has incomplete error scenarios:**
- What's not tested: Connection closes mid-frame; duplicate IMEI from multiple IPs; protocol identification failures
- Files: `gateway/internal/server/tcp_test.go`
- Risk: Hung connections, silent data loss, protocol confusion
- Priority: High — affects data ingestion reliability

**RLS policies have no integration tests:**
- What's not tested: Cross-tenant data leakage, policy bypass via joins, orphaned rows without tenant_id
- Files: None (no RLS tests exist)
- Risk: Security vulnerability in production; multi-tenant data breach
- Priority: Critical — must test before any customer data

**Web Server Actions have no error simulation:**
- What's not tested: Network timeouts, malformed Supabase responses, quota exceeded
- Files: `web/src/lib/actions/*.ts`
- Risk: UI breaks with generic error messages; user doesn't know if data was saved
- Priority: Medium — affects user experience, not data integrity

**History player timezone handling untested:**
- What's not tested: Daylight saving time boundaries, UTC+12/-12 edge cases, datetime-local value conversion
- Files: `web/src/components/map/history-player.tsx` (lines 134-137)
- Risk: Users in non-UTC zones query wrong time period
- Priority: Medium — affects non-Brazil users

---

*Concerns audit: 2026-04-04*
