"""Business logic for Google SSO authentication and profile management."""
import logging
import os
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from supabase import create_client

from .models import Profile
from .schemas import ProfileOut

logger = logging.getLogger(__name__)


def _get_supabase_client():
    """
    Create a Supabase client for server-side token verification.

    Uses the anon key (not service_role) so that auth.getUser() validates
    the token properly against Supabase Auth.

    Returns:
        A Supabase client instance.

    Raises:
        RuntimeError: If Supabase env vars are not configured.
    """
    url = os.environ.get("SUPABASE_URL", "")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not anon_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set for auth verification."
        )
    return create_client(url, anon_key)


def verify_supabase_token(access_token: str) -> dict[str, Any]:
    """
    Verify a Supabase access token using the Supabase Auth API.

    Instead of manually decoding the JWT (which can have algorithm
    compatibility issues), this calls supabase.auth.get_user() which
    verifies the token server-side against Supabase Auth.

    Args:
        access_token: The JWT issued by Supabase Auth.

    Returns:
        A dict with 'email', 'name', 'avatar_url' extracted from the user.

    Raises:
        HTTPException: If the token is invalid or expired.
    """
    try:
        client = _get_supabase_client()
        response = client.auth.get_user(access_token)
        if response.user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
            )

        user = response.user
        user_metadata = user.user_metadata or {}

        # Return a claims-like dict compatible with upsert_profile.
        return {
            "email": user.email,
            "name": user_metadata.get("full_name") or user_metadata.get("name"),
            "picture": user_metadata.get("avatar_url") or user_metadata.get("picture"),
            "user_metadata": user_metadata,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Supabase token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {exc}",
        ) from exc


def upsert_profile(db: Session, claims: dict[str, Any]) -> Profile:
    """
    Create or update a Profile from verified Supabase JWT claims.

    Args:
        db: SQLAlchemy session.
        claims: Decoded JWT claims from Supabase.

    Returns:
        The created or updated Profile.
    """
    email = claims.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token does not contain an email address.",
        )

    user_metadata = claims.get("user_metadata") or {}
    name = user_metadata.get("full_name") or claims.get("name") or email.split("@")[0]
    avatar_url = user_metadata.get("avatar_url") or claims.get("picture")

    profile = db.query(Profile).filter(Profile.email == email).first()
    if profile is None:
        profile = Profile(
            email=email,
            name=name,
            avatar_url=avatar_url,
            role="user",
        )
        db.add(profile)
    else:
        profile.name = name
        profile.avatar_url = avatar_url

    db.commit()
    db.refresh(profile)
    return profile


def get_profile_by_email(db: Session, email: str) -> Profile | None:
    """
    Fetch a profile by email address.

    Args:
        db: SQLAlchemy session.
        email: Email address to look up.

    Returns:
        The matching Profile, or None if not found.
    """
    return db.query(Profile).filter(Profile.email == email).first()


def update_profile_name(db: Session, email: str, new_name: str) -> Profile:
    """
    Update a user's profile name.

    Args:
        db: SQLAlchemy session.
        email: Email of the profile to update.
        new_name: New display name.

    Returns:
        The updated Profile.

    Raises:
        HTTPException: If the profile is not found.
    """
    profile = db.query(Profile).filter(Profile.email == email).first()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    profile.name = new_name
    db.commit()
    db.refresh(profile)
    return profile


def to_profile_out(profile: Profile) -> ProfileOut:
    """
    Convert a Profile ORM instance to its Pydantic schema.

    Args:
        profile: The Profile ORM instance.

    Returns:
        ProfileOut schema instance.
    """
    return ProfileOut.model_validate(profile)