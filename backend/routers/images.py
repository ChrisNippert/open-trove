import uuid
import json
from pathlib import Path
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage

from ..database import get_db
from ..models import Item, ItemImage
from ..config import IMAGES_DIR, MAX_IMAGE_SIZE, THUMBNAIL_SIZE
from ..schemas import ImageOut

router = APIRouter(prefix="/api/items/{item_id}/images", tags=["images"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _generate_filename(original: str, suffix: str = "") -> str:
    ext = Path(original).suffix.lower() or ".jpg"
    return f"{uuid.uuid4().hex}{suffix}{ext}"


def _create_thumbnail(image_path: Path, thumb_path: Path):
    try:
        with PILImage.open(image_path) as img:
            img.thumbnail(THUMBNAIL_SIZE, PILImage.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            thumb_path_jpg = thumb_path.with_suffix(".jpg")
            img.save(thumb_path_jpg, "JPEG", quality=85)
            return thumb_path_jpg.name
    except Exception:
        return None


@router.post("", response_model=ImageOut, status_code=201)
async def upload_image(
    item_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(ALLOWED_MIME)}")

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(400, f"File too large. Max size: {MAX_IMAGE_SIZE // (1024*1024)}MB")

    # Save original
    filename = _generate_filename(file.filename or "image.jpg")
    file_path = IMAGES_DIR / filename
    file_path.write_bytes(content)

    # Generate thumbnail
    thumb_filename = _generate_filename(file.filename or "image.jpg", "_thumb")
    thumb_path = IMAGES_DIR / thumb_filename
    actual_thumb = _create_thumbnail(file_path, thumb_path)

    # Get current max sort order
    result = await db.execute(
        select(ItemImage.sort_order)
        .where(ItemImage.item_id == item_id)
        .order_by(ItemImage.sort_order.desc())
        .limit(1)
    )
    max_order = result.scalar() or 0

    image = ItemImage(
        item_id=item_id,
        filename=filename,
        original_filename=file.filename or "image",
        thumbnail_filename=actual_thumb,
        size_bytes=len(content),
        mime_type=file.content_type or "",
        sort_order=max_order + 1,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return ImageOut.model_validate(image)


@router.get("", response_model=list[ImageOut])
async def list_images(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ItemImage)
        .where(ItemImage.item_id == item_id)
        .order_by(ItemImage.sort_order)
    )
    return [ImageOut.model_validate(img) for img in result.scalars().all()]


@router.delete("/{image_id}", status_code=204)
async def delete_image(item_id: int, image_id: int, db: AsyncSession = Depends(get_db)):
    image = await db.get(ItemImage, image_id)
    if not image or image.item_id != item_id:
        raise HTTPException(404, "Image not found")

    # Delete files
    file_path = IMAGES_DIR / image.filename
    if file_path.exists():
        file_path.unlink()
    if image.thumbnail_filename:
        thumb_path = IMAGES_DIR / image.thumbnail_filename
        if thumb_path.exists():
            thumb_path.unlink()

    await db.delete(image)
    await db.commit()


@router.post("/{image_id}/set-primary", response_model=ImageOut)
async def set_primary_image(item_id: int, image_id: int, db: AsyncSession = Depends(get_db)):
    """Set an image as the primary (thumbnail) by giving it the lowest sort_order."""
    image = await db.get(ItemImage, image_id)
    if not image or image.item_id != item_id:
        raise HTTPException(404, "Image not found")

    # Get all images for this item ordered by sort_order
    result = await db.execute(
        select(ItemImage)
        .where(ItemImage.item_id == item_id)
        .order_by(ItemImage.sort_order)
    )
    images = result.scalars().all()

    # Reassign sort_order: chosen image gets 0, rest get 1, 2, 3...
    order = 1
    for img in images:
        if img.id == image_id:
            img.sort_order = 0
        else:
            img.sort_order = order
            order += 1

    await db.commit()
    await db.refresh(image)
    return ImageOut.model_validate(image)


# Serve image files
@router.get("/{image_id}/file")
async def serve_image(item_id: int, image_id: int, db: AsyncSession = Depends(get_db)):
    image = await db.get(ItemImage, image_id)
    if not image or image.item_id != item_id:
        raise HTTPException(404, "Image not found")
    file_path = IMAGES_DIR / image.filename
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")
    return FileResponse(file_path, media_type=image.mime_type)


@router.get("/{image_id}/thumbnail")
async def serve_thumbnail(item_id: int, image_id: int, db: AsyncSession = Depends(get_db)):
    image = await db.get(ItemImage, image_id)
    if not image or image.item_id != item_id:
        raise HTTPException(404, "Image not found")
    if not image.thumbnail_filename:
        raise HTTPException(404, "No thumbnail available")
    thumb_path = IMAGES_DIR / image.thumbnail_filename
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail not found on disk")
    return FileResponse(thumb_path, media_type="image/jpeg")
