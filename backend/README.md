# MediLens Backend (NestJS + PostgreSQL)

Sits between the website and the Python AI service. It handles login, family profiles, report upload,
history, trends, reminders and the doctor-summary PDF. All AI work is done by our own Python service
(`../api`), never by an external AI API.

## Run it (Windows)

You need: Node.js 20+, and PostgreSQL (easiest is Docker Desktop).

1. Start the database:  `docker compose up -d`
   (No Docker? Install PostgreSQL and create a database `medilens`, user `medilens`, password `medilens`.)
2. In this folder:
   ```
   copy .env.example .env
   npm install
   npm run start:dev
   ```
   Tables are created automatically. The API runs on http://localhost:4000
3. In another terminal, start the AI service from the project root:
   `uvicorn api.main:app --port 8000`
4. Check everything works:  `npm run test:e2e`  (needs steps 1-3 running)

Set a long random `JWT_SECRET` in `.env` before deploying.

## How the website uses it

| Step | Call |
|---|---|
| Sign up / log in | `POST /auth/register`, `POST /auth/login` → `{ token }`; send `Authorization: Bearer <token>` |
| Family | `GET/POST /profiles`, `PATCH/DELETE /profiles/:id` (every account starts with a "self" profile) |
| Upload photo or PDF | `POST /profiles/:id/reports` (form field `file`) → values the AI read (status DRAFT) |
| Confirm values | `POST /reports/:id/confirm` `{ tests:[{code,value,printedLow,printedHigh}], reportDate, labName }` → status, reason and Bangla explanation per test, specialist, urgency |
| History | `GET /profiles/:id/reports` |
| Trends | `GET /profiles/:id/trends` or `?code=hba1c` → points over time + improving/worsening |
| Reminders | `GET /reminders?profileId=&pending=true`, `POST`, `PATCH /:id`, `DELETE /:id` (one is created automatically after a flagged report) |
| Doctor summary | `GET /reports/:id/summary.pdf` |
| Original file / delete | `GET /reports/:id/file`, `DELETE /reports/:id` |

## Security built in
- Passwords hashed with bcrypt; JWT login; login and upload rate limits; helmet headers.
- Every query is scoped to the logged-in user, so nobody can read another family's reports.
- Uploads are checked by their real file signature (JPG, PNG, PDF only) and capped at 10 MB.
