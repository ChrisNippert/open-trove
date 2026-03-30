from fastapi import APIRouter, HTTPException
from ..schemas import UnitInfo, ConvertRequest, ConvertResult
from ..services.units import get_unit, get_units_by_category, get_categories, convert

router = APIRouter(prefix="/api/units", tags=["units"])


@router.get("/categories", response_model=list[str])
async def list_categories():
    return get_categories()


@router.get("/categories/{category}", response_model=list[UnitInfo])
async def list_units_in_category(category: str):
    units = get_units_by_category(category)
    if not units:
        raise HTTPException(404, "Category not found")
    return [UnitInfo(name=u.name, symbol=u.symbol, category=u.category) for u in units]


@router.post("/convert", response_model=ConvertResult)
async def convert_unit(body: ConvertRequest):
    result = convert(body.value, body.from_unit, body.to_unit)
    if result is None:
        raise HTTPException(400, "Cannot convert between these units")
    return ConvertResult(
        value=body.value,
        from_unit=body.from_unit,
        to_unit=body.to_unit,
        result=round(result, 6),
    )
