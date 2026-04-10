# Gateway Protocol Onboarding Design

## Context

The current gateway already accepts multiple protocol families in code (`suntech`, `suntech-binary`, `gt06`), but protocol onboarding is still fragile:

- protocol detection is coupled to parser-local `Identify` heuristics
- operational outcomes are collapsed into logs instead of first-class records
- unknown traffic, unknown variants, parser failures, and unknown devices are not separated clearly
- adding a new protocol or a new variant still depends on touching low-level assumptions in the intake path

On April 10, 2026, live traffic captured on the Oracle VM confirmed a real production gap: a Suntech tracker was connecting repeatedly to TCP port `5001`, but sending ASCII frames in a compact variant:

```text
STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;
```

This frame was rejected as `unknown protocol` because the current ASCII Suntech detection only accepts prefixes such as `ST300` and `ST340`.

The immediate bug must be fixed, but the broader goal is larger: the system should not be operationally dependent on one device family or on ad hoc protocol additions.

## Product Goal

Build a protocol onboarding foundation that allows the platform to:

- detect known protocol families and known variants robustly
- parse and ingest supported devices end-to-end
- classify unsupported traffic into operational queues instead of dropping it into logs
- make new protocol and variant support routine work instead of core-gateway surgery

## Scope Decisions

The following decisions were explicitly chosen for this design:

- the gateway must support a generic onboarding model, not just one-off protocol fixes
- onboarding is considered complete only when the cycle includes detection, persistence, pending-device creation, ACK behavior when required, and diagnostics for failures
- parsing remains in typed Go code
- detection and routing should become more configurable via fingerprints and protocol metadata
- unknown traffic should be persisted and surfaced in the product, not only logged

## Non-Goals

This design does not attempt to:

- build a no-code parser engine for arbitrary binary protocols
- guarantee support for every GPS tracker without writing protocol-specific parsing code
- expose unrestricted protocol editing in the dashboard in the first implementation

The objective is operational generality, not a fully dynamic DSL for all protocol logic.

## Problem Breakdown

The current flow mixes four distinct situations:

1. known protocol, known parser, device not yet linked
2. known protocol family, but unsupported variant
3. likely known family, but parser failed on the concrete frame
4. traffic that is not a supported tracker protocol at all

These cases need different handling:

- case 1 should become `pending_devices`
- case 2 should become reviewable protocol onboarding work
- case 3 should become parser diagnostics and regression fixtures
- case 4 should be visible but easy to ignore as noise

## Architecture Overview

The gateway intake path should be reorganized into four explicit stages.

### 1. Frame Intake

The TCP server remains responsible for:

- accepting the connection
- reading raw bytes or raw lines from the socket
- preserving remote IP, timestamps, connection metadata, and the original payload
- maintaining per-connection session state when needed

This layer must not decide business outcomes beyond transport concerns.

### 2. Detector

Introduce a dedicated detector stage between frame intake and parsing.

The detector classifies each frame using protocol fingerprints and returns a structured match result:

```go
type DetectionResult struct {
    Family       string
    Variant      string
    Confidence   float64
    RequiresACK  bool
    Fingerprint  string
    Reason       string
    Status       DetectionStatus
}
```

`DetectionStatus` should distinguish at least:

- `detected`
- `ambiguous`
- `unknown`

Fingerprint rules should be able to consider:

- ASCII prefixes
- magic bytes
- framing style
- delimiter patterns
- minimum length
- field count or field shape
- optional session expectations

Examples:

- `ST300...` and `ST340...` map to family `suntech`
- compact `STT;...` also maps to family `suntech`, but variant `stt_compact_ascii`
- GT06 login and GPS frames map to family `gt06`

The detector must be distinct from the parser so that a protocol family can accumulate variants without changing the transport loop.

### 3. Parser

Parsers remain typed Go implementations. Their responsibility is to transform a detected frame into domain data:

- login/session update
- position
- heartbeat
- ACK payload
- parser-specific hints such as serial, IMEI, and protocol metadata

Parsers should no longer be responsible for deciding whether a frame belongs to the family in the broad operational sense. They should receive a detector-approved family/variant and either parse successfully or fail with a structured error.

Example parser responsibilities:

