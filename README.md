# Oracle Fusion Cloud & OIC Job Failure Monitoring

Serverless monitoring web application for tracking Oracle Fusion Cloud scheduled process failures, Oracle Integration Cloud (OIC) instance errors, downstream system impact, and incident retries.

## Architecture

- **Frontend**: Angular 20 SPA (Amazon S3 + CloudFront)
- **API Layer**: Amazon API Gateway (REST)
- **Compute**: Node.js 20 AWS Lambda handlers
- **Database**: MySQL 8.0 / Amazon RDS for MySQL

## Repository Layout

- `backend/` — Node.js Lambda handlers, services, MySQL repositories, and local Express runner
- `database/` — MySQL schema (`schema.sql`), seed script (`seed.sql`), and Docker Compose setup
- `frontend/` — Angular 20 application (`src/app/pages/*`)
- `infrastructure/` — AWS SAM template (`template.yaml`) and OpenAPI 3.0 spec (`openapi.yaml`)
- `docs/` — Architecture diagrams, AWS console deployment guide, and Postman collections

## Local Setup

### 1. Start MySQL 8.0 (Docker)

```powershell
cd database
docker compose up -d
```

Wait ~15 seconds for `schema.sql` and `seed.sql` to initialize `oracle_monitoring`.

If you are using a local MySQL or Amazon RDS instance without Docker, initialize the schema and seed data using the standalone `database/` script (edit `DB_CONFIG` in `database/init-db.js` or set `DB_HOST`/`DB_USER`/`DB_PASSWORD`):

```powershell
cd database
npm install
npm run init
```

### 2. Build Frontend & Start Backend

```powershell
cd frontend
npm install
npm run build:local

cd ..\backend
npm install
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="monitor_app"
$env:DB_PASSWORD="monitor_password"
$env:DB_NAME="oracle_monitoring"
npm start
```

Open `http://localhost:3000`.

### 3. Run Backend & Frontend Tests

```powershell
cd backend
npm test

cd ..\frontend
npm test -- --watch=false --browsers=ChromeHeadless
```

## AWS Deployment

See [docs/aws-manual-deployment.md](docs/aws-manual-deployment.md) for step-by-step AWS Console instructions, or deploy with SAM:

```powershell
sam build -t infrastructure/template.yaml
sam deploy --guided
```
