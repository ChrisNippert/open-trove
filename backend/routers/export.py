import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Group, ItemSchema
from ..schemas import ExportRequest, ImportResult
from ..services.export import export_json, export_csv, import_json, import_csv

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/json")
async def export_as_json(
    group_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    filename = "export.json"
    if group_id is not None:
        group = await db.get(Group, group_id)
        if group:
            safe_name = group.name.replace('"', '').replace('/', '_').replace('\\', '_')
            filename = f"{safe_name}.json"
    data = await export_json(db, group_id)
    return Response(
        content=json.dumps(data, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/csv")
async def export_as_csv(
    group_id: int = Query(...),
    schema_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    content = await export_csv(db, group_id, schema_id)
    if not content:
        raise HTTPException(404, "No data found for this group/schema")
    filename = "export.csv"
    group = await db.get(Group, group_id)
    schema = await db.get(ItemSchema, schema_id)
    parts = []
    if group:
        parts.append(group.name.replace('"', '').replace('/', '_').replace('\\', '_'))
    if schema:
        parts.append(schema.name.replace('"', '').replace('/', '_').replace('\\', '_'))
    if parts:
        filename = f"{' - '.join(parts)}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import/json", response_model=ImportResult)
async def import_from_json(
    group_id: int = Query(...),
    schema_id: int = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    try:
        items_data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")
    if not isinstance(items_data, list):
        raise HTTPException(400, "JSON must be an array of items")

    imported, errors = await import_json(db, group_id, schema_id, items_data)
    return ImportResult(imported=imported, errors=errors)


@router.post("/import/csv", response_model=ImportResult)
async def import_from_csv(
    group_id: int = Query(...),
    schema_id: int = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = (await file.read()).decode("utf-8")
    imported, errors = await import_csv(db, group_id, schema_id, content)
    return ImportResult(imported=imported, errors=errors)
