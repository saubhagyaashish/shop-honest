"""FastAPI application: `uv run uvicorn app.main:app --reload --port 8080`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audits import router
from app.api.limits import FirestoreLimits, LiveLimits, MemoryLimits
from app.browser.url_guard import Resolver, system_resolver
from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.models import ModelSet
from app.replay.player import RecordingLibrary
from app.runner.runner import AuditRunner
from app.stores.events import EventLog, MemoryEventLog
from app.stores.frames import FrameStore, GcsFrameStore, LocalFrameStore


def create_app(settings: Settings | None = None, resolver: Resolver = system_resolver, models: ModelSet | None = None) -> FastAPI:
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
    app.state.events, app.state.frames, app.state.limits = _stores(settings)
    app.state.library = RecordingLibrary.load(settings.recordings_dir)
    app.state.runner = AuditRunner(app.state.events, settings, frames=app.state.frames, resolver=resolver, models=models)

    install_error_handlers(app)
    if settings.cors_origins or settings.cors_origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_origin_regex,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )
    app.include_router(router)
    return app


def _stores(settings: Settings) -> tuple[EventLog, FrameStore, LiveLimits]:
    """In-process stores for development and tests; Firestore and Cloud Storage when deployed."""
    if settings.store_backend == "gcp":
        from google.cloud import firestore

        from app.stores.firestore_events import FirestoreEventLog

        client = firestore.AsyncClient(project=settings.google_cloud_project)
        return (
            FirestoreEventLog(client, prefix=settings.store_prefix),
            GcsFrameStore(settings.frames_bucket, project=settings.google_cloud_project, prefix=settings.store_prefix),
            FirestoreLimits(client, settings),
        )
    return MemoryEventLog(), LocalFrameStore(settings.frames_dir), MemoryLimits(settings)


app = create_app()
