# MediLens

Upload an **English blood-test report** (photo or PDF) and get a **simple Bangla explanation**: which values are outside
the normal range and why, which specialist to see and how soon, plus trends over time for the whole family.

> MediLens gives information only. It is not a diagnosis or treatment. Please see a doctor before deciding anything.

Capstone project, SE-331, Daffodil International University (Fall 2026).
Team: Joy Roy Chowdhury, GM Sabbir Ahmed, Mollah Abu Saif Kiron. Supervisor: Md. Rashedul Alam.

## The AI part is built by us, with no external AI API

```
Photo/PDF ─► OpenCV ─► Tesseract OCR ─► our rule-based extractor ─► user confirms values
          ─► our range engine (decides every status) ─► specialist rules ─► Bangla explanation + safety filter
```

- The **rule engine always decides** normal / borderline / low / high / critical. A language model never decides a status.
- A small open-source LLM (Qwen, fine-tuned with LoRA and served locally with Ollama) is planned only for wording the
  Bangla explanation. If it is off or fails, the template explanations are used.
- A safety filter blocks any medicine or dose advice.

## Parts of the project

| Folder | What it is | Tech |
| --- | --- | --- |
| `medilens/`, `api/` | AI service: OCR, extractor, range engine, Bangla explanations | Python, FastAPI, OpenCV, Tesseract |
| `backend/` | Accounts, family profiles, reports, trends, reminders, doctor PDF, share links | NestJS, PostgreSQL, TypeORM, JWT |
| `frontend/` | The website (Bangla and English, works on phones) | Next.js, Tailwind |
| `dataset/`, `training/` | Synthetic report generator, accuracy evaluation, fine-tuning data | Python |
| `tests/` | Automated tests for the AI service | pytest |

More detail: [AI service](docs/AI-SERVICE.md), [backend](backend/README.md), [frontend](frontend/README.md).

## Features

- Photo or PDF upload (drag and drop, or camera on a phone), then the user checks the values the AI read
- Bangla explanation for every value, with the calculation shown
- Specialist and urgency suggestion; cross-checks warn when related values do not fit together
- Family profiles, history, side-by-side report comparison, trend charts
- Reminders, doctor summary PDF, read-only share link for a doctor (expires in 7 days)
- Sign in with email or Google, profile page, installable on a phone

## Run it locally

You need Python 3.11+, Node 18+, PostgreSQL and Tesseract OCR.

```bash
# 1. AI service  (http://localhost:8000/docs)
python -m venv venv && venv\Scripts\activate        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --port 8000

# 2. Backend  (http://localhost:4000)
cd backend && cp .env.example .env                  # then edit the values
npm install && npm run start:dev

# 3. Website  (http://localhost:3000)
cd frontend && cp .env.example .env.local
npm install && npm run dev
```

Settings go in `.env` files. They are never committed; only the `.env.example` files are.
For "Sign in with Google", put your own `GOOGLE_CLIENT_ID` in `backend/.env`.

## Privacy

Reports are stored only on the server you run. Do not commit real patients' reports to this repository
(`dataset/real/` and `backend/uploads/` are ignored on purpose).
