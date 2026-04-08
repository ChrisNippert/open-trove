"""Import/export items as JSON or CSV."""

import csv
import io
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import Item, ItemTag, ItemSchema, Group


async def export_json(db: AsyncSession, group_id: int | None = None, include_schemas: bool = False) -> list[dict] | dict:
    """Export items as a list of dicts, optionally with schemas."""
    q = select(Item).options(selectinload(Item.tags), selectinload(Item.images))
    if group_id is not None:
        q = q.where(Item.group_id == group_id)
    q = q.order_by(Item.created_at)

    result = await db.execute(q)
    items = result.scalars().all()

    exported = []
    for item in items:
        data = json.loads(item.data) if item.data else {}
        exported.append({
            "id": item.id,
            "group_id": item.group_id,
            "schema_id": item.schema_id,
            "name": item.name or "",
            "data": data,
            "tags": [t.tag for t in (item.tags or [])],
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        })

    if include_schemas and group_id is not None:
        schema_q = select(ItemSchema).where(ItemSchema.group_id == group_id)
        schema_result = await db.execute(schema_q)
        schemas = schema_result.scalars().all()
        exported_schemas = []
        for s in schemas:
            exported_schemas.append({
                "id": s.id,
                "name": s.name,
                "definition": json.loads(s.definition) if s.definition else {},
            })
        return {"schemas": exported_schemas, "items": exported}

    return exported


async def export_csv(db: AsyncSession, group_id: int, schema_id: int) -> str:
    """Export items as CSV. Requires a specific schema so columns are consistent."""
    schema = await db.get(ItemSchema, schema_id)
    if not schema:
        return ""

    schema_def = json.loads(schema.definition) if schema.definition else {}
    sections = schema_def.get("sections", {})

    # Collect all field names in order
    field_names = []
    for section_fields in sections.values():
        for field_name in section_fields:
            field_names.append(field_name)

    # Query items
    result = await db.execute(
        select(Item).options(selectinload(Item.tags))
        .where(Item.group_id == group_id, Item.schema_id == schema_id)
        .order_by(Item.created_at)
    )
    items = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["id", "name", "tags"] + field_names)

    for item in items:
        data = json.loads(item.data) if item.data else {}
        tags = ",".join(t.tag for t in (item.tags or []))
        row = [item.id, item.name or "", tags]
        for field in field_names:
            val = data.get(field, "")
            if isinstance(val, (dict, list)):
                val = json.dumps(val)
            row.append(val)
        writer.writerow(row)

    return output.getvalue()


async def import_json(
    db: AsyncSession,
    group_id: int,
    schema_id: int,
    items_data: list[dict],
) -> tuple[int, list[str]]:
    """Import items from JSON. Returns (count_imported, errors)."""
    group = await db.get(Group, group_id)
    if not group:
        return 0, ["Group not found"]

    schema = await db.get(ItemSchema, schema_id)
    if not schema or schema.group_id != group_id:
        return 0, ["Schema not found in this group"]

    imported = 0
    errors = []

    # Parse schema definition to find image fields
    schema_def = json.loads(schema.definition) if schema.definition else {}
    image_fields = set()
    for section_fields in schema_def.get("sections", {}).values():
        for field_name, field_def in section_fields.items():
            if isinstance(field_def, dict) and field_def.get("type") == "image":
                image_fields.add(field_name)

    for i, item_data in enumerate(items_data):
        try:
            data = item_data.get("data", item_data)
            tags = item_data.get("tags", [])

            # If the top-level IS the data (flat import), wrap it
            if "data" not in item_data:
                data = item_data
                tags = []
                if "_tags" in data:
                    tags = data.pop("_tags", [])

            # Null out image fields since image files aren't imported
            if image_fields:
                if isinstance(data, dict):
                    for img_field in image_fields:
                        data.pop(img_field, None)

            item = Item(
                group_id=group_id,
                schema_id=schema_id,
                name=item_data.get("name", ""),
                data=json.dumps(data),
            )
            db.add(item)
            await db.flush()

            if isinstance(tags, list):
                for tag in tags:
                    tag = str(tag).strip()
                    if tag:
                        db.add(ItemTag(item_id=item.id, tag=tag))

            imported += 1
        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    await db.commit()
    return imported, errors


async def import_csv(
    db: AsyncSession,
    group_id: int,
    schema_id: int,
    csv_content: str,
) -> tuple[int, list[str]]:
    """Import items from CSV string. Returns (count_imported, errors)."""
    schema = await db.get(ItemSchema, schema_id)
    if not schema:
        return 0, ["Schema not found"]

    reader = csv.DictReader(io.StringIO(csv_content))
    items_data = []
    for row in reader:
        tags = []
        data = {}
        for key, val in row.items():
            if key == "id":
                continue
            if key == "tags":
                tags = [t.strip() for t in val.split(",") if t.strip()]
                continue
            # Try parsing JSON values (for compound types)
            try:
                data[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                data[key] = val
        items_data.append({"data": data, "tags": tags})

    return await import_json(db, group_id, schema_id, items_data)
