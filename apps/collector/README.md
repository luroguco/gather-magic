# Collector Host Spike

This workspace is the Phase 0 host spike for direct MTGA collection capture.

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

Packages a macOS `.app` bundle under `apps/collector/out/mac/`.

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

The current scaffold does not yet prove:
- that an unsigned Electron host can connect to MTGA runtime successfully
- that we can extract `grpId -> quantity`
- that the packaged `.app` enters the probe path correctly when invoked headlessly on this machine

Current machine constraint:
- `security find-identity -v -p codesigning` returned `0 valid identities found`
- a proper signed package test is blocked until a usable signing identity is installed

The first real decision point is whether a packaged signed Electron app changes the `Scry.connect(...)` result. If not, the next path should be a signed native helper bundle rather than more work on the unsigned Electron shape.
