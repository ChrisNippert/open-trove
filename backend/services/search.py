"""Full-text search using SQLite FTS5 + JSON field filtering."""

import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def ensure_fts_table(db: AsyncSession):
    """Create FTS5 virtual table if it doesn't exist."""
    await db.execute(text("""
        CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
            item_id UNINDEXED,
            content,
            tags,
            tokenize='porter unicode61'
        )
    """))
    # Drop old triggers and recreate to include tags
    for trigger_name in [
        'items_fts_insert', 'items_fts_update', 'items_fts_delete',
        'items_fts_tag_insert', 'items_fts_tag_delete',
    ]:
        await db.execute(text(f"DROP TRIGGER IF EXISTS {trigger_name}"))

    # Triggers to keep FTS in sync (include tags from item_tags table)
    await db.execute(text("""
        CREATE TRIGGER IF NOT EXISTS items_fts_insert AFTER INSERT ON items
        BEGIN
            INSERT INTO items_fts(item_id, content, tags)
            VALUES (
                NEW.id,
                NEW.name || ' ' || NEW.data,
                COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
            );
        END
    """))
    await db.execute(text("""
        CREATE TRIGGER IF NOT EXISTS items_fts_update AFTER UPDATE ON items
        BEGIN
            DELETE FROM items_fts WHERE item_id = OLD.id;
            INSERT INTO items_fts(item_id, content, tags)
            VALUES (
                NEW.id,
                NEW.name || ' ' || NEW.data,
                COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
            );
        END
    """))
    await db.execute(text("""
        CREATE TRIGGER IF NOT EXISTS items_fts_delete AFTER DELETE ON items
        BEGIN
            DELETE FROM items_fts WHERE item_id = OLD.id;
        END
    """))
    # Also keep FTS in sync when tags change
    await db.execute(text("""
        CREATE TRIGGER IF NOT EXISTS items_fts_tag_insert AFTER INSERT ON item_tags
        BEGIN
            UPDATE items_fts SET tags = COALESCE(
                (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.item_id), ''
            ) WHERE item_id = NEW.item_id;
        END
    """))
    await db.execute(text("""
        CREATE TRIGGER IF NOT EXISTS items_fts_tag_delete AFTER DELETE ON item_tags
        BEGIN
            UPDATE items_fts SET tags = COALESCE(
                (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = OLD.item_id), ''
            ) WHERE item_id = OLD.item_id;
        END
    """))
    await db.commit()


async def rebuild_fts_index(db: AsyncSession):
    """Rebuild the full FTS index from scratch."""
    await db.execute(text("DELETE FROM items_fts"))
    await db.execute(text("""
        INSERT INTO items_fts(item_id, content, tags)
        SELECT i.id, i.name || ' ' || i.data, COALESCE(
            (SELECT GROUP_CONCAT(t.tag, ' ') FROM item_tags t WHERE t.item_id = i.id),
            ''
        )
        FROM items i
    """))
    await db.commit()


async def search_items(
    db: AsyncSession,
    query: str,
    group_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[int]:
    """Search items by text query, returns list of item IDs."""
    if not query.strip():
        return []

    # Escape FTS5 special characters and build query
    safe_query = query.replace('"', '""')
    fts_query = f'"{safe_query}"'

    sql = """
        SELECT f.item_id
        FROM items_fts f
        JOIN items i ON i.id = f.item_id
        WHERE items_fts MATCH :query
    """
    params = {"query": fts_query, "limit": limit, "offset": offset}

    if group_id is not None:
        sql += " AND i.group_id = :group_id"
        params["group_id"] = group_id

    sql += " ORDER BY rank LIMIT :limit OFFSET :offset"

    result = await db.execute(text(sql), params)
    return [row[0] for row in result.fetchall()]


async def filter_items_by_field(
    db: AsyncSession,
    group_id: int,
    field_path: str,
    op: str,
    value,
    limit: int = 50,
    offset: int = 0,
) -> list[int]:
    """Filter items by a JSON field value. Returns item IDs.

    Handles both scalar fields and JSON array fields (e.g. multiselect).
    For array fields, checks if `value` is contained within the array.
    """
    valid_ops = {"=", "!=", ">", "<", ">=", "<=", "LIKE"}
    if op.upper() not in valid_ops:
        return []

    # First try regular scalar match
    sql = f"""
        SELECT id FROM items
        WHERE group_id = :group_id
        AND (
            json_extract(data, :path) {op} :value
            OR (
                json_type(data, :path) = 'array'
                AND EXISTS (
                    SELECT 1 FROM json_each(json_extract(data, :path))
                    WHERE value {op} :value
                )
            )
        )
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """
    result = await db.execute(text(sql), {
        "group_id": group_id,
        "path": f"$.{field_path}",
        "value": value,
        "limit": limit,
        "offset": offset,
    })
    return [row[0] for row in result.fetchall()]
