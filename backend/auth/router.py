"""Router for Google SSO authentication endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from .dependencies import get_current_profile
from .schemas import AuthResponse, GoogleTokenRequest, ProfileOut, ProfileUpdateRequest
from .service import to_profile_out, update_profile_name, upsert_profile, verify_supabase_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=AuthResponse)
async def google_login(
    body: GoogleTokenRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    """
    Authenticate a user via a Supabase Google SSO access token.

    Verifies the token, upserts the user's Profile in PostgreSQL, and
    returns the profile.

    Args:
        body: Request containing the Supabase access token.
        db: SQLAlchemy session.

    Returns:
        AuthResponse with the user's profile.
    """
    claims = verify_supabase_token(body.access_token)
    profile = upsert_profile(db, claims)
    return AuthResponse(profile=to_profile_out(profile))


@router.get("/me", response_model=ProfileOut)
async def get_me(
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
) -> ProfileOut:
    """
    Return the currently authenticated user's profile.

    Args:
        profile: Resolved profile from the bearer token dependency.

    Returns:
        ProfileOut for the authenticated user.
    """
    return profile


@router.put("/me", response_model=ProfileOut)
async def update_me(
    body: ProfileUpdateRequest,
    profile: Annotated[ProfileOut, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> ProfileOut:
    """
    Update the currently authenticated user's profile name.

    Args:
        body: Request containing the new name.
        profile: Resolved profile from the bearer token dependency.
        db: SQLAlchemy session.

    Returns:
        Updated ProfileOut for the authenticated user.
    """
    updated = update_profile_name(db, profile.email, body.name)
    return to_profile_out(updated)
