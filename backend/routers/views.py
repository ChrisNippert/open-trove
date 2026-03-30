import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import DirectoryView, Group, Item, ItemTag
from ..schemas import DirectoryViewCreate, DirectoryViewUpdate, DirectoryViewOut, ItemOut, ImageOut

router = APIRouter(prefix="/api/groups/{group_id}/views", tags=["views"])


@router.get("", response_model=list[DirectoryViewOut])
async def list_views(group_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DirectoryView)
        .where(DirectoryView.group_id == group_id)
        .order_by(DirectoryView.name)
    )
    views = []
    for v in result.scalars().all():
        views.append(DirectoryViewOut(
            id=v.id, group_id=v.group_id, name=v.name,
            definition=json.loads(v.definition) if v.definition else {},
            created_at=v.created_at, updated_at=v.updated_at,
        ))
    return views


@router.post("", response_model=DirectoryViewOut, status_code=201)
async def create_view(group_id: int, body: DirectoryViewCreate, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    view = DirectoryView(
        group_id=group_id,
        name=body.name,
        definition=json.dumps(body.definition),
    )
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return DirectoryViewOut(
        id=view.id, group_id=view.group_id, name=view.name,
        definition=json.loads(view.definition) if view.definition else {},
        created_at=view.created_at, updated_at=view.updated_at,
    )


@router.put("/{view_id}", response_model=DirectoryViewOut)
async def update_view(group_id: int, view_id: int, body: DirectoryViewUpdate, db: AsyncSession = Depends(get_db)):
    view = await db.get(DirectoryView, view_id)
    if not view or view.group_id != group_id:
        raise HTTPException(404, "View not found")
    if body.name is not None:
        view.name = body.name
    if body.definition is not None:
        view.definition = json.dumps(body.definition)
    await db.commit()
    await db.refresh(view)
    return DirectoryViewOut(
        id=view.id, group_id=view.group_id, name=view.name,
        definition=json.loads(view.definition) if view.definition else {},
        created_at=view.created_at, updated_at=view.updated_at,
    )


@router.delete("/{view_id}", status_code=204)
async def delete_view(group_id: int, view_id: int, db: AsyncSession = Depends(get_db)):
    view = await db.get(DirectoryView, view_id)
    if not view or view.group_id != group_id:
        raise HTTPException(404, "View not found")
    await db.delete(view)
    await db.commit()


@router.get("/{view_id}/resolve", response_model=dict)
async def resolve_view(group_id: int, view_id: int, db: AsyncSession = Depends(get_db)):
    """Resolve a directory view into a tree of items.

    View definition example:
    {
        "children": {
            "Spring": {"filter": {"field": "season", "op": "contains", "value": "Spring"}},
            "Summer": {"filter": {"field": "season", "op": "contains", "value": "Summer"}}
        }
    }

    Returns a nested dict with item IDs at each leaf.
    """
    view = await db.get(DirectoryView, view_id)
    if not view or view.group_id != group_id:
        raise HTTPException(404, "View not found")

    definition = json.loads(view.definition) if view.definition else {}
    tree = await _resolve_node(db, group_id, definition)
    return {"name": view.name, "tree": tree}


async def _resolve_node(db: AsyncSession, group_id: int, node: dict) -> dict:
    result = {}

    # If this node has a filter, resolve matching items
    if "filter" in node:
        f = node["filter"]
        field, op, value = f.get("field", ""), f.get("op", "="), f.get("value", "")

        if op == "contains":
            # For array fields like season: ["Spring", "Summer"]
            sql = """
                SELECT id FROM items
                WHERE group_id = :group_id
                AND EXISTS (
                    SELECT 1 FROM json_each(json_extract(data, :path))
                    WHERE value = :value
                )
            """
            res = await db.execute(text(sql), {
                "group_id": group_id,
                "path": f"$.{field}",
                "value": value,
            })
        else:
            sql = f"""
                SELECT id FROM items
                WHERE group_id = :group_id
                AND json_extract(data, :path) {op} :value
            """
            res = await db.execute(text(sql), {
                "group_id": group_id,
                "path": f"$.{field}",
                "value": value,
            })
        result["items"] = [row[0] for row in res.fetchall()]

    # Recurse into children
    if "children" in node:
        result["children"] = {}
        for child_name, child_def in node["children"].items():
            result["children"][child_name] = await _resolve_node(db, group_id, child_def)

    return result