- `suntech` parser handles `st300_ascii`, `st340_ascii`, `stt_compact_ascii`
- `suntech-binary` should be represented as family `suntech`, variant `st310_binary`
- `gt06` parser handles login, GPS, heartbeat, and ACK rules

### 4. Outcome Router

After detection and parse, the gateway routes the result into one of these operational outcomes:

- `position_ingested`
- `pending_device_detected`
- `unknown_protocol_frame`
- `protocol_parse_failure`
- `ignored_noise`

This layer is what converts technical events into durable operational records.

## Detection Model

The target model is code-driven parsing plus configurable detection metadata.

### Why This Model

Three options were considered:

1. hardcoded detection inside each parser
2. typed parsers plus configurable detection metadata
3. fully configurable protocol/field mapping

Option 2 is the recommended design because it provides:

- safety for parsing and ACK logic
- lower blast radius for new protocol variants
- enough flexibility to add known signatures without rewriting the gateway loop

Option 1 keeps current fragility.
Option 3 over-optimizes for configuration and becomes brittle for binary protocols and stateful sessions.

### Fingerprints Source

Fingerprints and variant metadata should be loadable from a configurable source. The first implementation can use static configuration or seeded database records, but the shape should support future persistence-backed administration.

Each fingerprint record should include:

- `family`
- `variant`
- `priority`
- `transport`
- `match_type`
- `pattern`
- `minimum_length`
- `notes`
- `enabled`

This lets the gateway recognize new known variants without changing the core TCP loop.

## Persistence Model

Operational clarity requires separating unknown devices from unknown protocols and parser failures.

### 1. `pending_devices`

Keep `pending_devices` for frames that were successfully detected and parsed, but whose device identifier is not yet linked in the system.

Expected data:

- serial or IMEI
- protocol family
- protocol variant
- remote IP
- first/last seen
- message count

### 2. `unknown_frames`

Add a new table for frames that the detector could not classify confidently.

Suggested fields:

- `id`
- `transport`
- `remote_ip`
- `raw_preview`
- `raw_payload`
- `fingerprint`
- `candidate_family`
- `confidence`
- `occurrences`
- `first_seen_at`
- `last_seen_at`
- `status`
- `notes`

Statuses should include at least:

- `new`
- `reviewing`
- `mapped`
- `ignored`

Records should be grouped by fingerprint so that repeated traffic from the same unsupported device or scanner does not flood the UI.

### 3. `protocol_failures`

Add a separate table for parse failures when the detector believes the family/variant is known, but parsing fails.

Suggested fields:

- `id`
- `family`
- `variant`
- `error_code`
- `error_message`
- `raw_payload`
- `device_hint`
- `remote_ip`
- `occurrences`
- `first_seen_at`
- `last_seen_at`

This becomes the operational queue for broken parsers and unsupported field layouts inside otherwise known families.

## Dashboard Model

Protocol onboarding should become visible in the product instead of requiring SSH access and log inspection.

### Devices Page

Keep the current pending-device panel for:

- known protocol
- successful parse
- identifiable device
- device not yet linked

### New Operational Views

Add a protocol intake area with at least three views.

#### 1. Unknown Protocols

Grouped by fingerprint, showing:

- payload sample
- first/last seen
- occurrence count
- remote IPs
- candidate family
- current status

Actions:

- mark as reviewing
- ignore recurring noise
- map to a known family/variant once support exists

#### 2. Parser Failures

Grouped by family and variant, showing:

- parser error
- payload sample
- first/last seen
- occurrences

This view is where variant incompatibilities should be triaged.

#### 3. Protocol Catalog

Expose protocol support as an operational catalog:

- supported families
- known variants
- enabled fingerprints
- status such as `active`, `experimental`, `disabled`

The first version should prioritize read visibility. Editing fingerprints through the UI can wait until the underlying model is stable.

## Protocol Taxonomy

The system should distinguish:

- `family`: broad protocol family such as `suntech` or `gt06`
- `variant`: concrete format within the family such as `st300_ascii`, `stt_compact_ascii`, or `st310_binary`

This fixes a current conceptual leak where internal parser names such as `suntech-binary` escape into business persistence. Business-facing records should store stable family/variant semantics, not implementation class names.

## Logging and Diagnostics

Logs should remain useful, but they should no longer be the only source of truth.

Recommended logging improvements:

