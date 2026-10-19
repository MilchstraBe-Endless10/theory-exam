# P1 HTTP API

API base is the configured local service address. The server currently defaults to `127.0.0.1:3000`; set `HOST`, `PORT`, and `CORS_ORIGINS` for the actual local deployment. Do not add public reverse-proxy or frp settings here.

Authenticated requests use `Authorization: Bearer <session-token>`. Session tokens are random; SQLite stores only their SHA-256 digest. Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Health and user session

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Service and migration health. |
| `POST` | `/api/admin/bootstrap` | Loopback only; one time | Initialize the first administrator and create its session. |
| `POST` | `/api/auth/login` | Public, rate limited | Login with administrator-created username and password. |
| `GET` | `/api/auth/me` | Session | Return the authenticated user. |
| `POST` | `/api/auth/logout` | Session | Revoke the current session. |
| `POST` | `/api/auth/password` | Session | Change the current password and rotate the current session. |
| `GET` | `/api/banks` | Session | List enabled banks, active version counts, and that version's exam rules. |

`POST /api/auth/login` accepts `{ "username", "password", "remember?" }`. Login errors intentionally do not distinguish an unknown username, wrong password, or disabled account.

## Local management

The `/admin` page and management APIs enforce loopback access on the server socket. Forwarded IP headers and browser CORS are not used as the access-control boundary. Management APIs also require an administrator session, except for the one-time bootstrap and status endpoint.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/status` | Loopback | Initialization and database migration status. |
| `GET` | `/api/admin/users` | Loopback + admin session | List accounts without password hashes. |
| `POST` | `/api/admin/users` | Loopback + admin session | Create a normal user. |
| `PATCH` | `/api/admin/users/:id` | Loopback + admin session | Enable or disable a user; disabling revokes all sessions. |
| `POST` | `/api/admin/users/:id/reset-password` | Loopback + admin session | Set a new password and revoke existing sessions. |
| `GET` | `/api/admin/banks` | Loopback + admin session | List enabled and disabled banks. |
| `GET` | `/api/admin/imports` | Loopback + admin session | List recent import jobs. |
| `POST` | `/api/admin/imports/preview` | Loopback + admin session | Parse and validate a multipart `.xlsx` file without importing it. |
| `GET` | `/api/admin/imports/:id` | Loopback + admin session | Read an import preview. |
| `POST` | `/api/admin/imports/:id/confirm` | Loopback + admin session | Confirm a valid preview and atomically write a new bank version and rules. |
| `PUT` | `/api/admin/banks/:id/rules` | Loopback + admin session | Update rules for the active bank version. |

Import preview reports the sheet, question totals by type, missing answers, row validation errors, duplicate stems, file fingerprint, and existing-version detection. Confirmation is a separate request. A blocked preview cannot be confirmed; identical files are idempotently recognized.

## Current client boundary

The desktop and mobile learning home, practice selection, and exam settings read enabled banks from `GET /api/banks`. With no session or no enabled bank they show an empty state. Exam rules are displayed from the selected bank version. Formal question delivery, practice records, exam creation/submission, scoring, and review records are not implemented in P1. Development `?preview=1` fixtures are isolated from API calls and production builds.
