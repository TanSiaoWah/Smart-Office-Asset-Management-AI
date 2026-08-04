"""Business logic for rooms, inventory items, and scan history."""
import uuid
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .models import InventoryItem, Room, Scan
from .schemas import InventoryItemIn, InventoryItemOut, RoomIn, RoomOut, ScanOut


def create_room(db: Session, owner_id: uuid.UUID, body: RoomIn) -> Room:
    """
    Create a new room owned by the given user.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.
        body: Room creation request.

    Returns:
        The created Room.

    Raises:
        HTTPException: If a room with the same name already exists for this owner.
    """
    name = body.name.strip()
    existing = (
        db.query(Room)
        .filter(Room.owner_id == owner_id, Room.name == name)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A room with this name already exists.",
        )

    room = Room(owner_id=owner_id, name=name)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def list_rooms(db: Session, owner_id: uuid.UUID) -> List[Room]:
    """
    List all rooms owned by the given user.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.

    Returns:
        List of Room ORM instances.
    """
    return (
        db.query(Room)
        .filter(Room.owner_id == owner_id)
        .order_by(Room.created_at.asc())
        .all()
    )


def rename_room(db: Session, owner_id: uuid.UUID, room_id: uuid.UUID, body: RoomIn) -> Room:
    """
    Rename a room and keep inventory item room_name snapshots in sync.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.
        room_id: UUID of the room to rename.
        body: Room rename request.

    Returns:
        The updated Room.

    Raises:
        HTTPException: If the room is not found or the new name conflicts.
    """
    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.owner_id == owner_id)
        .first()
    )
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    new_name = body.name.strip()
    conflict = (
        db.query(Room)
        .filter(Room.owner_id == owner_id, Room.name == new_name, Room.id != room_id)
        .first()
    )
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A room with this name already exists.",
        )

    room.name = new_name
    db.query(InventoryItem).filter(InventoryItem.room_id == room_id).update(
        {InventoryItem.room_name: new_name}
    )
    db.commit()
    db.refresh(room)
    return room


def delete_room(db: Session, owner_id: uuid.UUID, room_id: uuid.UUID) -> None:
    """
    Delete a room owned by the given user.

    Inventory items referencing the room keep their room_name snapshot but
    have their room_id set to NULL (via ondelete SET NULL).

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.
        room_id: UUID of the room to delete.

    Raises:
        HTTPException: If the room is not found.
    """
    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.owner_id == owner_id)
        .first()
    )
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    db.query(InventoryItem).filter(InventoryItem.room_id == room_id).update(
        {InventoryItem.room_id: None}
    )
    db.delete(room)
    db.commit()


def create_inventory_items(
    db: Session,
    owner_id: uuid.UUID,
    items: List[InventoryItemIn],
) -> List[InventoryItem]:
    """
    Bulk-save detected assets into the user's inventory.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.
        items: List of detected assets to save.

    Returns:
        List of created InventoryItem ORM instances.
    """
    created: List[InventoryItem] = []
    for item in items:
        room_name = None
        if item.room_id is not None:
            room = (
                db.query(Room)
                .filter(Room.id == item.room_id, Room.owner_id == owner_id)
                .first()
            )
            if room is not None:
                room_name = room.name

        inventory_item = InventoryItem(
            owner_id=owner_id,
            name=item.name.strip(),
            room_id=item.room_id,
            room_name=room_name,
            image_id=item.image_id,
            image_url=item.image_url,
            confidence=item.confidence,
            bbox=item.bbox,
        )
        db.add(inventory_item)
        created.append(inventory_item)

    # Create a scan-history record summarizing this save action.
    if created:
        first = created[0]
        scan = Scan(
            owner_id=owner_id,
            image_id=first.image_id,
            image_url=first.image_url,
            room_id=first.room_id,
            room_name=first.room_name,
            asset_count=len(created),
            assets=[item.name.strip() for item in items],
        )
        db.add(scan)

    db.commit()
    for inventory_item in created:
        db.refresh(inventory_item)
    return created


def list_inventory_items(db: Session, owner_id: uuid.UUID) -> List[InventoryItem]:
    """
    List all inventory items owned by the given user.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.

    Returns:
        List of InventoryItem ORM instances.
    """
    return (
        db.query(InventoryItem)
        .filter(InventoryItem.owner_id == owner_id)
        .order_by(InventoryItem.created_at.desc())
        .all()
    )


def delete_inventory_item(
    db: Session,
    owner_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    """
    Delete an inventory item owned by the given user.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.
        item_id: UUID of the inventory item to delete.

    Raises:
        HTTPException: If the item is not found.
    """
    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.id == item_id, InventoryItem.owner_id == owner_id)
        .first()
    )
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found.",
        )

    db.delete(item)
    db.commit()


def list_scans(db: Session, owner_id: uuid.UUID) -> List[Scan]:
    """
    List the scan-history records owned by the given user, newest first.

    Args:
        db: SQLAlchemy session.
        owner_id: UUID of the owning profile.

    Returns:
        List of Scan ORM instances.
    """
    return (
        db.query(Scan)
        .filter(Scan.owner_id == owner_id)
        .order_by(Scan.created_at.desc())
        .all()
    )


def to_scan_out(scan: Scan) -> ScanOut:
    """
    Convert a Scan ORM instance to its Pydantic schema.

    Args:
        scan: The Scan ORM instance.

    Returns:
        ScanOut schema instance.
    """
    return ScanOut.model_validate(scan)


def to_room_out(room: Room) -> RoomOut:
    """
    Convert a Room ORM instance to its Pydantic schema.

    Args:
        room: The Room ORM instance.

    Returns:
        RoomOut schema instance.
    """
    return RoomOut.model_validate(room)


def to_inventory_out(item: InventoryItem) -> InventoryItemOut:
    """
    Convert an InventoryItem ORM instance to its Pydantic schema.

    Args:
        item: The InventoryItem ORM instance.

    Returns:
        InventoryItemOut schema instance.
    """
    return InventoryItemOut.model_validate(item)