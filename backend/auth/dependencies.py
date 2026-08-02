"""FastAPI dependencies for authentication."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from .schemas import ProfileOut
from .service import get_profile_by_email, to_profile_out, verify_supabase_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_profile(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> ProfileOut:
    """
    Resolve the authenticated user's profile from the Bearer token.

    Args:
        credentials: Bearer token from the Authorization header.
        db: SQLAlchemy session.

    Returns:
        The authenticated user's ProfileOut schema.

    Raises:
        HTTPException: If the token is missing, invalid, or the profile is not found.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    claims = verify_supabase_token(credentials.credentials)
    email = claims.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not contain an email address.",
        )

    profile = get_profile_by_email(db, email)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. Please sign in again.",
        )

    return to_profile_out(profile)