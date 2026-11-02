# Basic auth

When both `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set, every page and every Turso server function asks for that Basic credential. The Watcher uses the same one.

## Sub-features

- A request with no Authorization header is 401.
- A request with the wrong password is 401.
- The browser configured with `watcher` loads the Track screen.
- Either env value missing or empty turns auth off. The verification command sets both.

## How to get to it (user POV)

Any URL. The browser prompts, or the Watcher sends the header. There is no second Watcher login.

## Driving it with e2e

`tests/basic-auth.e2e.ts`. The test calls `fetch` on `app.baseUrl` with no header and with `watcher:incorrect`. It does not read the real password. Then `app.open('/tracks/cursor')` uses `web({ basicAuth })`. Locator: `getByRole('heading', 'Cursor')`. Live walk: `open_session` already carries the credential; `observe` the Cursor heading.

## Proof

On screen: the Cursor heading loads in the browser that answers Basic auth. Beside that, both unauthenticated `fetch` calls return 401. CSRF is not this check.

## Charters

```
basic-auth|web|skeptic|Starting at /tracks/cursor, confirm the Track screen renders for the watcher credential and that the nav lists the seed Tracks
```

## Gotchas

- The readiness probe treats 401 as the server being up. A 401 from `fetch` in the test is the auth check, not a failed launch.
- Do not put the password in a test file. It lives in `e2e.config.ts` as the `watcher` credential and the command env.
