"""FastAPI application: `uv run uvicorn app.main:app --reload --port 8080`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audits import router
from app.browser.url_guard import Resolver, system_resolver
from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.replay.player import RecordingLibrary
from app.runner.runner import AuditRunner
from app.stores.events import MemoryEventLog


def create_app(settings: Settings | None = None, resolver: Resolver = system_resolver) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await app.state.runner.shutdown()

    app = FastAPI(
        title="Shop Honest API",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.resolver = resolver
    app.state.events = MemoryEventLog()
    app.state.library = RecordingLibrary.load(settings.recordings_dir)
    app.state.runner = AuditRunner(app.state.events, settings)

    install_error_handlers(app)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["*"]
        )
    app.include_router(router)
    return app


app = create_app()
