import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Item, ItemTag, ItemSchema
from ..schemas import ItemOut, ImageOut
from ..services.search import search_items, filter_items_by_field

router = APIRouter(prefix="/api/search", tags=["search"])


def _normalize_filter_value(value):
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered == "true":
            return 1
        if lowered == "false":
            return 0
    return value


def _item_to_out(item: Item) -> ItemOut:
    return ItemOut(
        id=item.id,
        uuid=item.uuid or "",
        group_id=item.group_id,
        schema_id=item.schema_id,
        name=item.name or "",
        data=json.loads(item.data) if item.data else {},
        tags=[t.tag for t in (item.tags or [])],
        images=[ImageOut.model_validate(img) for img in sorted(item.images or [], key=lambda i: i.sort_order)],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("", response_model=list[ItemOut])
async def search(
    q: str = "",
    group_id: int | None = None,
    field: str | None = None,
    op: str | None = None,
    value: str | None = None,
    tag: str | None = None,
    filters: str | None = None,
    offset: int = 0,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Search items by text, filter by field value, filter by tag.

    Text search: ?q=blue+flannel
    Field filter: ?group_id=1&field=category&op==&value=tops
    Tag filter: ?tag=quick
    Multi-filter: ?group_id=1&filters=[{"field":"cuisine","op":"=","value":"Italian"}]
    Combined: ?q=flannel&group_id=1&tag=winter
    """
    item_ids = None

    # Text search
    if q.strip():
        item_ids = set(await search_items(db, q, group_id=group_id, limit=500))

    # Tag filter (supports comma-separated for multi-tag OR)
    if tag and tag.strip():
        tag_values = [t.strip() for t in tag.split(',') if t.strip()]
        tag_result = await db.execute(
            select(ItemTag.item_id).where(ItemTag.tag.in_(tag_values))
        )
        tag_ids = set(row[0] for row in tag_result.fetchall())
        # If group_id was given, intersect with items in that group
        if group_id is not None:
            group_items = await db.execute(
                select(Item.id).where(Item.group_id == group_id)
            )
            group_item_ids = set(row[0] for row in group_items.fetchall())
            tag_ids = tag_ids & group_item_ids
        if item_ids is not None:
            item_ids = item_ids & tag_ids
        else:
            item_ids = tag_ids

    # Single field filter (legacy)
    if field and op and value is not None and group_id is not None:
        # Try to parse numeric value
        try:
            parsed_value = float(value)
        except ValueError:
            parsed_value = value

        filtered_ids = set(await filter_items_by_field(
            db, group_id, field, op, parsed_value, limit=500
        ))
        if item_ids is not None:
            item_ids = item_ids & filtered_ids
        else:
            item_ids = filtered_ids

    # Multi-field filters (JSON array)
    if filters and group_id is not None:
        try:
            filter_list = json.loads(filters)
        except (json.JSONDecodeError, TypeError):
            filter_list = []
        for f in filter_list:
            f_field = f.get("field")
            f_op = f.get("op", "=")
            f_value = f.get("value")
            if not f_field or f_value is None:
                continue

            # IN operator: OR within a single field (for multi-checkbox)
            if f_op.lower() == "in" and isinstance(f_value, list):
                combined_ids: set[int] = set()
                for val in f_value:
                    normalized = _normalize_filter_value(val)
                    ids = set(await filter_items_by_field(
                        db, group_id, f_field, "=", normalized, limit=500
                    ))
                    combined_ids.update(ids)
                if item_ids is not None:
                    item_ids = item_ids & combined_ids
                else:
                    item_ids = combined_ids
                continue

            try:
                parsed_val = float(f_value) if isinstance(f_value, str) else f_value
            except (ValueError, TypeError):
                parsed_val = f_value

            parsed_val = _normalize_filter_value(parsed_val)
            f_ids = set(await filter_items_by_field(
                db, group_id, f_field, f_op, parsed_val, limit=500
            ))
            if item_ids is not None:
                item_ids = item_ids & f_ids
            else:
                item_ids = f_ids

    if item_ids is not None:
        if not item_ids:
            return []
        query = (
            select(Item)
            .options(selectinload(Item.tags), selectinload(Item.images))
            .where(Item.id.in_(item_ids))
            .order_by(Item.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    else:
        # No search criteria — return recent items
        query = (
            select(Item)
            .options(selectinload(Item.tags), selectinload(Item.images))
            .order_by(Item.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if group_id is not None:
            query = query.where(Item.group_id == group_id)

    result = await db.execute(query)
    items = result.scalars().all()
    return [_item_to_out(item) for item in items]


FACET_TYPES = {"dropdown", "multiselect", "boolean", "int", "float", "unit", "hierarchy", "string", "range"}


@router.get("/facets")
async def get_facets(
    group_id: int,
    schema_id: int | None = None,
    filters: str | None = None,
    tag: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return filterable facets with counts and ranges for a group."""
    # Compute base item IDs from active filters for dynamic counts
    base_ids: set[int] | None = None

    if tag and tag.strip():
        tag_values = [t.strip() for t in tag.split(',') if t.strip()]
        tag_result_f = await db.execute(
            select(ItemTag.item_id).where(ItemTag.tag.in_(tag_values))
        )
        tag_ids = set(row[0] for row in tag_result_f.fetchall())
        group_items = await db.execute(select(Item.id).where(Item.group_id == group_id))
        group_item_ids = set(row[0] for row in group_items.fetchall())
        base_ids = tag_ids & group_item_ids

    if filters:
        try:
            filter_list = json.loads(filters)
        except (json.JSONDecodeError, TypeError):
            filter_list = []
        for f in filter_list:
            f_field = f.get("field")
            f_op = f.get("op", "=")
            f_value = f.get("value")
            if not f_field or f_value is None:
                continue
            if f_op.lower() == "in" and isinstance(f_value, list):
                combined: set[int] = set()
                for val in f_value:
                    normalized = _normalize_filter_value(val)
                    ids = set(await filter_items_by_field(
                        db, group_id, f_field, "=", normalized, limit=500
                    ))
                    combined.update(ids)
                if base_ids is not None:
                    base_ids = base_ids & combined
                else:
                    base_ids = combined
                continue
            try:
                parsed_val = float(f_value) if isinstance(f_value, str) else f_value
            except (ValueError, TypeError):
                parsed_val = f_value
            parsed_val = _normalize_filter_value(parsed_val)
            f_ids = set(await filter_items_by_field(
                db, group_id, f_field, f_op, parsed_val, limit=500
            ))
            if base_ids is not None:
                base_ids = base_ids & f_ids
            else:
                base_ids = f_ids

    # Build base filter clause for SQL queries
    schema_clause = f"AND items.schema_id = {int(schema_id)} " if schema_id is not None else ""
    if base_ids is not None:
        if not base_ids:
            # No items match filters — still build facet structure with zero counts
            id_list = "-1"  # impossible ID to get zero counts from DB
            base_clause = f"AND items.id IN ({id_list}) {schema_clause}"
        else:
            id_list = ",".join(str(int(i)) for i in base_ids)
            base_clause = f"AND items.id IN ({id_list}) {schema_clause}"
    else:
        base_clause = schema_clause

    schemas_query = select(ItemSchema).where(ItemSchema.group_id == group_id)
    if schema_id is not None:
        schemas_query = schemas_query.where(ItemSchema.id == schema_id)
    schemas_result = await db.execute(schemas_query)
    schemas = schemas_result.scalars().all()

    facets: dict[str, dict] = {}
    for schema in schemas:
        defn = json.loads(schema.definition) if isinstance(schema.definition, str) else schema.definition
        sections = defn.get("sections", {})
        for _sec_name, fields in sections.items():
            for field_name, field_def in fields.items():
                ftype = field_def.get("type", "string")
                if ftype not in FACET_TYPES:
                    continue

                if ftype in ("dropdown", "multiselect", "hierarchy"):
                    if ftype == "hierarchy":
                        hierarchy = field_def.get("hierarchy_options", {})
                        schema_options = []
                        for parent, children in hierarchy.items():
                            schema_options.append(parent)
                            for child in children:
                                schema_options.append(f"{parent} > {child}")
                    else:
                        schema_options = (
                            field_def.get("options")
                            or field_def.get("dropdown-items")
                            or field_def.get("multiselect-items")
                            or []
                        )
                    if ftype == "multiselect":
                        # For multiselect, values are JSON arrays — expand them via json_each
                        count_result = await db.execute(text(
                            "SELECT j.value as val, COUNT(DISTINCT items.id) as cnt "
                            "FROM items, json_each(json_extract(items.data, :path)) j "
                            "WHERE items.group_id = :gid "
                            f"{base_clause}"
                            "AND json_type(items.data, :path) = 'array' "
                            "GROUP BY j.value"
                        ), {"path": f"$.{field_name}", "gid": group_id})
                    else:
                        # Count items per option value
                        count_result = await db.execute(text(
                            "SELECT json_extract(data, :path) as val, COUNT(*) as cnt "
                            f"FROM items WHERE group_id = :gid {base_clause}"
                            "AND json_extract(data, :path) IS NOT NULL "
                            "GROUP BY val"
                        ), {"path": f"$.{field_name}", "gid": group_id})
                    value_counts = {str(r[0]): r[1] for r in count_result.fetchall()}
                    options = [
                        {"value": opt, "count": value_counts.get(opt, 0)}
                        for opt in schema_options
                    ]
                    # Include custom values not in schema options (from allow_custom dropdowns)
                    schema_options_set = set(schema_options)
                    for val, cnt in value_counts.items():
                        if val not in schema_options_set:
                            options.append({"value": val, "count": cnt})
                    facets[field_name] = {
                        "type": ftype, "field": field_name, "options": options,
                    }

                elif ftype == "boolean":
                    count_result = await db.execute(text(
                        "SELECT json_extract(data, :path) as val, COUNT(*) as cnt "
                        f"FROM items WHERE group_id = :gid {base_clause}"
                        "AND json_extract(data, :path) IS NOT NULL "
                        "GROUP BY val"
                    ), {"path": f"$.{field_name}", "gid": group_id})
                    counts = {str(r[0]).lower(): r[1] for r in count_result.fetchall()}
                    true_count = counts.get("true", counts.get("1", 0))
                    false_count = counts.get("false", counts.get("0", 0))
                    facets[field_name] = {
                        "type": "boolean", "field": field_name,
                        "true_count": true_count, "false_count": false_count,
                    }

                elif ftype in ("int", "float"):
                    mm = await db.execute(text(
                        "SELECT MIN(CAST(json_extract(data, :path) AS REAL)), "
                        "MAX(CAST(json_extract(data, :path) AS REAL)) "
                        f"FROM items WHERE group_id = :gid {base_clause}"
                        "AND json_extract(data, :path) IS NOT NULL"
                    ), {"path": f"$.{field_name}", "gid": group_id})
                    row = mm.fetchone()
                    facets[field_name] = {
                        "type": ftype, "field": field_name,
                        "min": row[0] if row else None,
                        "max": row[1] if row else None,
                    }

                elif ftype == "unit":
                    # Handle both scalar {value, unit} and array [{value, unit}, ...] (multi-entry)
                    mm = await db.execute(text(
                        "SELECT MIN(v), MAX(v) FROM ("
                        "  SELECT CAST(json_extract(data, :path) AS REAL) AS v"
                        f"  FROM items WHERE group_id = :gid {base_clause}"
                        "  AND json_extract(data, :path) IS NOT NULL"
                        "  UNION ALL"
                        "  SELECT CAST(json_extract(j.value, '$.value') AS REAL) AS v"
                        f"  FROM items, json_each(json_extract(items.data, :arr_path)) j"
                        f"  WHERE items.group_id = :gid {base_clause}"
                        "  AND json_type(items.data, :arr_path) = 'array'"
                        "  AND json_extract(j.value, '$.value') IS NOT NULL"
                        ")"
                    ), {"path": f"$.{field_name}.value", "arr_path": f"$.{field_name}", "gid": group_id})
                    row = mm.fetchone()
                    # Collect distinct unit strings used across items
                    units_result = await db.execute(text(
                        "SELECT DISTINCT u FROM ("
                        "  SELECT json_extract(data, :upath) AS u"
                        f"  FROM items WHERE group_id = :gid {base_clause}"
                        "  AND json_extract(data, :upath) IS NOT NULL"
                        "  UNION ALL"
                        "  SELECT json_extract(j.value, '$.unit') AS u"
                        f"  FROM items, json_each(json_extract(items.data, :arr_path)) j"
                        f"  WHERE items.group_id = :gid {base_clause}"
                        "  AND json_type(items.data, :arr_path) = 'array'"
                        "  AND json_extract(j.value, '$.unit') IS NOT NULL"
                        ") WHERE u IS NOT NULL AND u != ''"
                    ), {"upath": f"$.{field_name}.unit", "arr_path": f"$.{field_name}", "gid": group_id})
                    distinct_units = [r[0] for r in units_result.fetchall()]
                    facets[field_name] = {
                        "type": "unit", "field": field_name,
                        "min": row[0] if row else None,
                        "max": row[1] if row else None,
                        "unit": field_def.get("default_unit", ""),
                        "units": distinct_units,
                    }

                elif ftype == "range":
                    # Range fields store {min, max} — find the overall min of mins and max of maxes
                    mm = await db.execute(text(
                        "SELECT MIN(CAST(json_extract(data, :path_min) AS REAL)), "
                        "MAX(CAST(json_extract(data, :path_max) AS REAL)) "
                        f"FROM items WHERE group_id = :gid {base_clause}"
                        "AND json_extract(data, :path_min) IS NOT NULL"
                    ), {"path_min": f"$.{field_name}.min", "path_max": f"$.{field_name}.max", "gid": group_id})
                    row = mm.fetchone()
                    facets[field_name] = {
                        "type": "range", "field": field_name,
                        "min": row[0] if row else None,
                        "max": row[1] if row else None,
                    }

                elif ftype == "string":
                    if not field_def.get("filterable"):
                        continue
                    # Handle both scalar strings and JSON arrays of strings
                    count_result = await db.execute(text(
                        "SELECT j.value as val, COUNT(DISTINCT items.id) as cnt "
                        "FROM items, json_each("
                        "  CASE WHEN json_type(items.data, :path) = 'array' "
                        "    THEN json_extract(items.data, :path) "
                        "    ELSE json_array(json_extract(items.data, :path)) "
                        "  END"
                        ") j "
                        f"WHERE items.group_id = :gid {base_clause}"
                        "AND json_extract(items.data, :path) IS NOT NULL "
                        "AND json_extract(items.data, :path) != '' "
                        "AND j.value IS NOT NULL AND j.value != '' "
                        "GROUP BY j.value ORDER BY cnt DESC, j.value ASC"
                    ), {"path": f"$.{field_name}", "gid": group_id})
                    options = [
                        {"value": str(r[0]), "count": r[1]}
                        for r in count_result.fetchall()
                    ]
                    if len(options) > 0 and len(options) <= 50:
                        facets[field_name] = {
                            "type": "string", "field": field_name, "options": options,
                        }

    # Collect tags with counts
    tag_q = (
        select(ItemTag.tag, func.count(ItemTag.tag).label("cnt"))
        .join(Item, Item.id == ItemTag.item_id)
        .where(Item.group_id == group_id)
    )
    if base_ids is not None:
        tag_q = tag_q.where(Item.id.in_(base_ids))
    tag_q = tag_q.group_by(ItemTag.tag).order_by(func.count(ItemTag.tag).desc(), ItemTag.tag.asc())
    tag_result = await db.execute(tag_q)
    tags = [{"tag": row[0], "count": row[1]} for row in tag_result.fetchall()]

    return {"facets": facets, "tags": tags}
