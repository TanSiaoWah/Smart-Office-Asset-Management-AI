"""Router for room and inventory management endpoints."""
import uuid
from typing import Annotated, List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from auth.dependencies import get_current_profile
from auth.schemas import ProfileOut
from database import get_db
from .schemas import InventoryItemCreate, InventoryItemOut, RoomIn, RoomOut, ScanOut
from .service import (
    create_inventory_items,
    create_room,
    delete_inventory_item,
    delete_room,
    list_inventory_items,
    list_rooms,
    list_scans,
    rename_room,
    to_inventory_out,
    to_room_out,
    to_scan_out,
)

router = APIRouter(tags=["inventory"])


@router.post("/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room_endpoint(
    body: RoomIn,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> RoomOut:
    """
    Create a new room for the authenticated user.

    Args:
        body: Room creation request.
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        The created RoomOut.
    """
    room = create_room(db, profile.id, body)
    return to_room_out(room)


@router.get("/rooms", response_model=List[RoomOut])
async def list_rooms_endpoint(
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> List[RoomOut]:
    """
    List all rooms owned by the authenticated user.

    Args:
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        List of RoomOut for the user.
    """
    rooms = list_rooms(db, profile.id)
    return [to_room_out(room) for room in rooms]


@router.put("/rooms/{room_id}", response_model=RoomOut)
async def rename_room_endpoint(
    room_id: uuid.UUID,
    body: RoomIn,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> RoomOut:
    """
    Rename a room owned by the authenticated user.

    Args:
        room_id: UUID of the room to rename.
        body: Room rename request.
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        The updated RoomOut.
    """
    room = rename_room(db, profile.id, room_id, body)
    return to_room_out(room)


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room_endpoint(
    room_id: uuid.UUID,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """
    Delete a room owned by the authenticated user.

    Args:
        room_id: UUID of the room to delete.
        profile: Authenticated user's profile.
        db: SQLAlchemy session.
    """
    delete_room(db, profile.id, room_id)


@router.post("/inventory", response_model=List[InventoryItemOut], status_code=status.HTTP_201_CREATED)
async def create_inventory_endpoint(
    body: InventoryItemCreate,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> List[InventoryItemOut]:
    """
    Bulk-save detected assets into the authenticated user's inventory.

    Args:
        body: List of detected assets to save.
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        List of created InventoryItemOut.
    """
    items = create_inventory_items(db, profile.id, body.items)
    return [to_inventory_out(item) for item in items]


@router.get("/scans", response_model=List[ScanOut])
async def list_scans_endpoint(
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> List[ScanOut]:
    """
    List the scan-history records owned by the authenticated user.

    Args:
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        List of ScanOut for the user.
    """
    scans = list_scans(db, profile.id)
    return [to_scan_out(scan) for scan in scans]


@router.get("/inventory", response_model=List[InventoryItemOut])
async def list_inventory_endpoint(
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> List[InventoryItemOut]:
    """
    List all inventory items owned by the authenticated user.

    Args:
        profile: Authenticated user's profile.
        db: SQLAlchemy session.

    Returns:
        List of InventoryItemOut for the user.
    """
    items = list_inventory_items(db, profile.id)
    return [to_inventory_out(item) for item in items]


@router.delete("/inventory/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory_endpoint(
    item_id: uuid.UUID,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """
    Delete an inventory item owned by the authenticated user.

    Args:
        item_id: UUID of the inventory item to delete.
        profile: Authenticated user's profile.
        db: SQLAlchemy session.
    """
    delete_inventory_item(db, profile.id, item_id)