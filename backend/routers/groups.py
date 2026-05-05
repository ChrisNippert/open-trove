import json
import uuid
from pathlib import Path
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage

from ..database import get_db
from ..models import Group, ItemSchema, Item, ItemImage
from ..schemas import GroupCreate, GroupUpdate, GroupOut
from ..config import IMAGES_DIR, THUMBNAIL_SIZE

router = APIRouter(prefix="/api/groups", tags=["groups"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


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
            thumbnail=group.thumbnail,
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
        thumbnail=group.thumbnail,
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
        thumbnail=group.thumbnail,
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
        thumbnail=group.thumbnail,
        created_at=group.created_at, updated_at=group.updated_at,
    )


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    # Clean up thumbnail file
    if group.thumbnail:
        thumb_path = IMAGES_DIR / group.thumbnail
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
    # Clean up all item image files
    img_q = select(ItemImage).join(Item).where(Item.group_id == group_id)
    img_result = await db.execute(img_q)
    for img in img_result.scalars():
        file_path = IMAGES_DIR / img.filename
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        if img.thumbnail_filename:
            t_path = IMAGES_DIR / img.thumbnail_filename
            if t_path.exists():
                t_path.unlink(missing_ok=True)
    await db.delete(group)
    await db.commit()


@router.post("/{group_id}/thumbnail", response_model=GroupOut)
async def upload_group_thumbnail(
    group_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(ALLOWED_MIME)}")

    content = await file.read()

    # Delete old thumbnail if it exists
    if group.thumbnail:
        old_path = IMAGES_DIR / group.thumbnail
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    # Create thumbnail-sized image
    try:
        with PILImage.open(BytesIO(content)) as img:
            img.thumbnail(THUMBNAIL_SIZE, PILImage.Resampling.LANCZOS)
            has_transparency = (
                img.mode in ("RGBA", "LA", "PA")
                or (img.mode == "P" and "transparency" in img.info)
            )
            if has_transparency:
                filename = f"group_{uuid.uuid4().hex}_thumb.png"
                thumb_path = IMAGES_DIR / filename
                if img.mode != "RGBA":
                    img = img.convert("RGBA")
                img.save(thumb_path, "PNG")
            else:
                if img.mode != "RGB":
                    img = img.convert("RGB")
                filename = f"group_{uuid.uuid4().hex}_thumb.jpg"
                thumb_path = IMAGES_DIR / filename
                img.save(thumb_path, "JPEG", quality=85)
    except Exception:
        raise HTTPException(400, "Could not process image")

    group.thumbnail = filename
    await db.commit()
    await db.refresh(group)
    return GroupOut(
        id=group.id, name=group.name, description=group.description or "",
        thumbnail=group.thumbnail,
        created_at=group.created_at, updated_at=group.updated_at,
    )


@router.delete("/{group_id}/thumbnail", status_code=204)
async def delete_group_thumbnail(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    if group.thumbnail:
        thumb_path = IMAGES_DIR / group.thumbnail
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
        group.thumbnail = None
        await db.commit()


@router.get("/{group_id}/thumbnail")
async def get_group_thumbnail(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group or not group.thumbnail:
        raise HTTPException(404, "No thumbnail")
    thumb_path = IMAGES_DIR / group.thumbnail
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail file missing")
    return FileResponse(thumb_path, media_type="image/jpeg")
