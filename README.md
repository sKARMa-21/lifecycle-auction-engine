# Lifecycle & Auction Engine

A campus-focused lifecycle and auction platform. Its primary use case is
managing abandoned bicycles---from reporting and owner notification to
claims and auction---while also allowing users to list other products
for auction. Features include real-time bidding, anti-sniping
extensions, and safeguards against concurrent bid conflicts.

## Tech Stack

-   **Frontend:** React, TypeScript, Vite
-   **Backend:** FastAPI, Python
-   **Database:** PostgreSQL, SQLAlchemy, Alembic
-   **Real-time services:** Redis and WebSockets (as implemented)

## Prerequisites

Install [Git](https://git-scm.com/), [Node.js](https://nodejs.org/),
[Python 3](https://www.python.org/), and [Docker
Desktop](https://www.docker.com/products/docker-desktop/).

## 1. Clone the repository

``` bash
git clone https://github.com/sKARMa-21/lifecycle-auction-engine.git
cd lifecycle-auction-engine
```

## 2. Configure environment variables

Create your local environment file from the example:

``` bash
cp .env.example .env
```

Edit `.env` and set a local database password. Keep `.env` private;
never commit it.

Example:

``` dotenv
POSTGRES_PASSWORD=choose_a_local_password
DATABASE_URL=postgresql+psycopg://auction_user:choose_a_local_password@localhost:5433/lifecycle_auction
```

The password in `DATABASE_URL` must match `POSTGRES_PASSWORD`. The
example above assumes Docker Compose maps host port `5433` to
PostgreSQL's container port `5432`. If your `docker-compose.yml` uses a
different host port, update the URL to match.

## 3. Start PostgreSQL

From the project root:

``` bash
docker compose up -d postgres
docker compose ps
```

Wait until the PostgreSQL container is healthy before starting the
backend.

## 4. Set up and run the backend

Open a terminal:

``` bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If the repository contains database migrations, apply them:

``` bash
alembic upgrade head
```

Start the API:

``` bash
uvicorn app.main:app --reload
```

API documentation: <http://127.0.0.1:8000/docs>\
Health check: <http://127.0.0.1:8000/health/live>

Keep this terminal running.

## 5. Set up and run the frontend

Open a second terminal:

``` bash
cd frontend
npm ci
npm run dev
```

Open the frontend URL shown in the terminal, usually
<http://localhost:5173>.

## Run the project later

After the initial setup, start Docker and run the backend and frontend
in separate terminals:

``` bash
# Project root
docker compose up -d postgres
```

``` bash
# Backend terminal
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

``` bash
# Frontend terminal
cd frontend
npm run dev
```

## Project structure

``` text
lifecycle-auction-engine/
├── frontend/       # React + TypeScript application
├── backend/        # FastAPI application and database migrations
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Notes for contributors

-   Create a feature branch before working; keep `main` stable.
-   Commit database migration files when changing the schema.
-   Never commit `.env`, `.venv/`, `node_modules/`, or secrets.
-   If setup fails, check that Docker is running, the database is
    healthy, and the host port in `DATABASE_URL` matches
    `docker-compose.yml`.
