# neo: Neural Link (agents in the running app)

The Neural Link is neo.mjs's MCP bridge into a running app: an agent reads and changes the component tree,
vdom/vnode, stores, state providers and styles of the App worker live, without a reload. Tobias Uhlig (neo.mjs)
recommends it as the main way for agents to try things out and to turn their journeys into Playwright tests.

## Setup

- **MCP server:** the npm package `neo-neural-link` (no neo-agent-brain checkout needed). Register it once:
  `claude mcp add neural-link -- npx -y neo-neural-link` (Codex: `codex mcp add neural-link -- npx -y neo-neural-link`).
  It is loaded at session start, so start a new session after registering. It listens on `ws://127.0.0.1:8081`;
  another port: Claude `-e NEO_NL_PORT=<port>`, Codex `--env NEO_NL_PORT=<port>` (both before `--`), and
  `neuralLinkUrl: 'ws://127.0.0.1:<port>'` in the app config.
- **App side:** `useAiClient` in `www/go/core/webclient/Neo.php` (`Neo.config`), on only when the installation's
  config has both `$config['debug'] = true;` and `$config['neuralLink'] = true;` (default false; `neuralLink`
  must be the boolean `true`, a string such as `"false"` from an environment-built config stays off). The dev
  instance has it in `go-docker/rendered/config.go26neo.php`.
- **Connect order:** the App worker tries on boot, then 4 retries (1, 2, 4, 8 s) and stops. Starting the bridge
  later does not wake an idle worker; a focus/visibility change of a GO window tries once more, but only 16 s or
  more after the last attempt (an earlier one does nothing and schedules nothing), otherwise reload.
  The App worker is shared: after changing the config, close ALL GO tabs and popups, a reload of one tab reuses
  the running worker and its old config.
- Check: the `healthcheck` tool lists the `go` session; `get_component_tree` starts at `GO.view.Viewport`.
  `sessions: []` with `bridge.connected: true` means the bridge runs but no GO tab is open (or the worker gave up
  retrying): open or reload GO.

## Why its own switch, and only with `debug`

Whatever listens on 127.0.0.1:8081 on the machine running the browser can drive the App worker with the logged-in
user's session (`call_method`, `patch_code`, `set_instance_properties`). `environment` is always `development`
in GO, so the `useAiClient: 'development'` form would switch it on for every installation, and `debug` alone is
not enough because production installations switch it on to troubleshoot.

The gate covers the GO entry point only. Some neo.mjs examples under `views/neo/node_modules/neo.mjs/examples/`
(56 of 206 in 14.0.0, e.g. `examples/button/base`) ship their own `neo-config.json` with `useAiClient: true` and
are served from the GO origin (HTTP 200 on the dev instance), so an installation that deploys `node_modules`
exposes them regardless of this switch.

## Verified (2026-11-27, neo.mjs 14.0.0, neo-neural-link 1.0.0)

- Works with GO's shared App worker (`useSharedWorkers`): the session reports `isSharedWorker: true`.
- `query_component` with `{selector: {ntype: 'button'}, rootId}` returns `{className, id, properties}`; the asked
  properties are under `properties`.
- `set_instance_properties` on a `GO.button.Button` updated the DOM immediately.
- Headless: Playwright on `http://localhost:8027`, login by POST `/api/auth.php` with the
  credentials from `www/views/neo/test/credentials.local`, then reload; the worker connects within a second.

## Not done yet

- Using the Neural Link inside `tests/e2e` (`allowAiClientInTests` + `Neo.ai.Client#handleTestRequest`).
- `neo-agent-skills` is not installed: it is the toolkit for contributing to neo.mjs itself and its AGENTS.md
  rules (ticket IDs, `add_memory`, its own PR flow) clash with ours.
