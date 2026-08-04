"""Pydantic schemas for rooms, inventory items, and scan history."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RoomIn(BaseModel):
    """Request body for creating or renaming a room."""

    name: str = Field(..., min_length=1, max_length=255)


class RoomOut(BaseModel):
    """Public room response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class InventoryItemIn(BaseModel):
    """A single detected asset to save into the inventory."""

    name: str = Field(..., min_length=1, max_length=255)
    room_id: Optional[uuid.UUID] = None
    image_id: str = Field(..., min_length=1, max_length=255)
    image_url: str = Field(..., min_length=1, max_length=1024)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    bbox: Optional[List[float]] = None


class InventoryItemCreate(BaseModel):
    """Request body for bulk-saving detected assets from one scan."""

    items: List[InventoryItemIn] = Field(default_factory=list)


class InventoryItemOut(BaseModel):
    """Public inventory item response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    room_id: Optional[uuid.UUID] = None
    room_name: Optional[str] = None
    image_id: str
    image_url: str
    confidence: Optional[float] = None
    bbox: Optional[List[float]] = None
    created_at: datetime


class ScanOut(BaseModel):
    """Public scan-history record response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    image_id: str
    image_url: str
    room_id: Optional[uuid.UUID] = None
    room_name: Optional[str] = None
    asset_count: int
    assets: List[str]
    created_at: datetime
