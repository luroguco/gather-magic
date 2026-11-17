# Collector Host Spike

This workspace is the Phase 0 host spike for direct MTGA collection capture. It is research code, not a distributable collector.

Current purpose:
- launch a local Electron host
- run the existing MTGA runtime probe from that host
- save probe reports under `data/collector/`

It does not extract the collection yet.

## Commands

From the repo root:

```bash
npm run collector:start
```

Launches the visible spike UI.

```bash
npm run collector:probe
```

Runs the runtime probe in headless mode and exits after saving a report.

```bash
npm run collector:package:mac
```

Packaging is release-gated. For an explicit local-only research build, prefix the package command with:

```bash
COLLECTOR_ALLOW_RESEARCH_PACKAGE=1
```

The resulting shell is unprivileged and will not load external workspace probe code when packaged unless `COLLECTOR_ALLOW_EXTERNAL_RESEARCH_CODE=1` is also explicitly supplied. Neither override is suitable for distribution.

```bash
npm run collector:package:mac:adhoc
```

Packages and ad hoc signs the macOS app for local-only testing. This does not require an Apple
signing identity or provisioning profile.

```bash
npm run collector:package:mac:signed
```

Packages and signs the macOS app. This expects a usable signing identity in your keychain. You can
optionally pass:

- `COLLECTOR_MAC_IDENTITY`
- `COLLECTOR_MAC_PROVISIONING_PROFILE`

```bash
npm run collector:probe:packaged
```

Runs the most recent packaged app in headless probe mode. This uses `COLLECTOR_WORKSPACE_ROOT` so
the packaged spike can still read the repo's built `apps/api/dist/scripts/probeMtgaRuntime.js`
module during this phase.

## Current status

The current scaffold proves:
- the collector host can launch outside the sandbox
- the host can run the shared `probeMtgaRuntime` module
- probe reports are saved to `data/collector/latest-runtime-probe.json` and timestamped archives
- the collector app can be packaged into a local macOS `.app` bundle without downloading Electron again
- the ad hoc signed packaged app can enter the headless probe path on this machine

The current scaffold does not yet prove:
- that an unsigned Electron host can connect to MTGA runtime successfully
- that we can extract `grpId -> quantity`
- that ad hoc local signing is enough to cross the MTGA runtime-access boundary

Current machine constraint:
- `security find-identity -v -p codesigning` returned `0 valid identities found`
- Apple-signed package testing is blocked until a usable signing identity is installed
- local ad hoc package testing is still available with `npm run collector:package:mac:adhoc`

Current ad hoc result:
- a packaged ad hoc signed run still ends with `Scry.connect(...)` failing against the live MTGA PID

The next product decision is whether a fixed, independently signed reader helper can perform stable capture without private dependencies. The Electron shell itself is no longer treated as the privileged reader.

## Release boundary

The eventual product topology is an unprivileged controller launching a short-lived, pre-signed reader helper. Debugger-style entitlements must not be applied to the Electron application or inherited by its renderer/helper processes. Runtime signing and private Untapped addon loading are prohibited release paths.
