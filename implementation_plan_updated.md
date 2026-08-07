# Updated Implementation Plan

## Final Decisions

1. **Plugin Location**
   - All provider plugins live under `src/sources/plugins/<provider>/`.
   - Shared utilities are in `src/sources/shared/`.
   - Core plugin infrastructure (`JobSource`, `registry`, `parallelManager`, `sourceHealth`) resides in `src/sources/core/`.

2. **Default Source Metadata**
   - Three priority tiers:
     - **Stable** – priority 100‑85, **enabled** by default.
     - **Good** – priority 80‑95, **enabled**.
     - **Experimental** – priority 60‑50, **disabled**.
   - Example `src/config/sources.json` is included in the repo and contains the entries you approved (Greenhouse, Lever, Ashby, Workday, Wellfound enabled; LinkedIn disabled).
   - Providers also expose a richer `status` field (`active`, `disabled`, `experimental`, `maintenance`, `deprecated`).

3. **UI Toggles**
   - Per‑user persistence via browser local storage.
   - Defaults come from `sources.json` → plugin metadata.
   - UI controls: Select All, Deselect All, Reset to Defaults, health indicator, latency, job count.

4. **Additional Recommendations**
   - Use the enriched status model to avoid future schema changes.
   - Parallel execution respects `maxConcurrentSources = 4` (configurable).
   - Query expansion agent remains unchanged.

## Next Implementation Steps
- Create `src/sources/core/` with `JobSource.ts`, `registry.ts`, `parallelManager.ts`, `sourceHealth.ts`.
- Move existing `greenhouse.ts` to `src/sources/plugins/greenhouse/index.ts` and split into `parser.ts` and `mapper.ts`.
- Add shared utilities in `src/sources/shared/` (http, retry, cache, utils).
- Generate `src/config/sources.json` using the approved metadata.
- Update the backend entry point (`server/index.mjs`) to use `registry.loadAll()` and the `parallelManager`.
- Extend the UI to read/write the per‑user toggle state from local storage and display provider health/latency/job count.
- Add tests for the registry, parallel manager, and status handling.

## Verification Plan
- Automated unit tests for plugin loading, priority sorting, and status handling.
- End‑to‑end integration test: upload a resume, run a search, and verify that enabled providers return jobs and UI reflects health/latency.
- Manual UI check: toggle providers, reset defaults, and confirm that searches respect the new settings.
