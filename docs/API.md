# HTTP API (P1–P5-A)

API base is the configured local service address. The server currently defaults to `127.0.0.1:3000`; set `HOST`, `PORT`, and `CORS_ORIGINS` for the actual local deployment. Do not add public reverse-proxy or frp settings here.

Android Capacitor requests use `Authorization: Bearer <session-token>` from Android Keystore-backed secure storage; SQLite stores only the token's SHA-256 digest. Browser sessions use an `HttpOnly; SameSite=Strict` cookie and do not return the session token in JSON. Production cookies require `Secure`, and `NODE_ENV=production` refuses `COOKIE_SECURE=false`. Browser state-changing requests must include the CSRF token returned by login/password change or `GET /api/auth/csrf` in `X-CSRF-Token`; the server also checks the configured `Origin`. Errors use `{ "error": { "code": "...", "message": "...", "details?": {} } }`.

## Health and user session

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Service and migration health. |
| `POST` | `/api/admin/bootstrap` | Loopback only; one time | Initialize the first administrator and create its session. |
| `POST` | `/api/auth/login` | Public, rate limited | Login with administrator-created username and password. |
| `GET` | `/api/auth/me` | Session | Return the authenticated user. |
| `POST` | `/api/auth/renew` | Session; browser cookie requests require CSRF | Extend the current session using its original 12-hour or 30-day remember policy. |
| `POST` | `/api/auth/logout` | Session | Revoke the current session. |
| `POST` | `/api/auth/password` | Session | Change the current password and rotate the current session. |
| `GET` | `/api/auth/csrf` | Session cookie | Return the current session's CSRF token for browser requests. |
| `GET` | `/api/banks` | Session | List enabled banks, active version counts, and that version's exam rules. |

`POST /api/auth/login` accepts `{ "username", "password", "remember?" }`. Login errors intentionally do not distinguish an unknown username, wrong password, or disabled account. Responses include `user.mustChangePassword` and `user.isTestAccount`; they never contain the password or encoded password hash. Login attempts are rate limited by the server-observed client address and normalized username.

`POST /api/auth/renew` accepts `{}` and slides the current session expiry by its original lifetime: 12 hours for a non-remembered session or 30 days for a remembered session. V6 stores that policy and backfills existing sessions from their original expiry interval. The bearer token remains unchanged; browser cookies receive an updated `Max-Age`. Disabled, expired, revoked, or first-login password-change sessions cannot renew. The native client renews after app/network recovery; the browser renews when a background tab becomes visible.

The web client never stores a session token in `localStorage` or `sessionStorage`; older token keys are deleted at startup. Browser state-changing requests require both a configured `Origin` and the session CSRF token. Android is recognized by its Capacitor origin (`https://localhost` or `capacitor://localhost`) and receives a bearer token for native secure storage. Requests without a browser `Origin` retain the bearer response for local CLI/test compatibility. A browser must not spoof native origins; CORS is not the authorization boundary. Production mobile server connections require HTTPS. A developer build accepts HTTP only for loopback addresses.

New accounts and administrator password resets set `mustChangePassword=true`. Until the user changes the password, authenticated requests other than `GET /api/auth/me`, `POST /api/auth/password`, and `POST /api/auth/logout` return `403 PASSWORD_CHANGE_REQUIRED`. Password change requires the current password and a new password of at least 12 characters. A successful change atomically updates the Argon2id hash, clears the forced-change state, revokes all prior sessions, and issues a replacement session. Existing users receive `mustChangePassword=false` by default during V3 migration.

## Local management

