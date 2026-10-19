# NovaWallet Transfer API

Minimal reference implementation for the FirstBank NovaPay "NovaWallet Transfer API" exercise
(Part A). NestJS + TypeScript, reads/writes a single JSON file instead of a database. Not
production-grade by design — small, auditable, and built to be exercised by the Part B test
suite.

## Run it

```bash
npm install
npm run dev     # nest start --watch, listens on :3000
```

or build + run compiled JS:

```bash
npm run build
npm start
```

The data file lives at `data/db.json` and is created automatically on first run. Delete it to
reset all state.

## Auth

Every endpoint except `GET /health` requires:

```
Authorization: Bearer novapay-dev-token
```

Override the token via the `API_TOKEN` env var. Enforced by `BearerAuthGuard`
(`src/common/guards/bearer-auth.guard.ts`), applied via `@UseGuards` on `WalletsController` and
`TransfersController` — a real Nest `Guard`, not an inline check in each handler.

## Endpoints

### `POST /wallets`
Creates a wallet with a zero balance. No body required.

```
201 { "id": "...", "balanceKobo": 0, "createdAt": "..." }
```

### `POST /wallets/:id/credit`
Deposits funds.

```
Body: { "amountKobo": 100000 }
200 { "id": "...", "balanceKobo": 100000, "createdAt": "..." }
```

### `GET /wallets/:id`
```
200 { "id": "...", "balanceKobo": 100000, "createdAt": "..." }
404 if the wallet doesn't exist
```

### `POST /transfers`
Moves funds between two wallets.

```
Headers: Idempotency-Key: <any client-generated string>
Body: { "fromWalletId": "...", "toWalletId": "...", "amountKobo": 50000 }

201 {
  "transferId": "...", "fromWalletId": "...", "toWalletId": "...",
  "amountKobo": 50000, "fromBalanceKobo": ..., "toBalanceKobo": ..., "createdAt": "..."
}
```

Error cases:
| Status | Condition |
|---|---|
| 400 | missing `Idempotency-Key`, missing/invalid fields, `fromWalletId === toWalletId` |
| 401 | missing/invalid bearer token |
| 404 | either wallet doesn't exist |
| 409 | `Idempotency-Key` reused with a different request payload |
| 422 | insufficient funds, or the ₦500,000/day outbound limit would be exceeded |

Replaying a `POST /transfers` request with the **same** `Idempotency-Key` and the same body
returns the original response (same status code and body) without moving money twice.

## Architecture

NestJS feature modules, kept deliberately flat rather than deeply nested:

```
src/
  main.ts                           bootstrap: body-parser wiring, global ValidationPipe, global exception filter
  app.module.ts / app.controller.ts health check only, no guard
  store.service.ts / store.module.ts   the mutex + JSON file persistence (DI singleton)
  wallet.model.ts                   pure domain functions shared by wallets + transfers (wallet lookup,
                                     daily-window reset, kobo math)
  utils/wat.ts                      pure WAT-date function
  common/
    exceptions/api.exception.ts     HttpException subclass that renders `{ error: message }`
    filters/all-exceptions.filter.ts  global catch-all -> consistent error envelope + 500 logging
    guards/bearer-auth.guard.ts     auth, see above
    guards/idempotency-key.guard.ts route-level guard: rejects a missing Idempotency-Key before
                                     the body even reaches DTO validation (preserves original
                                     check ordering: auth -> idempotency header -> body shape)
  wallets/      wallets.module.ts, wallets.controller.ts, wallets.service.ts, dto/credit-wallet.dto.ts
  transfers/    transfers.module.ts, transfers.controller.ts, transfers.service.ts, dto/create-transfer.dto.ts
```

Request validation (`amountKobo` positive-integer, `fromWalletId`/`toWalletId` non-empty strings)
lives at the DTO layer via `class-validator`, wired through a global `ValidationPipe` with a
custom `exceptionFactory` so validation failures come back as `400 { "error": "..." }` instead of
Nest's default `{ statusCode, message, error }` shape. Cross-field checks that `class-validator`
decorators can't express on their own (`fromWalletId !== toWalletId`) and the `Idempotency-Key`
header check stay as explicit guards/service-level checks, per the brief's guidance against
speculative abstraction.

## Design notes

- **Amounts in kobo.** All monetary fields are integer kobo (₦1 = 100 kobo) to avoid
  floating-point drift, per the brief.
- **Atomicity without a database.** All mutating operations (`credit`, `transfer`, wallet
  creation) run through a single in-process async mutex (`src/store.service.ts`, a Nest DI
  singleton) that serializes read-modify-write cycles against the in-memory store, then persists
  to `data/db.json` via a write-to-temp-file + rename so a crash mid-write can't corrupt the file.
  This is enough to guarantee correctness for a single Node process; it would not survive multiple
  processes sharing the same file (noted as an explicit scaling limit, not something Part A tries
  to solve — scaling out would mean moving the lock to Redis/Postgres advisory locks).
- **Idempotency.** Each `Idempotency-Key` is stored with a hash of the request body it was
  first used with. A replay with an identical body returns the cached response; a replay with a
  *different* body is rejected with `409` instead of silently reprocessing — this protects
  against a client bug that reuses a key across logically different transfers.
  Validation (wallet existence, sufficient funds, daily limit) always runs before any balance
  mutation, so a thrown error never leaves a half-applied transfer.
- **Daily outbound limit, WAT-anchored.** Each wallet stores `dailyOutbound: { watDate, totalKobo }`.
  `src/utils/wat.ts` computes "today" by adding a fixed UTC+1 offset to `Date.now()` and reading
  the UTC calendar fields back off — this gives the correct West Africa Time calendar date
  regardless of the host server's own timezone or DST settings (WAT has no DST). The window
  resets lazily on next access once the stored `watDate` no longer matches today, rather than
  via a cron job.
- **No negative balances.** Verified under concurrency: firing 10 simultaneous transfers against
  a wallet that can only afford one succeeds exactly once; the other nine get `422 Insufficient
  funds` and the balance never dips below zero (see Part B test suite for the automated version
  of this check).
