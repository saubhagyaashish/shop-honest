# Shop Honest API: FastAPI + Playwright Chromium + the ADK agents, for Cloud Run.
# Built from the repo root because it needs shared/ as well: see deploy/backend.sh.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble

COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH

# Same layout as the repo (backend/ next to shared/), so the app's paths don't change.
WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY shared/ /srv/shared/
COPY backend/app/ ./app/

# The image's non-root user; Chromium comes from the image (/ms-playwright), matching Playwright 1.63.
USER pwuser
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips '*' --timeout-graceful-shutdown 10"]