The process runs two separate listeners: the learning listener (default `127.0.0.1:3000`) does not register `/admin`, `/api/admin/*`, or the bootstrap route; the management listener (default `127.0.0.1:3001`) is loopback-only and its management APIs also enforce a loopback socket peer. Forwarded IP headers and browser CORS are not used as the access-control boundary. Do not map port 3001 through frp: a local frpc connection would itself look like loopback to the management listener. Management APIs also require an administrator session, except for the one-time bootstrap and status endpoint.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/status` | Loopback | Initialization and database migration status. |
| `GET` | `/api/admin/users` | Loopback + admin session | List accounts without password hashes; includes test-account and forced-change flags. |
| `POST` | `/api/admin/users` | Loopback + admin session | Create a normal user; optional `{ "isTestAccount": true }` marker; forces first-login password change. |
| `PATCH` | `/api/admin/users/:id` | Loopback + admin session | Enable or disable a user; disabling revokes all sessions. |
| `POST` | `/api/admin/users/:id/reset-password` | Loopback + admin session | Set a new password, require its first-use change, and revoke existing sessions. |
| `GET` | `/api/admin/banks` | Loopback + admin session | List enabled and disabled banks. |
| `GET` | `/api/admin/imports` | Loopback + admin session | List recent import jobs. |
| `POST` | `/api/admin/imports/preview` | Loopback + admin session | Parse and validate a multipart `.xlsx` file without importing it. |
| `GET` | `/api/admin/imports/:id` | Loopback + admin session | Read an import preview. |
| `POST` | `/api/admin/imports/:id/confirm` | Loopback + admin session | Confirm a valid preview and atomically write a new bank version and rules. |
| `PUT` | `/api/admin/banks/:id/rules` | Loopback + admin session | Update rules for the active bank version. |

Import preview reports the sheet, question totals by type, missing answers, row validation errors, duplicate stems, file fingerprint, and existing-version detection. Confirmation is a separate request. A blocked preview cannot be confirmed; identical files are idempotently recognized.

The `accounts:provision` server CLI is an operator-only local operation, not an HTTP endpoint. It requires an interactive terminal, a same-owner `0600` manifest, and explicit `--confirm`; it creates four ordinary accounts including exactly one test marker, writes randomly generated initial credentials into a separate `0700` data-directory subdirectory as a `0600` file, and refuses if any requested username already exists. The file is a one-time handoff and must be removed after delivery. It never writes credentials to stdout or logs.

## Daily practice and learning data

Every endpoint in this section requires a valid user session. The acting user comes only from the server-validated bearer token; `user_id` is neither accepted nor used as an access filter. New sessions bind to the bank's active version and persist an ordered question set. Existing sessions continue using their original version after a bank revision.

Ordinary question responses contain the stem, options, type, source sheet/row, and progress metadata. They never include `answer_json`, `raw_answer`, or a correct answer. Correct answers are returned only after the server has transactionally saved a formal attempt.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/practice/sessions` | Create a session using `bankId`, `mode`, and optional `quantity`. |
| `GET` | `/api/practice/sessions/active?bankId=...` | Find the user's latest in-progress or exited session for that bank. |
| `GET` | `/api/practice/sessions/:id` | Read an owned session and its current safe question. |
| `GET` | `/api/practice/sessions/:id/question?position=...` | Read one safe question and whether the user already submitted it. |
| `POST` | `/api/practice/sessions/:id/position` | Save the current one-based question position. |
| `POST` | `/api/practice/sessions/:id/resume` | Resume an exited, owned session. |
| `POST` | `/api/practice/sessions/:id/exit` | Mark an unfinished session exited; it remains resumable. |
| `POST` | `/api/practice/sessions/:id/submit` | Submit the current answer for server-side grading and persistence. |
| `GET` | `/api/practice/sessions/:id/result?position=...` | Read feedback for an already submitted position. |
| `GET` | `/api/favorites?bankId=...` | List favorites from the bank's active version. |
| `PUT` | `/api/favorites/:questionId` | Add a favorite with body `{ "bankId": "..." }`; repeated adds are idempotent. |
| `DELETE` | `/api/favorites/:questionId?bankId=...` | Remove the caller's favorite; repeated removes are idempotent. |
| `GET` | `/api/progress?bankId=...` | Read counts, correctness by type, favorite/mistake counts, and recent sessions for the active version. |

Supported modes are `sequential`, `random`, `single`, `multiple`, `judgement`, `unanswered`, `favorites`, and `mistakes`. `quantity` is an integer from 1 through 5000; if omitted, all matching questions are snapshotted. Random mode uses one unique row per position. `unanswered`, `favorites`, and `mistakes` filter by the authenticated user and selected active bank version.

Create a session with `{ "bankId": "<uuid>", "mode": "single", "quantity": 20 }`. The `201` response contains `session` (`id`, `bankId`, `bankVersionId`, `mode`, one-based `currentPosition`, `questionCount`, `submittedCount`, `status`, `createdAt`, `updatedAt`) and a safe `currentQuestion`. A question response has the shape `{ "question": { "id", "bankId", "bankVersionId", "type", "stem", "options", "source": { "sheet", "row" } }, "position", "total", "submitted", "userAnswer", "isCurrent" }`; answer fields remain absent until formal submission.

Move to a question with `{ "position": 3 }`. Resume and exit accept an empty JSON object. The active-session lookup and owned-session reads return the saved position and question ordering so a client can resume without reselecting or reshuffling questions. A session stays bound to its original bank version; new sessions use the bank's current active version.

