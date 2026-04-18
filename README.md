# AI Powered Data Analyst Dashboard

An internship-ready full-stack dashboard that lets users upload CSV files, ask business questions in natural language, and get instant chart-based insights using React, Tailwind CSS, Recharts, Node.js, Express, OpenAI or Gemini, Pandas, and MongoDB-ready persistence.

## Tech Stack

- Frontend: React + Tailwind CSS + Recharts
- Backend: Node.js + Express
- AI Layer: OpenAI API or Gemini API
- Data Processing: Python Pandas microservice
- Database: MongoDB with Mongoose
- Deployment: Vercel for frontend, Render for Node API and Python service

## Features

- Upload CSV datasets through a web dashboard
- Infer numeric, categorical, and date columns automatically
- Send plain-English questions to OpenAI for query interpretation
- Execute the returned analysis plan on uploaded CSV data
- Generate chart-ready output with summaries and preview tables
- Export result tables as CSV, Excel-compatible `.xls`, and JSON
- Run the client and server together from the project root

## Run Locally

```bash
npm run setup
npm run setup:python
npm run dev
```

This starts:

- Frontend on `http://localhost:5173`
- Backend on `http://localhost:5050`
- Python Pandas service on `http://localhost:8000`

Quick verification:

```bash
npm run verify
npm run lint --prefix client
npm run smoke:test
```

## Environment Setup

Minimum required (pick one provider):

```powershell
$env:OPENAI_API_KEY="your_key_here"
```

or

```powershell
$env:GEMINI_API_KEY="your_key_here"
$env:AI_PROVIDER="gemini"
```

Recommended:

```powershell
$env:OPENAI_MODEL="gpt-4.1-mini"
$env:GEMINI_API_KEY="your_key_here"
$env:GEMINI_MODEL="gemini-2.5-flash"
$env:AI_PROVIDER="gemini"
$env:MONGODB_URI="mongodb://127.0.0.1:27017/ai_data_analyst_dashboard"
$env:PYTHON_SERVICE_URL="http://127.0.0.1:8000"
$env:FRONTEND_ORIGIN="http://localhost:5173"
$env:VITE_API_BASE_URL="http://localhost:5050"
```

## Python Service Setup

Install the Python dependencies once:

```bash
pip install -r python-service/requirements.txt
```

The Express backend sends uploaded CSV content to the Pandas service for profiling and executes OpenAI-generated analysis plans there.

## Project Structure

```text
client/   React dashboard UI
server/   Express API for CSV upload and analysis
python-service/   Flask + Pandas microservice for profiling and aggregation
```

## Deployment

1. Deploy the `python-service` folder to Render and copy its live URL.
2. Deploy the `server` folder to Render.
3. Set `PYTHON_SERVICE_URL` on the backend to the Python service URL.
4. Set `JWT_SECRET` and `FRONTEND_ORIGIN` on the backend.
5. Set `FRONTEND_VERIFY_URL` on the backend to your frontend URL (used for email verification links).
6. Choose your auth mode:
   - Demo deploy (fastest): set `EMAIL_VERIFICATION_DISABLED=true`
   - Production auth: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and optionally `SMTP_FROM`) and keep `EMAIL_VERIFICATION_DISABLED=false`
7. Set an AI provider key on the backend: `GEMINI_API_KEY` (recommended) or `OPENAI_API_KEY`.
8. Optionally set `MONGODB_URI` for saved boards and persistent session history.
5. Deploy the `client` folder to Vercel.
6. Set `VITE_API_BASE_URL` on the frontend to the live backend URL.
7. If you want shareable saved boards and restart-safe session restore, configure MongoDB through `MONGODB_URI`.

Deployment helpers:

- Render blueprint example: see `render.yaml`
- Frontend SPA rewrite config: see `client/vercel.json`
- Backend readiness endpoint: `GET /api/health`
- The health payload reports API reachability, MongoDB mode, OpenAI key presence, Python service status, upload size limit, and question limit
- The Python service is configured for Gunicorn-based production startup on Render
- `npm run smoke:test` performs a live local upload-plus-analysis verification against the stack

## Presentation Notes

- Submission-ready summary and resume wording are available in `PROJECT_SUMMARY.md`
- The UI now includes a workspace layout, recent sessions rail, system status pills, AI plan snapshot, and chat-style interaction flow
- Session restore works best when MongoDB is enabled

## Notes

- React handles the dashboard UX and Tailwind handles styling.
- Express orchestrates uploads, session flow, OpenAI planning, and MongoDB persistence.
- OpenAI converts natural-language questions into structured analysis instructions.
- Pandas executes the profiling and aggregation logic.
- MongoDB persistence is enabled whenever `MONGODB_URI` is configured.
- CSV ingestion is tolerant of common delimiter and formatting differences, and count-based questions now work even when a dataset has no obvious numeric metric column.
