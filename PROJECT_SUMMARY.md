# AI Data Analyst Dashboard

## Submission Summary

AI Data Analyst Dashboard is a web-based analytics system that allows users to upload CSV files, ask questions in natural language, and receive instant chart-based insights and textual summaries. The platform is designed for non-technical users who need to analyze business data without writing formulas, SQL, or code.

The application combines a modern React frontend, Tailwind CSS styling, Recharts visualizations, a Node.js and Express orchestration backend, OpenAI-powered query planning, and a Python Pandas microservice that performs schema inference and data aggregation. Optional MongoDB persistence allows sessions and analysis history to be restored across runs.

## Core Flow

1. User uploads a CSV file.
2. Express forwards the file contents to the Python Pandas microservice.
3. Pandas profiles the dataset and identifies numeric, categorical, and date columns.
4. The user asks a question in plain English.
5. OpenAI converts the question into a structured analysis plan.
6. The backend sends that plan to the Pandas service for execution.
7. The UI displays the resulting chart, summary, insights, plan snapshot, and tabular output.

## Key Features

- CSV upload and schema profiling
- Natural-language analytics prompts
- AI-generated structured analysis plans
- Bar, line, and pie chart output
- Text insight summaries
- Chat-style analyst interface
- Recent-session restore when MongoDB is enabled
- Deployment-ready separation for frontend, API, and Python service

## Tech Stack Used

- Frontend: React, Tailwind CSS, Recharts
- Backend: Node.js, Express.js
- AI Layer: OpenAI API
- Data Processing: Python Flask + Pandas microservice
- Database: MongoDB with Mongoose
- Deployment Target: Vercel for frontend, Render for API and Python service

## Industry Relevance

This project is highly relevant because it sits at the intersection of AI, analytics, and full-stack product engineering. It mirrors real-world tools that help business teams explore data faster and reflects how modern analytics platforms combine conversational interfaces with visualization and backend data pipelines.

## Resume Version

Built an AI-powered data analyst dashboard using React, Tailwind CSS, Recharts, Node.js, Express, OpenAI, and a Python Pandas microservice. Implemented natural-language query understanding for CSV datasets, generated chart-based insights and summaries, and added MongoDB-ready session persistence with deployment support for Vercel and Render.

## Interview Version

I built a full-stack AI analytics dashboard where users upload CSV data and ask questions like "Show monthly sales trend" or "Top 5 products by revenue." The backend sends the question and dataset schema to OpenAI to generate a structured analysis plan, then a Python Pandas microservice executes the plan and returns chart-ready data plus text insights. On the frontend, I built a chat-style analytics workspace with React, Tailwind, and Recharts to make the experience usable for non-technical users.
