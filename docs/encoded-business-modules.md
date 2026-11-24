# Encoded business modules

> Moved verbatim from CLAUDE.md on 2026-11-24.

## Encoded business modules

The release build (`build/build.sh`) encodes every PHP file of `go/modules/business/*` and the pro modules with SourceGuardian, except `Module.php`. Without the loader, loading an encoded file ends PHP: it isn't an exception, so `try`/`catch` can't stop it, and an upgrade or cache rebuild fails. Dev checkouts aren't encoded, so you won't see this locally.

- Take extra care in `defineListeners()`: it runs for every enabled module on every cache rebuild, including the one at the end of an upgrade. `tests/go/core/event/ListenersTest.php` rebuilds the cache with the business modules unavailable and fails when one of their other classes is loaded.