`POST /api/practice/sessions/:id/submit` accepts an `answer` array of option letters for every type. Single-choice and judgement answers must contain exactly one letter; multiple-choice accepts distinct letters. The server canonicalizes the set before comparing, so letter order does not affect correctness. Example: `{ "answer": ["B", "C"] }`.

A successful response contains `attemptId`, `isCorrect`, the submitted `userAnswer`, `correctAnswer`, `correctOptions`, `explanation`, `submittedAt`, and session progress (`submittedCount`, `correctCount`, `totalQuestions`, `currentPosition`). Since imported P1 workbooks have no explanation field, `explanation` is `原题库未提供解析`. A retry with the same answer and session position returns the original attempt without incrementing statistics; changing an already submitted answer returns `409 PRACTICE_ANSWER_ALREADY_SUBMITTED`. The unique session/question constraint and transaction also prevent concurrent retries from adding duplicate attempts. The result endpoint returns this feedback only for a persisted attempt.

Favorite list responses are `{ "items": [<safe question>], "count": 0 }`; setting or clearing a favorite returns `{ "questionId", "favorite" }`. Repeating either operation is safe. Progress includes the current bank/version, `questionCount`, distinct `touchedCount`, `unansweredCount`, `explorationRate`, valid `submissionCount`, `correctCount`, `accuracyRate`, per-type counts/rates, `favoriteCount`, `pendingMistakeCount`, and up to five `recentSessions` with their mode, status, question/submission counts, timestamps, and correct/total attempts.

Relevant errors include `BANK_NOT_AVAILABLE` (404), `NO_PRACTICE_QUESTIONS` (409), `PRACTICE_SESSION_NOT_FOUND` (404, including a session owned by another account), `PRACTICE_QUESTION_NOT_FOUND` (404), `INVALID_ANSWER` (400), `PRACTICE_ANSWER_REQUIRED` (409), `PRACTICE_ANSWER_ALREADY_SUBMITTED` (409), `PRACTICE_NOT_ACTIVE` (409), and `SESSION_INVALID` (401).

Progress is calculated only from saved attempts for questions in the selected active version. `touchedCount` counts distinct attempted question IDs; `submissionCount` counts all valid saved attempts; `accuracyRate` is `correctCount / submissionCount * 100`, or `null` when there are no attempts. `explorationRate` is `touchedCount / questionCount * 100`. These values are separate. Mock-exam scores are not part of this API.

## Current client boundary

The desktop and mobile learning home read real progress and recent practice data; practice selection, question delivery, server grading, saved feedback, favorites, and session resume use the endpoints above. With no session or no enabled bank, the interface shows empty or connection states. Development `?preview=1` fixtures remain isolated from API calls and production builds.

## Mock exams

Every exam endpoint below requires a non-expired, enabled user's session and is bound to the authenticated account. The client cannot supply `user_id`. A valid forced-password-change session is rejected by the existing `PASSWORD_CHANGE_REQUIRED` gate. Starting an exam snapshots the active bank version and its `exam_rules`; question order, question text/options/source, correct answer, points, start time, deadline, and rule values remain bound to that exam even after a bank revision.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/exams` | Start an exam from `{ "bankId": "<uuid>" }`; a repeated start while an exam is active returns that same exam. |
| `GET` | `/api/exams/active` | Read the caller's active exam, including safe questions and saved answer versions; returns `{ "session": null, "questions": [], "result": null }` when none is active. |
| `GET` | `/api/exams/history?bankId=...` | Read up to 100 own exam summaries, optionally filtered by bank. |
| `GET` | `/api/exams/:id` | Restore the caller's exam and ordered paper. Before finalization it returns safe question snapshots and saved answers only. After finalization it also returns the immutable result and correct answers. |
| `PUT` | `/api/exams/:id/questions/:position/answer` | Synchronize one answer and its review marker using an expected version and idempotency key. |
| `POST` | `/api/exams/:id/submit` | Submit and grade immediately; retries return the same saved result. |
| `GET` | `/api/exams/:id/result` | Read the finalized result and full snapshot review; before finalization returns `409 EXAM_NOT_FINISHED`. |

