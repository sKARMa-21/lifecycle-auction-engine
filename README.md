# Lifecycle & Auction Engine

The Lifecycle & Auction Engine is designed to manage the lifecycle of campus assets—primarily abandoned or found bicycles—and transition unclaimed items into an online auction platform.

Key workflows envisioned for the platform:

-   **Reporting & Lifecycle Tracking:** A bicycle is found/reported on campus, tagged with an asset tag, logged with location/details, and its lifecycle events are tracked.
-   **Owner Verification & Claims:** Students/owners can submit ownership claims with evidence, which campus administrators can review and approve/reject.
-   **Auction & Bidding Engine:** Unclaimed bicycles move to an auction phase with real-time bidding, anti-sniping protection (auto-extending deadlines on last-minute bids), and safeguards against concurrent bid conflicts.
-   **Notifications:** Alerting users about bicycle status changes, claim outcomes, outbid alerts, etc.

## Tech Stack

-   **Frontend:** React, TypeScript, Vite
-   **Backend:** FastAPI, Python
-   **Database:** PostgreSQL, SQLAlchemy, Alembic
-   **Real-time services:** Redis and WebSockets (as implemented)

## Prerequisites

Install 
(i)   [Node.js](https://nodejs.org/)
(ii)  [Python 3](https://www.python.org/)
(iii) [Docker Desktop](https://www.docker.com/products/docker-desktop/).

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
DATABASE_URL=postgresql+psycopg://auction_user:choose_a_local_password@127.0.0.1:5433/lifecycle_auction
```

The password in `DATABASE_URL` must match `POSTGRES_PASSWORD`. The
example above assumes Docker Compose maps host port `5433` to
PostgreSQL's container port `5432`. Use `127.0.0.1` instead of `localhost`
to prevent IPv6 connection timeouts on Windows.


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
python -m venv .venv

# Activate venv:
# Windows PowerShell:
.\.venv\Scripts\activate
# Linux / macOS:
source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Apply database migrations:

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
npm install
npm run dev
```

Open the frontend URL shown in the terminal, usually
<http://localhost:5173>.

## Run the project later

After the initial setup, start Docker and run the backend and frontend
in separate terminals:

``` bash
# Project root: start DB
docker compose up -d postgres
```

``` bash
# Backend terminal:
cd backend
# Windows: .\.venv\Scripts\activate | Linux/macOS: source .venv/bin/activate
uvicorn app.main:app --reload
```

``` bash
# Frontend terminal:
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
