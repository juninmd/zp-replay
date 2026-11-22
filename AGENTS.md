# AGENTS.md

zp-replay: a proof of concept that parses a GoldSrc demo (`.dem`) in the browser through WebAssembly and draws the recorded player's path. A 3D viewer loads BSP geometry and offline position trails. It is a PoC, not a demo player: read the README's "what works" section before claiming a feature.

## Stack

- Rust crate `crate/` (`zp-replay-wasm`, `cdylib`) that wraps `vendor/hldemo` (hldemo 0.3.0).
- TypeScript web viewer in `web/` and `web/src/`, run with Bun.
- Bun for scripts and tests; Rust toolchain with the `wasm32-unknown-unknown` target for the WASM build.

## Commands

```bash
bun install
bun run build:wasm      # cargo build --release for wasm32, then copies the .wasm into web/
bun run build:web       # bundles web/src/map-app.ts into web/map-app.js
bun run test            # runs the pretest hook (rustup target add + build:wasm), then bun test
bun run serve           # serves web/ with scripts/serve.ts
```

`bun test` run directly skips the `pretest` hook, so the WASM is not rebuilt. Use `bun run test` after changing the crate.

## Structure

- `crate/src/lib.rs`: the WASM entry point over `hldemo`.
- `vendor/hldemo/`: vendored upstream crate. One local change: a trailing `;` removed from two `map_res_err_` macro expansions (see README). Keep the MIT and Apache-2.0 license files.
- `web/`: static pages (`index.html`, `map.html`) and `web/src/` (`bsp.ts`, `coords.ts`, `geometry.ts`, `demo/playback.ts`, `demo/tracks.ts`, `map-app.ts`, `replay-view.ts`).
- `scripts/`: `extract-replay.ts` generates the offline position trails; `serve.ts` is the static server.
- `test/`: Bun tests for parse, coords, BSP, playback and tracks.

## Conventions

- Demo files stay in the browser. Do not add an upload path that sends `.dem` files to a server.
- Keep changes to `vendor/hldemo` minimal and documented in the README. Do not reformat the vendored code.
- GitHub Actions: <!-- base-actions-main-policy -->
  - Reference internal actions by branch, never by SHA: `uses: juninmd/base-actions/<action>@main` and `uses: juninmd/base-actions/.github/workflows/<file>.yml@main`.
  - Do not pin `@<sha>` for `juninmd/base-actions`; updates are centralized on `main`.
  - PRs whose checks do not start because of billing or spending limits are auto-merged by `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`. Apply the `do-not-merge` label to block that.

## Gotchas

- The repository has no license file. The README says so, and `vendor/hldemo` keeps its own licenses. Do not add a license without the owner's decision.
- `vendor/hldemo/test-demos/` is git-ignored. The parser test depends on local demo files that are not in the repo.
- `validate.yml` runs on pull requests and on pushes to `main`. `sast.yml` runs on pushes.
