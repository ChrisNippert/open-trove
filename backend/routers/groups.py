import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Group, ItemSchema, Item
from ..schemas import GroupCreate, GroupUpdate, GroupOut

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Group,
            func.count(Item.id.distinct()).label("item_count"),
        )
        .outerjoin(Item, Item.group_id == Group.id)
        .group_by(Group.id)
        .order_by(Group.name)
    )
    groups = []
    for row in result.all():
        group = row[0]
        # Get schema count separately
        schema_count_result = await db.execute(
            select(func.count(ItemSchema.id)).where(ItemSchema.group_id == group.id)
        )
        schema_count = schema_count_result.scalar() or 0
        groups.append(GroupOut(
            id=group.id,
            name=group.name,
            description=group.description or "",
            created_at=group.created_at,
            updated_at=group.updated_at,
            schema_count=schema_count,
            item_count=row[1] or 0,
        ))
    return groups


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = Group(name=body.name, description=body.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return GroupOut(
        id=group.id, name=group.name, description=group.description or "",
        created_at=group.created_at, updated_at=group.updated_at,
    )


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    item_count = (await db.execute(
        select(func.count(Item.id)).where(Item.group_id == group_id)
    )).scalar() or 0
    schema_count = (await db.execute(
        select(func.count(ItemSchema.id)).where(ItemSchema.group_id == group_id)
    )).scalar() or 0
    return GroupOut(
        id=group.id, name=group.name, description=group.description or "",
        created_at=group.created_at, updated_at=group.updated_at,
        schema_count=schema_count, item_count=item_count,
    )


@router.put("/{group_id}", response_model=GroupOut)
async def update_group(group_id: int, body: GroupUpdate, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    await db.commit()
    await db.refresh(group)
    return GroupOut(
        id=group.id, name=group.name, description=group.description or "",
        created_at=group.created_at, updated_at=group.updated_at,
    )


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    await db.delete(group)
    await db.commit()
