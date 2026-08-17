<div align="center">

# 🔥 Momentum

### A habit tracker that actually understands time

_Because a day you showed up should be easy to record — and impossible to forget._

<br>

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-queues-E0234E?style=for-the-badge)](https://bullmq.io/)
[![Zod](https://img.shields.io/badge/Zod-validation-3E67B1?style=for-the-badge)](https://zod.dev/)

<br>

![Tests](https://img.shields.io/badge/tests-84_passing-22c55e?style=flat-square)
![Coverage](https://img.shields.io/badge/domain_coverage-100%25-22c55e?style=flat-square)
![Modules](https://img.shields.io/badge/API_modules-7-2B4CE0?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-333?style=flat-square)

</div>

<br>

---

<br>

## 📌 At a glance

<table>
<tr>
<td width="50%" valign="top">

**What it is**

A full-stack habit tracker built as a TypeScript monorepo — Express API, BullMQ worker, and a shared package of pure domain logic that the server and client both run.

</td>
<td width="50%" valign="top">

**Why it's not a CRUD app**

Habit tracking looks simple until you handle timezones, schedule-aware streaks, and 10,000 reminders across the world. That's where the engineering is.

</td>
</tr>
</table>

<br>

|                                                 |                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| 🗓️ **Four schedule types**                      | Daily · specific weekdays · _n_ times a week · every _n_ days           |
| 🔥 **Streaks that understand rest**             | Missing Friday on a Sat/Mon/Wed habit doesn't break anything            |
| 🌍 **Timezone-correct by construction**         | A 00:30 tick in Dhaka counts for the right day, always                  |
| ⏰ **Reminders in your local time**             | One sweep job handles every user's timezone — travel and it follows you |
| ⚡ **Two queries per home screen**              | Regardless of how many habits you track                                 |
| 🔐 **Refresh token rotation + reuse detection** | A stolen token logs the real user out, so they find out                 |

<br>

---

<br>

## 🧠 The hard problems

> Most habit trackers get the easy part right and the hard part wrong.
> The easy part is storing a checkmark. The hard part is that **time is genuinely difficult.**

<br>

<table>
<tr>
<td width="33%" valign="top">

### 🌐 What is "today"?

A tick at **00:30 in Dhaka** is still _yesterday_ in UTC.

Store a timestamp and derive the day from it, and streaks corrupt themselves silently — the user finds out weeks later when a 30-day chain shows zero.

**→** `localDate` is a `DATE` column. The client sends `YYYY-MM-DD`; the server only range-checks it. No timezone conversion happens anywhere, so none can go wrong.

</td>
<td width="33%" valign="top">

### 🔗 What counts as a streak?

Not "consecutive days." A Sat/Mon/Wed habit **owes you nothing on Tuesday** — that day can't extend the chain and can't break it either.

And an unmarked habit at 9am hasn't failed. The day isn't over.

**→** `isDue()` runs _before_ any log is read. Streaks walk only the days you were actually due.

</td>
<td width="33%" valign="top">

### ⏱️ 10,000 reminders, every timezone

You can't schedule a job per reminder — change one timezone and they all need rescheduling. DST breaks them all twice a year.

**→** One repeatable sweep every 5 minutes asks _"whose reminder is due right now?"_ Redis `SETNX` guarantees exactly one send per day.

</td>
</tr>
</table>

<br>

---

<br>

## 🏗️ Architecture

```
                     ┌──────────────────────────┐
                     │   Web client (Next.js)   │
                     └────────────┬─────────────┘
                                  │  Bearer JWT
                                  ▼
                     ┌──────────────────────────┐
                     │      Nginx · TLS         │
                     └────────────┬─────────────┘
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
    ┌────────────────────────┐        ┌────────────────────────┐
    │   API  ·  Express 5    │        │   Worker  ·  BullMQ    │
    │   Prisma · Zod · JWT   │        │   ├─ reminder sweep    │
    │   7 modules            │        │   ├─ web push          │
    └───────────┬────────────┘        │   └─ transactional mail│
                │                     └───────────┬────────────┘
                └──────────────┬──────────────────┘
                               ▼
        ┌──────────────────────────────────────────┐
        │  Neon Postgres            Redis Cloud    │
        └──────────────────────────────────────────┘
                               ▲
                               │
        ┌──────────────────────┴───────────────────┐
        │   packages/core  —  pure domain logic    │
        │   imported by API, worker AND client     │
        └──────────────────────────────────────────┘
```

<br>

> 💡 **The API and worker are separate containers sharing one codebase.**
> If the worker stalls on a slow SMTP call, requests keep flowing. If the API redeploys, scheduled jobs aren't interrupted.

<br>

---

<br>

## ⭐ The idea I'm proudest of

<table>
<tr><td>

### `packages/core` — one definition of truth

Every function is **pure**: plain values in, plain values out. No database, no HTTP, no clock reads except where a date is passed explicitly.

```ts
import { streakFor, isDue, todayIn } from '@momentum/core';
```

Three things fall out of that, and each one matters:

|                                      |                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 🧪 **Tests need zero mocks**         | Which is why 100% coverage was an afternoon, not a slog                                                                          |
| ⚡ **The client runs the same code** | Optimistic UI computes a streak with the exact function the server will run — the number never flickers between tap and response |
| 🎯 **Rules live in one place**       | Change how `SKIPPED` behaves and API, worker and client all agree _mechanically_, not by discipline                              |

</td></tr>
</table>

<br>

---

<br>

## 📐 Streak rules

A streak is only useful if you trust it. Every rule is explicit, documented, and **tested by name**.

<br>

<table>
<tr><th width="34%">Rule</th><th>What it means</th></tr>
<tr>
<td><b>Non-due days are invisible</b></td>
<td>🟦🟦⬜🟦 — Tuesday can't break a Sat/Mon/Wed habit. It doesn't extend the chain either.</td>
</tr>
<tr>
<td><b>Today can't break a streak</b></td>
<td>🟦🟦🟦🟧 — Unmarked at 9am is not a failure. The day only counts against you once it's over, <i>in your timezone</i>.</td>
</tr>
<tr>
<td><b>Skipped is neutral</b></td>
<td>🟦⬜🟦🟦 — A rest day holds the chain in place without inflating it. Being sick isn't a punishment.</td>
</tr>
<tr>
<td><b>A miss keeps your record</b></td>
<td>🟦🟦🟥🟦 — Current resets to zero; longest stays. You can't lose what you already built.</td>
</tr>
<tr>
<td><b>Weekly habits count weeks</b></td>
<td>"3× per week" is measured across the week — and the current week is never counted as failed.</td>
</tr>
<tr>
<td><b>Edits don't rewrite history</b></td>
<td>Schedule changes apply from today forward. A hard-won streak never vanishes because you adjusted a setting.</td>
</tr>
</table>

<br>

---

<br>

## 🧩 Tech stack — and why

<table>
<tr><th>Layer</th><th>Choice</th><th>Reasoning</th></tr>
<tr><td>Runtime</td><td><b>Node 20 · TypeScript strict</b></td><td><code>noUncheckedIndexedAccess</code> catches date-array bugs the compiler would otherwise wave through</td></tr>
<tr><td>API</td><td><b>Express 5</b></td><td>Native async error handling; light enough for this scope</td></tr>
<tr><td>Database</td><td><b>PostgreSQL 16</b> · Neon</td><td><code>DATE</code> type and window functions are exactly what streak queries need</td></tr>
<tr><td>ORM</td><td><b>Prisma</b></td><td>Type-safe queries, first-class migrations</td></tr>
<tr><td>Validation</td><td><b>Zod</b></td><td>One schema yields both runtime validation and TS types — they can't drift apart</td></tr>
<tr><td>Queue</td><td><b>BullMQ + Redis</b></td><td>Repeatable jobs, retries and dedup out of the box</td></tr>
<tr><td>Auth</td><td><b>Custom JWT + rotation</b></td><td>Rotation and reuse detection, which off-the-shelf options don't provide</td></tr>
<tr><td>Logging</td><td><b>Pino</b></td><td>Structured JSON with secret redaction</td></tr>
<tr><td>Tests</td><td><b>Vitest + Supertest</b></td><td>Fast, TypeScript-native</td></tr>
</table>

<br>

> 🚫 **Deliberately left out:** offline-first sync (conflict resolution is its own project), microservices, and a caching layer — nothing has been _measured_ as slow yet.
>
> Being able to explain why I didn't use something is worth more than having used it.

<br>

---

<br>

## 🔬 Engineering decisions

<details>
<summary><b>🌍 Why <code>localDate</code> is a DATE column, not a timestamp</b></summary>

<br>

```
❌ With a timestamp
   Dhaka, 00:30 on 6 Jan  →  stored as 2026-01-05T18:30:00Z
   Server thinks: 5 Jan   ·  User thinks: 6 Jan
   → streak wrong, discovered a week later

✅ With a DATE
   Client resolves its own day  →  "2026-01-06"
   Server stores that string, range-checks it
   → no conversion happens, so none can go wrong
```

`completedAt` keeps the UTC instant separately, for auditing and a future "when do you actually do this" analysis. It is never used to decide which day a log belongs to.

</details>

<details>
<summary><b>🔁 Why check-in is idempotent by design</b></summary>

<br>

`@@unique([habitId, localDate])` plus `PUT` upsert means two devices marking the same day at the same moment produce **one row and no error** — not a 409 the client has to handle.

```ts
prisma.habitLog.upsert({
  where: { habitId_localDate: { habitId, localDate } },
  ...
})
```

Never `findFirst` then `create` — that races, and the race is exactly what the constraint prevents.

</details>

<details>
<summary><b>📊 Why streaks aren't cached</b></summary>

<br>

Three years of history is ~1,100 rows per habit. The in-memory loop runs in under a millisecond.

Cache invalidation is its own bug source and solves no _measured_ problem here. If `/today` p95 ever passes 300ms, a `cachedStreak` column is the answer — **not before**.

Premature optimisation avoided on purpose, and being able to say why is the point.

</details>

<details>
<summary><b>⏰ Why reminders use a sweep, not per-reminder jobs</b></summary>

<br>

|                       | Sweep     | Job per reminder      |
| --------------------- | --------- | --------------------- |
| Jobs to manage        | **1**     | 10,000                |
| User changes timezone | automatic | reschedule everything |
| DST boundary          | fine      | breaks twice a year   |
| Worker restart        | fine      | needs rehydration     |

One repeatable job every 5 minutes runs a single indexed query: _whose reminder is due right now?_ A Redis `SETNX` key per reminder per day is the only defence against duplicate sends — and it's enough, even when a deploy overlaps two workers.

</details>

<details>
<summary><b>🔐 Why refresh tokens rotate</b></summary>

<br>

Tokens are stored as **SHA-256 hashes** — a database leak must not hand out live sessions, same reasoning as a password hash.

Every successful refresh revokes the old token and issues a new one. Present an **already-revoked** token and the entire family is revoked: a stolen token logs the real user out, so they _find out something happened_.

Without rotation, a stolen token works silently for 30 days.

</details>

<details>
<summary><b>🛡️ Why ownership is checked twice</b></summary>

<br>

Middleware resolves and verifies the resource, **and** every service query is scoped by `userId`. Deliberate belt-and-braces — missing ownership checks are the most common real vulnerability in APIs like this one.

Foreign resources return **404, not 403**. A 403 confirms the id exists, which leaks information.

</details>

<details>
<summary><b>⚡ Why <code>/today</code> is exactly two queries</b></summary>

<br>

```
1. one query  →  user + all active habits
2. one query  →  all logs across the streak window
3. group into Map<habitId, Map<date, status>> in memory
4. isDue() and streakFor() per habit — pure functions, zero I/O
```

The database is remote (~60ms round trip). A query per habit would make the home screen take seconds — and the test suite asserts the query count, not wall-clock time, so it can't regress silently.

</details>

<br>

---

<br>

## 🧪 Testing

<div align="center">

| Layer                      | Scope                        | Result                                |
| -------------------------- | ---------------------------- | ------------------------------------- |
| **Unit** — `packages/core` | dates, schedules, streaks    | **84 tests · 100% coverage enforced** |
| **Integration**            | every endpoint via Supertest | all 7 modules                         |

</div>

<br>

The 100% gate isn't a vanity number — **it caught a real gap.** A branch where an older weekly run was longer than the current one was correct, but nothing had ever _proved_ it. The code was right; the confidence wasn't.

Tests are named for the bugs they prevent:

```
✓ does not break the streak when today is still unmarked
✓ is not broken by missing a day it was never due
✓ treats SKIPPED as neutral — holds the chain, adds nothing
✓ carries a streak across a year boundary
✓ gives the local calendar day, not the UTC one
✓ is unaffected by daylight saving shifts
✓ two devices marking the same day produce one row
```

<br>

---

<br>

## 🚀 Getting started

**Requirements** — Node 20.6+, a Postgres database ([Neon](https://neon.tech) free tier), a Redis instance ([Redis Cloud](https://redis.io) free tier). Both managed; nothing runs locally.

```bash
git clone https://github.com/parvejme24/momentum.git
cd momentum
npm install
cp .env.example .env
```

Generate secrets into `.env`:

```bash
openssl rand -base64 48                              # JWT_ACCESS_SECRET
openssl rand -base64 48                              # JWT_REFRESH_SECRET
npx -w @momentum/worker web-push generate-vapid-keys # VAPID pair
```

Create the schema and go:

```bash
npm run db:generate
npm run db:migrate
npm run dev:api
```

```bash
curl -s localhost:4000/v1/health | jq
```

```json
{ "status": "ok", "uptime": 3, "checks": { "database": true, "redis": true } }
```

> 💡 `/health` returns **503** when a dependency is down, so a load balancer stops routing to an instance that can't actually serve.

<br>

<details>
<summary><b>📜 All scripts</b></summary>

<br>

```bash
npm run dev:api          # API with hot reload
npm run dev:worker       # worker only
npm run dev              # both, interleaved logs

npm run check            # lint + typecheck + test
npm test -w @momentum/core

npm run db:migrate       # create and apply a migration
npm run db:studio        # browse the database
npm run db:seed

npm run check:db         # verify Postgres connectivity and latency
npm run check:redis      # verify Redis connectivity
```

</details>

<details>
<summary><b>🔑 Environment variables</b></summary>

<br>

| Variable             | Notes                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Pooled connection — every normal query                                                    |
| `DIRECT_URL`         | Direct connection, **migrations only**. A pooler can't hold the session lock Prisma needs |
| `REDIS_URL`          | `rediss://` — two `s`, TLS required                                                       |
| `JWT_ACCESS_SECRET`  | 32+ chars; the process refuses to boot otherwise                                          |
| `JWT_REFRESH_SECRET` | Must differ from the access secret                                                        |
| `CORS_ORIGINS`       | Comma-separated allowlist                                                                 |
| `SMTP_*` · `VAPID_*` | Mail and web push                                                                         |

Environment is parsed through Zod at boot and the process **exits** on failure. A container that dies in two seconds saying `JWT_ACCESS_SECRET — use at least 32 characters` beats one that starts fine and throws `undefined` on the first login at 2am.

</details>

<br>

---

<br>

## 📡 API

<div align="center">

Base URL `/v1` · Bearer auth except health, register, login and the VAPID key

</div>

<br>

<details open>
<summary><b>🔐 Auth</b></summary>

<br>

| Method        | Path                           |                                                    |
| ------------- | ------------------------------ | -------------------------------------------------- |
| `POST`        | `/auth/register`               | create account, return token pair                  |
| `POST`        | `/auth/login`                  | identical error for wrong email and wrong password |
| `POST`        | `/auth/refresh`                | rotate the refresh token                           |
| `POST`        | `/auth/logout` · `/logout-all` | revoke one session or all                          |
| `GET` `PATCH` | `/auth/me`                     | profile, timezone, week start                      |
| `POST`        | `/auth/change-password`        | revokes every session                              |

</details>

<details>
<summary><b>📋 Habits &amp; logs</b></summary>

<br>

| Method                 | Path                               |                                     |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| `GET` `POST`           | `/habits`                          | list with streaks · create          |
| `GET` `PATCH` `DELETE` | `/habits/:id`                      | delete needs `?confirm=true`        |
| `PATCH`                | `/habits/reorder`                  | single transaction                  |
| `POST`                 | `/habits/:id/archive` · `/restore` | soft delete keeps every log         |
| `PUT` `DELETE`         | `/habits/:id/logs/:localDate`      | idempotent check-in                 |
| `GET`                  | `/logs?from=&to=`                  | heatmap data, all habits, one query |

</details>

<details>
<summary><b>📊 Views</b></summary>

<br>

| Method | Path                          |                                        |
| ------ | ----------------------------- | -------------------------------------- |
| `GET`  | `/today?date=`                | the entire home screen in one response |
| `GET`  | `/habits/:id/stats?range=90d` | streaks, weekday breakdown, heatmap    |
| `GET`  | `/stats/overview?range=90d`   | dashboard totals                       |

</details>

<details>
<summary><b>⏰ Reminders &amp; devices</b></summary>

<br>

| Method           | Path                        |                        |
| ---------------- | --------------------------- | ---------------------- |
| `GET` `POST`     | `/habits/:id/reminders`     | max 5 per habit        |
| `PATCH` `DELETE` | `/reminders/:id`            |                        |
| `GET` `POST`     | `/devices`                  | web push subscriptions |
| `GET`            | `/devices/vapid-public-key` | public, no auth        |

</details>

<details>
<summary><b>⚠️ Error format</b></summary>

<br>

One shape everywhere:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields",
    "details": [{ "field": "targetPerWeek", "issue": "must be between 1 and 7" }]
  }
}
```

`TOKEN_EXPIRED` is separate from `UNAUTHORIZED` on purpose — the client uses it to decide whether to refresh rather than sign the user out.

</details>

<br>

---

<br>

## 📂 Repository layout

```
momentum/
├── apps/
│   ├── api/                  Express 5 REST API
│   │   ├── prisma/           schema · migrations
│   │   └── src/
│   │       ├── lib/          env · prisma · redis · logger · jwt · errors
│   │       ├── middleware/   auth · ownership · validate · error
│   │       └── modules/      auth · habit · log · today · stats · reminder · device
│   └── worker/               BullMQ jobs
│
└── packages/
    ├── core/                 ⭐ pure domain logic — 84 tests, 100% coverage
    │   ├── date.ts           LocalDate · todayIn · addDays · startOfWeek
    │   ├── schedule.ts       isDue · nextDueDate · countDueDays
    │   └── streak.ts         computeStreak · computeWeeklyStreak · completionRate
    └── types/                Zod schemas shared by API and clients
```

<br>

---

<br>

## 🗺️ Roadmap

<div align="center">

|     | Phase                                                              |             |
| :-: | ------------------------------------------------------------------ | :---------: |
| ✅  | **Foundation** — monorepo, Prisma schema, managed Postgres & Redis |    done     |
| ✅  | **Domain logic** — dates, schedules, streaks · 100% covered        |    done     |
| ✅  | **API** — auth, habits, logs, today, stats, reminders, devices     |    done     |
| 🔄  | **Web client** — Next.js with optimistic check-in                  | in progress |
| ⏳  | **Worker** — reminder sweep, web push, transactional email         |    next     |
| ⏳  | **Deploy** — Docker, CI/CD, AWS                                    |             |
| ⏳  | **Polish** — animation, live sync, PWA                             |             |

</div>

<br>

---

<br>

<div align="center">

### Built by **Md Parvej**

Full-stack developer · Dhaka, Bangladesh

[![Portfolio](https://img.shields.io/badge/Portfolio-mdparvej.dev-2B4CE0?style=for-the-badge)](https://mdparvej.dev)
[![GitHub](https://img.shields.io/badge/GitHub-parvejme24-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/parvejme24)
[![Email](https://img.shields.io/badge/Email-devparvej@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:devparvej@gmail.com)

<br>

_MIT licensed_

</div>
