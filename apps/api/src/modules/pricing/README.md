# Pricing catalog

Public visitors and signed-in customers read published plans. Only users with `role: admin` mutate the catalog.

Base URL matches the rest of the API (`/v1/...`). Auth is a Bearer access token.

## Public (no auth)

| Method | Path                      | Notes                                           |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/v1/pricing/plans`       | Published plans, `sortOrder` ascending          |
| GET    | `/v1/pricing/plans/:slug` | Published only; draft/archived → 404            |
| GET    | `/v1/pricing/compare`     | Rows for the public compare table from `limits` |

## Admin (`requireAuth` + `requireAdmin`)

Writes are rate-limited (30/min).

| Method | Path                                  | Notes                                                                                                                                    |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/pricing/plans?status=`     | `draft` \| `published` \| `archived` \| `all`                                                                                            |
| POST   | `/v1/admin/pricing/plans`             | Create as `draft`                                                                                                                        |
| GET    | `/v1/admin/pricing/plans/:id`         |                                                                                                                                          |
| PATCH  | `/v1/admin/pricing/plans/:id`         | Price/interval change on a **published** plan snapshots a `plan_versions` row. Existing subscriptions keep the old amount until renewal. |
| POST   | `/v1/admin/pricing/plans/:id/publish` | `highlighted: true` unsets highlight on other published plans                                                                            |
| POST   | `/v1/admin/pricing/plans/:id/archive` | Refuses if this is the last published plan                                                                                               |
| POST   | `/v1/admin/pricing/plans/reorder`     | `{ "ids": ["..."] }` every plan id exactly once                                                                                          |
| DELETE | `/v1/admin/pricing/plans/:id`         | Draft, or never-subscribed. Active subscribers → 409 (archive instead)                                                                   |

## Rules

- Slug is immutable after first publish.
- Duplicate slug among non-archived plans → 409.
- Customer hitting `/v1/admin/*` → 403 `FORBIDDEN`.
- Missing/invalid token → 401 `UNAUTHORIZED`.
- Seed Free / Pro / Team via `npm run db:seed`.
