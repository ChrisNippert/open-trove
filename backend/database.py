from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL


engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrate: add thumbnail column to groups if missing
        result = await conn.execute(
            __import__('sqlalchemy').text("PRAGMA table_info(groups)")
        )
        columns = [row[1] for row in result.fetchall()]
        if "thumbnail" not in columns:
            await conn.execute(
                __import__('sqlalchemy').text(
                    "ALTER TABLE groups ADD COLUMN thumbnail VARCHAR(512)"
                )
            )
