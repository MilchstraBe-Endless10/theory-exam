# P2 HTTP API

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

The desktop and mobile learning home read real progress and recent practice data; practice selection, question delivery, server grading, saved feedback, favorites, and session resume use the endpoints above. With no session or no enabled bank, the interface shows empty or connection states. Exam rules are still read from the selected bank version. Formal mock-exam creation/submission, exam timing/scoring, and the P4 cross-round mistake mastery state machine are not implemented in P2. Development `?preview=1` fixtures remain isolated from API calls and production builds.