`POST /api/exams` returns `201` for a new paper or `200` when it returns the user's current active exam. The server validates that the active version has enough questions for every configured type. A shortage returns `409 EXAM_QUESTION_SHORTAGE` with `{ "type", "required", "available" }`; absent/invalid rules return `EXAM_RULES_MISSING` or `EXAM_RULES_INVALID`. The four-level rules remain 120 single-choice × 0.5, 20 multiple-choice × 1, 40 judgement × 0.5, 180 total, 100 maximum score, 90 minutes. Other banks use their own rules. Each selected question record appears once in the paper.

Before settlement, `/api/exams` responses do not contain `answer_json`, `raw_answer`, `correctAnswer`, answer keys, per-question correctness, or scores. A saved answer is returned as `{ "position", "answer", "marked", "version", "updatedAt" }`; an unanswered question has an empty answer and version 0. A write body is `{ "answer": ["A", "C"], "expectedVersion": 2, "requestId": "<unique request id>", "marked": false }`. `answer` may be empty to clear a response; duplicate or unavailable option letters are rejected. The same `requestId` with the same payload is idempotent. Reusing a request ID for different content returns `409 IDEMPOTENCY_KEY_REUSED`. A stale version returns `409 ANSWER_VERSION_CONFLICT` and `error.details.current` with the server's answer, marker, version, and timestamp so a client can reconcile and retry. Versions increase per question; an older write cannot replace a newer one.

The server sets `startedAt` and `deadlineAt`; the client countdown is display-only. At `now >= deadlineAt`, answer updates are rejected and the server settles using only previously committed answers. Expiration is settled on startup, by a periodic server sweep, and when an active/history/result endpoint reads the exam. Closing the APP, logging out, losing the network, or restarting the service does not pause the deadline. The database partial unique index limits each user to one `in_progress` exam.

Manual submit and timeout settlement run in a SQLite transaction and are idempotent through the single `exam_results` row keyed by exam ID. Single-choice and judgement answers require an exact one-letter match; multiple-choice uses exact set equality; unanswered questions score zero and do not create mistake entries. Wrong answered questions update `mistake_states` exactly once per exam. A saved result contains total and per-type score, passing status from the snapshotted rule, correct/wrong/unanswered counts, duration, and all 180 questions with the user's answer, correct answer, points, and source snapshot. Exam sessions and snapshot questions remain associated with the old bank version for later review.

