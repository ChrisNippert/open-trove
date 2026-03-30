from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, async_session
from .services.search import ensure_fts_table, rebuild_fts_index
from .routers import groups, schemas, items, images, search, export, views, units


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await ensure_fts_table(db)
        await rebuild_fts_index(db)
    yield


app = FastAPI(title="Organizer", version="0.1.0", lifespan=lifespan)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(groups.router)
app.include_router(schemas.router)
app.include_router(items.router)
app.include_router(images.router)
app.include_router(search.router)
app.include_router(export.router)
app.include_router(views.router)
app.include_router(units.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
