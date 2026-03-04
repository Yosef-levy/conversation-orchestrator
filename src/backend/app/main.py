import traceback

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401 - register tables before init_db
from .api import router as api_router
from .db import init_db


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(title="Conversation Orchestrator API")

    @app.exception_handler(Exception)
    def unhandled_exception_handler(request, exc):
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "type": type(exc).__name__,
                "traceback": traceback.format_exc(),
            },
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()

