# JobPilot Project Guide

## Product and Stack

JobPilot is an AI-powered job application tracker built as a portfolio project.

- Backend: Node.js 20+, Express 5, ES modules, MySQL 8 through `mysql2/promise`, raw parameterized SQL, Zod, JWT, and `bcryptjs`.
- Frontend: latest Angular with standalone components and signals, Angular CDK drag-and-drop, and Tailwind CSS. The frontend belongs in `jobpilot-web/`.
- Database: `jobpilot-api/db/schema.sql`; current tables are `users`, `resumes`, `job_applications`, and `match_analyses`.
- Do not change the selected stack or introduce an ORM.

## Backend Structure and Conventions

Keep the existing feature organization in `jobpilot-api/src/`:

- `routes/`: define endpoints and compose middleware.
- `validators/`: Zod request schemas.
- `middleware/`: authentication, request validation, and shared error handling.
- `controllers/`: HTTP handlers and feature logic.
- `config/db.js`: shared MySQL connection pool.
- `services/`: external integrations and reusable domain services, including the future LLM provider adapter.

For protected API features, follow this flow: routes -> validation/auth middleware -> controllers -> parameterized SQL queries. Mount routers in `src/app.js` before the central `notFound` and `errorHandler` middleware. Express 5 forwards rejected async controller promises to the error handler.

Use ES module imports with explicit `.js` extensions. Use `pool.execute(sql, values)` for values supplied by a request; never interpolate request data into SQL. SQL identifiers such as sort columns must come from a fixed allowlist because placeholders cannot parameterize identifiers.

Every query that reads or mutates user-owned records must scope the operation to the authenticated `req.user.id`. For child records, scope through their owning application/resume as needed; do not rely only on an untrusted record ID. Keep validation at the route boundary and preserve the established JSON error response style.

Never commit secrets. Add new environment variables to `jobpilot-api/.env.example`, keep real values in `.env`, and validate required configuration at startup or service use. Do not store uploaded PDF files unless a feature specifically requires it; the planned resume flow stores extracted text and metadata in MySQL.

Use short comments only for non-obvious behavior. Keep changes focused and consistent with the current files. After each phase, report the files changed and give exact Postman requests and setup steps to verify that phase.

## Phase Plan

1. **Foundation and authentication**: retain the existing register, login, and `/me` implementation; add the required Jest/supertest coverage for auth as part of the testing phase.
2. **Applications API**: implement authenticated, user-scoped CRUD; pagination; status, company, date-range and search filters; allowlisted sorting; and the status-only PATCH used by the Kanban board. Add request schemas and focused applications tests.
3. **Resume management**: add authenticated PDF upload (PDF only, maximum 5 MB), text extraction with `pdf-parse`, resume persistence, list/delete operations as appropriate, and setting one user's default resume.
4. **AI match analysis**: add a single `src/services/llm.service.js` provider boundary selected through environment configuration; send resume text and job description; validate strict `{ score, matchedSkills, missingSkills, suggestions }` output with Zod; persist results in `match_analyses` with ownership checks.
5. **Follow-up reminders**: use `node-cron` to find due applications and send reminder email with Nodemailer. Scope due records to their owning users and keep email settings in environment variables.
6. **API documentation and verification**: expose Swagger UI at `/api/docs` with `swagger-jsdoc` and `swagger-ui-express`; complete Jest/supertest coverage for auth and applications and document setup/test commands.
7. **Angular frontend**: build `jobpilot-web/` with standalone Angular components, signals, CDK drag-and-drop for the status board, and Tailwind CSS; connect it to the API without changing the backend contracts.

Complete and verify one phase before beginning the next. Do not implement a later phase without explicit approval to move on.

## Phase 2 Verification Outline

Run the API from `jobpilot-api/` after configuring `.env` and applying `db/schema.sql`:

```bash
cd jobpilot-api
npm install
npm run dev
```

In Postman, use `http://localhost:5000/api` as the base URL. Register or log in with `POST /auth/register` or `POST /auth/login`, then set `Authorization: Bearer <token>` on every applications request.

- `POST /applications` with JSON containing at least `companyName` and `jobTitle` creates a Wishlist application.
- `GET /applications?page=1&limit=10&status=Wishlist&company=Acme&search=engineer&sortBy=createdAt&sortOrder=desc` checks pagination, filters, search, and sorting.
- `GET /applications/:id` retrieves one owned application.
- `PUT /applications/:id` updates an owned application.
- `PATCH /applications/:id/status` with `{"status":"Applied"}` checks the Kanban status transition endpoint.
- `DELETE /applications/:id` deletes an owned application.
- Repeat a read/update/delete using a second user's token and the first user's ID; it must not expose or modify the first user's record.

Use response status and JSON body assertions in Postman for success, invalid input, unauthenticated access, and cross-user access. Confirm the final route names and request fields against the implemented Phase 2 contract when that phase is approved.