- log detector outcomes with `family`, `variant`, `confidence`, and `fingerprint`
- log parser failures with structured error codes
- log pending-device creation separately from parse success
- log unknown frames after deduplication, not on every raw event

The logs should support fast debugging, but operational state should live in the database.

## Testing Strategy

The protocol onboarding foundation should be test-driven through real payload fixtures.

### Detector Tests

- known family detection
- known variant detection
- ambiguous detection
- unknown detection

### Parser Tests

- success path per variant
- ACK behavior when required
- login/session flows
- parser failure classification

### Integration Tests

- full TCP flow for a known variant
- known protocol but unknown device becomes `pending_devices`
- unknown frame becomes `unknown_frames`
- parse failure becomes `protocol_failures`

### Regression Fixtures

Every newly observed production payload that drove a bugfix should become a fixture. The captured `STT;...` Suntech compact variant must be the first explicit fixture in this new model.

## Implementation Phases

This design intentionally covers the full roadmap, but not every phase is part of the first implementation plan.

### Phase 1: Immediate Intake Refactor and Live Fix

Goals:

- support the live compact Suntech `STT;...` variant
- introduce an explicit detector stage
- normalize business-facing protocol taxonomy into family/variant
- keep existing position ingestion and pending-device flow working

Expected outcomes:

- the live Suntech tracker starts appearing as a pending device or as ingested positions, depending on registration state
- the TCP loop no longer depends on simplistic parser-local family detection

### Phase 2: Operational Persistence

Goals:

- add `unknown_frames`
- add `protocol_failures`
- deduplicate by fingerprint
- improve structured logs

Expected outcomes:

- unsupported traffic becomes reviewable
- parser breakage becomes visible outside raw logs

### Phase 3: Configurable Detection Catalog

Goals:

- load fingerprints and variant metadata from a configurable source
- enable/disable variants without rewriting the core intake path
- allow multiple fingerprints for the same family/variant

Expected outcomes:

- onboarding of known variants becomes routine
- detector changes become less invasive

### Phase 4: Dashboard Operationalization

Goals:

- add views for unknown protocols, parser failures, and protocol catalog
- make protocol triage visible to operators

Expected outcomes:

- fewer SSH/log-driven investigations
- faster onboarding feedback loop

### Phase 5: Standardized Protocol Expansion Workflow

Goals:

- define the contract for adding a new parser
- define required fixtures and ACK/session coverage
- formalize the onboarding checklist for new hardware families

Expected outcomes:

- new protocol support becomes repeatable engineering work
- regressions are caught through fixtures instead of production surprises

## Recommended Initial Implementation Scope

The first implementation plan should focus on:

- Phase 1 in full
- the minimum viable subset of Phase 2 needed to persist unknown traffic and parser failures

This gives immediate production value without forcing the dashboard and catalog work into the same delivery slice.

## Risks and Mitigations

### Risk: Over-generalizing too early

Mitigation:

- keep parsing in Go
- make only detection metadata configurable
- phase the dashboard and admin surface after the backend model is stable

### Risk: Unknown traffic floods storage

Mitigation:

- deduplicate by fingerprint and time window
- store preview plus capped raw payload where appropriate
- support ignored status for recurring noise

### Risk: Family/variant mismatch creates confusion

Mitigation:

- standardize taxonomy in one place
- keep implementation parser names internal
- use family/variant consistently in persistence and UI

### Risk: Existing flows regress during refactor

Mitigation:

- keep current supported protocols as fixtures
- add end-to-end tests for Suntech ASCII, Suntech binary, and GT06
- verify pending-device flow separately from position ingestion

## Migration Guidance

This design supersedes the earlier `2026-04-06-multi-protocol-design.md` direction by extending it in three ways:

- detector and parser become explicitly separate concerns
- operational persistence is elevated to first-class architecture
- family/variant taxonomy becomes stable and user-facing, instead of exposing parser implementation names

The earlier parser/session refactor remains valid, but it is no longer sufficient by itself for the product goal.

## Success Criteria

This initiative is successful when:

- a compact Suntech `STT;...` tracker is accepted without SSH intervention
- supported but unlinked devices appear in `pending_devices`
- unsupported protocol traffic appears in `unknown_frames`
- parser breakages appear in `protocol_failures`
- adding a new variant no longer requires editing the TCP intake core
- adding a new family follows a standard parser + fixture + fingerprint workflow
