# MediLens Frontend (Next.js + Tailwind)

The website. Bangla by default, with an English toggle. It talks only to our NestJS backend
(`../backend`), which talks to our own Python AI service (`../api`). No AI API key is ever in the browser.

## Run it (Windows)

Start these three first (see their READMEs): PostgreSQL, the AI service (port 8000), the backend (port 4000).

```
copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Pages
| Page | What it does |
|---|---|
| `/login`, `/register` | Account |
| `/` | Choose whose report it is, upload a photo or PDF, see earlier reports and reminders |
| `/reports/[id]` | Step 1: check the values the AI read. Step 2: results with a range bar, reason and Bangla explanation, next step, doctor PDF |
| `/trends` | Each test over time with the normal range shaded |
| `/reminders` | Follow-ups (one is created automatically after a flagged report) |
| `/family` | Add, edit and remove family members |

## Before hosting
- Set `NEXT_PUBLIC_API_URL` to the hosted backend address, and set `FRONTEND_ORIGIN` in the backend `.env` to this site's address.
- The login token is kept in the browser's local storage, which is fine for a capstone. For a real product move it to an httpOnly cookie.
