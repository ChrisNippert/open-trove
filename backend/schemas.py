"""Pydantic schemas for API request/response models."""

from datetime import datetime
from pydantic import BaseModel


# --- Groups ---
class GroupCreate(BaseModel):
    name: str
    description: str = ""

class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

class GroupOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    schema_count: int = 0
    item_count: int = 0

    model_config = {"from_attributes": True}


# --- Item Schemas ---
class ItemSchemaCreate(BaseModel):
    name: str
    definition: dict = {}

class ItemSchemaUpdate(BaseModel):
    name: str | None = None
    definition: dict | None = None

class ItemSchemaOut(BaseModel):
    id: int
    group_id: int
    name: str
    definition: dict
    created_at: datetime
    updated_at: datetime
    item_count: int = 0

    model_config = {"from_attributes": True}


# --- Items ---
class ItemCreate(BaseModel):
    name: str = ""
    schema_id: int
    data: dict = {}
    tags: list[str] = []

class ItemUpdate(BaseModel):
    name: str | None = None
    data: dict | None = None
    tags: list[str] | None = None

class ImageOut(BaseModel):
    id: int
    filename: str
    original_filename: str
    thumbnail_filename: str | None
    size_bytes: int
    mime_type: str
    sort_order: int

    model_config = {"from_attributes": True}

class ItemOut(BaseModel):
    id: int
    group_id: int
    schema_id: int
    name: str
    data: dict
    tags: list[str] = []
    images: list[ImageOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Directory Views ---
class DirectoryViewCreate(BaseModel):
    name: str
    definition: dict = {}

class DirectoryViewUpdate(BaseModel):
    name: str | None = None
    definition: dict | None = None

class DirectoryViewOut(BaseModel):
    id: int
    group_id: int
    name: str
    definition: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Search ---
class SearchQuery(BaseModel):
    q: str
    group_id: int | None = None
    filters: dict = {}  # field_name -> value or {"op": ">", "value": 10}


# --- Export/Import ---
class ExportRequest(BaseModel):
    group_id: int | None = None
    format: str = "json"  # "json" or "csv"

class ImportResult(BaseModel):
    imported: int
    errors: list[str] = []


# --- Units ---
class UnitInfo(BaseModel):
    name: str
    symbol: str
    category: str

class ConvertRequest(BaseModel):
    value: float
    from_unit: str
    to_unit: str

class ConvertResult(BaseModel):
    value: float
    from_unit: str
    to_unit: str
    result: float
