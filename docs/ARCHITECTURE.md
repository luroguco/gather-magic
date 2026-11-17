# Architecture

## Decision

The application is a local-first modular monolith. React, Fastify, and SQLite remain the primary stack. Platform-specific MTGA capture is isolated behind a versioned snapshot protocol and must eventually run in a short-lived, narrowly entitled helper process.

The architecture deliberately avoids:

- microservices for a single-user local workload
- a generic repository or ORM layer over SQLite read models
- granting debugger-style privileges to the UI, API, or an entire Electron application
- making the current private Untapped addon dependency part of a release

## Runtime Topology

```text
React UI
  -> validated HTTP contracts during local development
  -> validated IPC when embedded in a desktop controller

Unprivileged application controller
  -> Fastify application modules
  -> SQLite
  -> short-lived collector client

Platform reader helper
  -> process discovery and read-only capture
  -> collector-snapshot-v1 on stdout or an atomic mode-0600 file
  -> exit
```

The helper is a process boundary, not necessarily a separate installer. A future desktop bundle can contain the controller, UI, database runtime, and helper while preserving separate privileges.

## Backend Modules

- `system`: health and status
- `cards`: shared filters, search, statistics, detail, and mechanics read models
- `collection`: CSV, Untapped, and strict collector snapshot imports plus history restoration
- `capture`: explicitly enabled research adapters for local capture helpers
- `decks`: persistence, validation, and Arena export
- `catalog`: canonical card synchronization remains in the existing card-data service and is the next backend extraction candidate

Routes are registered from `apps/api/src/modules`. SQL remains explicit and SQLite-specific.

## Wire Contracts

`packages/contracts` contains runtime-validated wire contracts, not database rows or internal service types.

`collector-snapshot-v1` requires:

- exact protocol version `1`
- `status: "complete"`
- an ISO capture timestamp that is not materially in the future
- collector/platform/process metadata
- bounded positive Arena ids and quantities
- declared entry and quantity totals that match the collection map
- strict rejection of unknown envelope and diagnostics fields

Collector imports use the strict contract. Untapped imports retain their separate tolerant raw-map adapter.

## Persistence

SQLite schema changes run through ordered migrations using `PRAGMA user_version`.

Migration 2 adds immutable collection import history. Every successful replacement records the complete normalized ownership snapshot in the same transaction. History can be inspected and restored through:

- `GET /api/collection/imports`
- `POST /api/collection/imports/:id/restore`

An existing version-0 database is adopted without dropping tables. Its current collection is recorded as `legacy-bootstrap`.

## Security Defaults

- bind to `127.0.0.1`
- allow only `localhost:5173` and `127.0.0.1:5173` browser origins by default
- reject unrecognized `Host` and `Origin` headers
- limit request and multipart upload sizes
- optionally require a per-launch bearer capability through `LOCAL_API_TOKEN`
- enable live capture by default only on a loopback-bound API; require `ENABLE_DIRECT_CAPTURE=1` when deliberately running elsewhere
- expose Companion automation only through an ephemeral loopback debugging port
- validate collection maps before atomically persisting mode-`0600` captures
- bind import confirmation to the previewed capture's SHA-256 identity
- keep Electron renderers context-isolated, Node-disabled, and sandboxed
- accept only a positive PID through collector renderer IPC

Packaged collector research builds are blocked unless `COLLECTOR_ALLOW_RESEARCH_PACKAGE=1` is explicitly set. Packaged runtime loading of external workspace code is separately blocked unless `COLLECTOR_ALLOW_EXTERNAL_RESEARCH_CODE=1` is set.

## Collector Release Gates

Desktop packaging is not considered complete until all of the following are true:

1. The reader implementation is owned or explicitly licensed; it does not load Untapped's private addon.
2. The fixed helper is bundled, signed, and notarized before distribution.
3. Only the helper receives the minimum attachment permissions.
4. The helper/controller protocol includes request correlation and version negotiation.
5. Repeated captures survive supported MTGA builds and fail closed on incompatible builds.
6. macOS architecture coverage and Windows capture are validated independently.
7. Malicious IPC, local-web, partial-snapshot, and downgrade tests pass.

Until those gates pass, this trusted personal workspace uses the local Untapped Companion bridge as its default path. CSV, strict snapshot upload, and manual JSON capture remain supported fallbacks; a distributable first-party collector is still release-gated.
