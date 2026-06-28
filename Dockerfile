# ── Stage 1: build frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ── Stage 2: production image ───────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Local timezone so date.today() (used for service-life / verification
# deadlines) reflects the users' day, not UTC. Override TZ in deployment if
# you are in another zone. DB timestamps stay UTC (explicit in the models).
ENV TZ=Europe/Moscow
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend build from stage 1
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Regulatory-act PDFs (Нормативные акты) live in docs/ at the repo root and are
# served at runtime. Must be inside the image, at /app/docs (one level above
# backend/), matching DOCS_DIR in routers/documents.py.
COPY docs/ ./docs/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
