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

        # Migrate: add uuid column to items if missing
        result2 = await conn.execute(
            __import__('sqlalchemy').text("PRAGMA table_info(items)")
        )
        item_columns = [row[1] for row in result2.fetchall()]
        if "uuid" not in item_columns:
            await conn.execute(
                __import__('sqlalchemy').text(
                    "ALTER TABLE items ADD COLUMN uuid VARCHAR(36)"
                )
            )
            import uuid as _uuid
            items_rows = await conn.execute(
                __import__('sqlalchemy').text("SELECT id FROM items WHERE uuid IS NULL")
            )
            for row in items_rows.fetchall():
                await conn.execute(
                    __import__('sqlalchemy').text(
                        "UPDATE items SET uuid = :uuid WHERE id = :id"
                    ),
                    {"uuid": str(_uuid.uuid4()), "id": row[0]}
                )
            await conn.execute(
                __import__('sqlalchemy').text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid)"
                )
            )

        # Migrate: convert link fields in item data from {id, name} to {uuid, name}
        import json as _json
        all_items = await conn.execute(
            __import__('sqlalchemy').text("SELECT id, data FROM items WHERE data IS NOT NULL")
        )
        all_items_rows = all_items.fetchall()
        # Build id->uuid map
        uuid_map_rows = await conn.execute(
            __import__('sqlalchemy').text("SELECT id, uuid FROM items WHERE uuid IS NOT NULL")
        )
        id_to_uuid = {row[0]: row[1] for row in uuid_map_rows.fetchall()}
        # Get all link field names from schemas
        schema_rows = await conn.execute(
            __import__('sqlalchemy').text("SELECT definition FROM item_schemas")
        )
        link_fields: set[str] = set()
        for (defn_str,) in schema_rows.fetchall():
            try:
                defn = _json.loads(defn_str) if defn_str else {}
                for _sec, fields in defn.get("sections", {}).items():
                    for fname, fdef in fields.items():
                        if fdef.get("type") == "link":
                            link_fields.add(fname)
            except (ValueError, TypeError):
                pass
        if link_fields:
            for item_id, data_str in all_items_rows:
                try:
                    data = _json.loads(data_str) if data_str else {}
                except (ValueError, TypeError):
                    continue
                changed = False
                for fname in link_fields:
                    val = data.get(fname)
                    if isinstance(val, dict) and "id" in val and "uuid" not in val:
                        target_uuid = id_to_uuid.get(val["id"])
                        if target_uuid:
                            val["uuid"] = target_uuid
                            del val["id"]
                            changed = True
                    elif isinstance(val, list):
                        for entry in val:
                            if isinstance(entry, dict) and "id" in entry and "uuid" not in entry:
                                target_uuid = id_to_uuid.get(entry["id"])
                                if target_uuid:
                                    entry["uuid"] = target_uuid
                                    del entry["id"]
                                    changed = True
                if changed:
                    await conn.execute(
                        __import__('sqlalchemy').text(
                            "UPDATE items SET data = :data WHERE id = :id"
                        ),
                        {"data": _json.dumps(data), "id": item_id}
                    )
