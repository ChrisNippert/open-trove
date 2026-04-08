import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Item, ItemSchema, ItemTag, ItemImage, Group
from ..schemas import ItemCreate, ItemUpdate, ItemOut, ImageOut
from ..services.computed import recompute_item

router = APIRouter(prefix="/api/groups/{group_id}/items", tags=["items"])


def _item_to_out(item: Item) -> ItemOut:
    return ItemOut(
        id=item.id,
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
async def list_items(
    group_id: int,
    schema_id: int | None = None,
    offset: int = 0,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    q = (
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.images))
        .where(Item.group_id == group_id)
    )
    if schema_id is not None:
        q = q.where(Item.schema_id == schema_id)
    q = q.order_by(Item.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(q)
    items = result.scalars().all()
    return [_item_to_out(item) for item in items]


@router.post("", response_model=ItemOut, status_code=201)
async def create_item(group_id: int, body: ItemCreate, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    schema = await db.get(ItemSchema, body.schema_id)
    if not schema or schema.group_id != group_id:
        raise HTTPException(400, "Schema not found in this group")

    # Recompute computed fields
    schema_def = json.loads(schema.definition) if schema.definition else {}
    data = recompute_item(body.data, schema_def)

    item = Item(
        group_id=group_id,
        schema_id=body.schema_id,
        name=body.name,
        data=json.dumps(data),
    )
    db.add(item)
    await db.flush()

    # Add tags
    for tag_str in body.tags:
        tag_str = tag_str.strip()
        if tag_str:
            db.add(ItemTag(item_id=item.id, tag=tag_str))

    await db.commit()

    # Reload with relations
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.images))
        .where(Item.id == item.id)
    )
    item = result.scalar_one()
    return _item_to_out(item)


@router.get("/{item_id}", response_model=ItemOut)
async def get_item(group_id: int, item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.images))
        .where(Item.id == item_id, Item.group_id == group_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")
    return _item_to_out(item)


@router.put("/{item_id}", response_model=ItemOut)
async def update_item(group_id: int, item_id: int, body: ItemUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.images))
        .where(Item.id == item_id, Item.group_id == group_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")

    if body.name is not None:
        item.name = body.name

    if body.data is not None:
        schema = await db.get(ItemSchema, item.schema_id)
        schema_def = json.loads(schema.definition) if schema and schema.definition else {}
        data = recompute_item(body.data, schema_def)
        item.data = json.dumps(data)

    if body.tags is not None:
        # Remove old tags
        old_tags = await db.execute(
            select(ItemTag).where(ItemTag.item_id == item_id)
        )
        for t in old_tags.scalars().all():
            await db.delete(t)
        # Add new tags
        for tag_str in body.tags:
            tag_str = tag_str.strip()
            if tag_str:
                db.add(ItemTag(item_id=item.id, tag=tag_str))

    await db.commit()

    # Reload
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.images))
        .where(Item.id == item.id)
    )
    item = result.scalar_one()
    return _item_to_out(item)


@router.delete("/{item_id}", status_code=204)
async def delete_item(group_id: int, item_id: int, db: AsyncSession = Depends(get_db)):
    from ..config import IMAGES_DIR

    result = await db.execute(
        select(Item)
        .options(selectinload(Item.images))
        .where(Item.id == item_id, Item.group_id == group_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")

    # Clean up image files from disk
    for img in (item.images or []):
        file_path = IMAGES_DIR / img.filename
        if file_path.exists():
            file_path.unlink()
        if img.thumbnail_filename:
            thumb_path = IMAGES_DIR / img.thumbnail_filename
            if thumb_path.exists():
                thumb_path.unlink()

    await db.delete(item)
    await db.commit()