Relevant exam errors include `EXAM_NOT_FOUND` (404, including another user's exam), `EXAM_QUESTION_NOT_FOUND` (404), `EXAM_QUESTION_SHORTAGE` (409), `ANSWER_VERSION_CONFLICT` (409), `IDEMPOTENCY_KEY_REUSED` (409), `EXAM_DEADLINE_PASSED` or `EXAM_ALREADY_FINISHED` (409), `EXAM_NOT_FINISHED` (409), and `SESSION_INVALID` (401).

The mobile exam settings, answer sheet, server-synchronized responses, confirmation dialog, score view, full paper review, and exam history use these APIs. Development Preview remains a non-persistent visual fixture and does not submit to these endpoints.

## Formal mistake review rounds (P4)

Every endpoint below requires an enabled, authenticated user session. The server obtains the user ID only from the validated session. A review round is bound to the bank version active when it is created, and its question IDs and order are immutable. The `mistake_states` row is the single current mastery state per user and question; review rounds and attempts preserve the history across bank revisions.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/mistakes/stats?bankId=...` | Read current-version counts for `review`, `reinforcing`, and `mastered`, including per-type counts. |
| `GET` | `/api/mistakes?bankId=...&masteryStatus=...&questionType=...` | List own mistakes in the bank's active version. `masteryStatus` accepts `pending`, `review`, `reinforcing`, `mastered`, or `all`; `questionType` accepts `all`, `single`, `multiple`, or `judgement`. |
| `GET` | `/api/reviews/active?bankId=...` | Return the latest resumable round and its saved position, or null values when no round is active/exited. |
| `GET` | `/api/reviews/history?bankId=...` | Return up to 100 of the caller's rounds, with answered/correct counts and status. |
| `POST` | `/api/reviews` | Create a round from `bankId`, `questionType`, `strategy`, `quantity`, and `masteryStatus`. |
| `GET` | `/api/reviews/:id` | Read an owned round and its safe current question. |
| `GET` | `/api/reviews/:id/question?position=...` | Read one safe question by one-based position. |
| `POST` | `/api/reviews/:id/position` | Save the current position using `{ "position": 2 }`. |
| `POST` | `/api/reviews/:id/resume` | Resume an exited round. |
| `POST` | `/api/reviews/:id/exit` | Save an unfinished round as exited; its question order and answers remain available. |
| `POST` | `/api/reviews/:id/submit` | Submit `{ "answer": ["A"] }`; the server grades, records the answer, and updates mastery in one transaction. |
| `GET` | `/api/reviews/:id/result?position=...` | Return feedback only for an already submitted question. |
| `GET` | `/api/reviews/:id/results` | Return the round summary and all submitted feedback for its history detail. Unanswered positions have no answer key in the response. |

## App updates

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/updates/latest` | Enabled user session | Return the cached release manifest after checking the APK SHA-256. |
| `GET` | `/api/updates/apk` | Enabled user session | Stream the fixed `theory-exam.apk` cache file after verifying the configured digest. |

The manifest contains `applicationId`, `version`, `versionCode`, `signerSha256`, `apkSha256`, `releaseNotes`, and the fixed `apkFilename`. The server accepts no path or proxy target from a client. `npm --prefix apps/server run updates:sync` reads a server-only `GITHUB_TOKEN` from the process environment and downloads only the exact `theory-exam.apk` and `theory-exam-update.json` assets from the configured private repository release. The token is never sent to the APP or logged. The mobile APP checks application ID, increasing version code, and downloaded SHA-256; Android's system package installer enforces installed-package signature continuity and always asks the user to confirm installation. The client refuses to open the installer while an exam is active.

`POST /api/reviews` accepts `questionType` as `all`, `single`, `multiple`, or `judgement`; `strategy` as `random` or `weak`; `quantity` as `10`, `20`, or `all`; and `masteryStatus` as `pending` or `mastered`. `pending` selects both `review` and `reinforcing`. The requested quantity is capped at the actual matching count; the response reports `availableCount`, actual `questionCount`, and `round.reducedToAvailable` so the UI can explain a short set. No matching questions returns `409 NO_REVIEW_QUESTIONS`. Only one unfinished round per user and bank can be in progress at a time; a conflict returns `409 REVIEW_ROUND_IN_PROGRESS` with the existing round ID.

The create response includes `{ "round", "currentQuestion", "availableCount" }`. A round summary contains its ID, bank and version IDs, type filter, strategy, requested quantity, mastery scope, available and snapshotted question counts, saved current position, submitted count, status, timestamps, and `reducedToAvailable`. Safe question responses include the stem, options, source row, current mastery status, and error count, but do not include `answer_json`, `raw_answer`, or a correct answer. A correctness result is returned only after a successful persisted submission and contains the submitted and correct option sets, correct option text, the mastery state after this attempt, and round progress. When the workbook has no explanation, feedback says `原题库未提供解析`.

Single-choice and judgement require exactly one valid option. Multiple-choice normalizes option letters and requires exact set equality; an incomplete, extra, or incorrect set is wrong. Repeating the same submission in the same round returns the original attempt ID and feedback without updating counts again. Submitting a different answer for an already submitted question returns `409 REVIEW_ANSWER_ALREADY_SUBMITTED`. A unique `(review_round_id, question_id)` constraint and the write transaction enforce one counted attempt per question per round.

Mastery transitions are server-owned: an initial practice or answered exam error creates or resets `review` with zero consecutive review rounds; an ordinary practice or exam correct answer never advances mastery. A correct answer in one formal review round changes `review` to `reinforcing` with count 1; a correct answer in a different round changes it to `mastered` with count 2. Any subsequent error from ordinary practice, an answered exam question, or a formal review resets a mastered/reinforcing question to `review`. Unanswered exam questions do not create mistake state. A same-round retry, refresh, or replay cannot count as another round. The history tables remain version-linked and are not deleted when a bank's active version changes.

Errors include `BANK_NOT_AVAILABLE` (404), `NO_REVIEW_QUESTIONS` (409), `REVIEW_ROUND_IN_PROGRESS` (409), `REVIEW_ROUND_NOT_FOUND` (404, including a round owned by another account), `REVIEW_QUESTION_NOT_FOUND` (404), `INVALID_REVIEW_POSITION` (400), `INVALID_ANSWER` (400), `REVIEW_ANSWER_REQUIRED` (409), `REVIEW_ANSWER_ALREADY_SUBMITTED` (409), `REVIEW_ROUND_NOT_ACTIVE` (409), and `SESSION_INVALID` (401). The history result endpoint follows the same ownership rule and returns 404 for another user's round.

The mobile mistake book, desktop review view, question feedback, resume control, mastery counts, and history detail read these endpoints. In development, `?preview=1` uses visibly marked local fixtures and makes no review API request; the production client uses only server data.
