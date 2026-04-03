import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from .database import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, default="")
    thumbnail = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    schemas = relationship("ItemSchema", back_populates="group", cascade="all, delete-orphan")
    items = relationship("Item", back_populates="group", cascade="all, delete-orphan")
    views = relationship("DirectoryView", back_populates="group", cascade="all, delete-orphan")


class ItemSchema(Base):
    __tablename__ = "item_schemas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    definition = Column(Text, nullable=False, default="{}")  # JSON blob of field definitions
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="schemas")
    items = relationship("Item", back_populates="schema", cascade="all, delete-orphan")

    @property
    def parsed_definition(self) -> dict:
        return json.loads(self.definition) if self.definition else {}


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    schema_id = Column(Integer, ForeignKey("item_schemas.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False, default="")
    data = Column(Text, nullable=False, default="{}")  # JSON blob of field values
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="items")
    schema = relationship("ItemSchema", back_populates="items")
    images = relationship("ItemImage", back_populates="item", cascade="all, delete-orphan")
    tags = relationship("ItemTag", back_populates="item", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_items_group", "group_id"),
        Index("idx_items_schema", "schema_id"),
    )

    @property
    def parsed_data(self) -> dict:
        return json.loads(self.data) if self.data else {}


class ItemImage(Base):
    __tablename__ = "item_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(512), nullable=False)
    original_filename = Column(String(512), nullable=False)
    thumbnail_filename = Column(String(512), nullable=True)
    size_bytes = Column(Integer, default=0)
    mime_type = Column(String(128), default="")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    item = relationship("Item", back_populates="images")


class ItemTag(Base):
    __tablename__ = "item_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    tag = Column(String(255), nullable=False)

    item = relationship("Item", back_populates="tags")

    __table_args__ = (
        Index("idx_tags_tag", "tag"),
        Index("idx_tags_item", "item_id"),
    )


class DirectoryView(Base):
    __tablename__ = "directory_views"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    definition = Column(Text, nullable=False, default="{}")  # JSON: tree structure with filter rules
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="views")
