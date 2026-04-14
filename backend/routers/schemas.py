import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ItemSchema, Item, Group
from ..schemas import ItemSchemaCreate, ItemSchemaUpdate, ItemSchemaOut

router = APIRouter(prefix="/api/groups/{group_id}/schemas", tags=["schemas"])


@router.get("", response_model=list[ItemSchemaOut])
async def list_schemas(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    result = await db.execute(
        select(ItemSchema, func.count(Item.id).label("item_count"))
        .outerjoin(Item, Item.schema_id == ItemSchema.id)
        .where(ItemSchema.group_id == group_id)
        .group_by(ItemSchema.id)
        .order_by(ItemSchema.name)
    )
    schemas = []
    for row in result.all():
        s = row[0]
        schemas.append(ItemSchemaOut(
            id=s.id, group_id=s.group_id, name=s.name,
            definition=json.loads(s.definition) if s.definition else {},
            created_at=s.created_at, updated_at=s.updated_at,
            item_count=row[1] or 0,
        ))
    return schemas


@router.post("", response_model=ItemSchemaOut, status_code=201)
async def create_schema(group_id: int, body: ItemSchemaCreate, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    schema = ItemSchema(
        group_id=group_id,
        name=body.name,
        definition=json.dumps(body.definition),
    )
    db.add(schema)
    await db.commit()
    await db.refresh(schema)
    return ItemSchemaOut(
        id=schema.id, group_id=schema.group_id, name=schema.name,
        definition=json.loads(schema.definition) if schema.definition else {},
        created_at=schema.created_at, updated_at=schema.updated_at,
    )


@router.get("/{schema_id}", response_model=ItemSchemaOut)
async def get_schema(group_id: int, schema_id: int, db: AsyncSession = Depends(get_db)):
    schema = await db.get(ItemSchema, schema_id)
    if not schema or schema.group_id != group_id:
        raise HTTPException(404, "Schema not found")
    item_count = (await db.execute(
        select(func.count(Item.id)).where(Item.schema_id == schema_id)
    )).scalar() or 0
    return ItemSchemaOut(
        id=schema.id, group_id=schema.group_id, name=schema.name,
        definition=json.loads(schema.definition) if schema.definition else {},
        created_at=schema.created_at, updated_at=schema.updated_at,
        item_count=item_count,
    )


@router.put("/{schema_id}", response_model=ItemSchemaOut)
async def update_schema(group_id: int, schema_id: int, body: ItemSchemaUpdate, db: AsyncSession = Depends(get_db)):
    schema = await db.get(ItemSchema, schema_id)
    if not schema or schema.group_id != group_id:
        raise HTTPException(404, "Schema not found")
    if body.name is not None:
        schema.name = body.name
    if body.definition is not None:
        schema.definition = json.dumps(body.definition)
    await db.commit()
    await db.refresh(schema)
    return ItemSchemaOut(
        id=schema.id, group_id=schema.group_id, name=schema.name,
        definition=json.loads(schema.definition) if schema.definition else {},
        created_at=schema.created_at, updated_at=schema.updated_at,
    )


@router.post("/{schema_id}/rename-field", status_code=200)
async def rename_field(group_id: int, schema_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    """Rename a field across all items of a schema, migrating data from old to new key."""
    old_name = body.get("old_name", "").strip()
    new_name = body.get("new_name", "").strip()
    if not old_name or not new_name or old_name == new_name:
        raise HTTPException(400, "old_name and new_name are required and must differ")

    schema = await db.get(ItemSchema, schema_id)
    if not schema or schema.group_id != group_id:
        raise HTTPException(404, "Schema not found")

    result = await db.execute(
        select(Item).where(Item.schema_id == schema_id)
    )
    items = result.scalars().all()
    updated = 0
    for item in items:
        data = json.loads(item.data) if item.data else {}
        if old_name in data:
            data[new_name] = data.pop(old_name)
            item.data = json.dumps(data)
            updated += 1
    await db.commit()
    return {"updated": updated}


@router.delete("/{schema_id}", status_code=204)
async def delete_schema(group_id: int, schema_id: int, db: AsyncSession = Depends(get_db)):
    schema = await db.get(ItemSchema, schema_id)
    if not schema or schema.group_id != group_id:
        raise HTTPException(404, "Schema not found")
    await db.delete(schema)
    await db.commit()
