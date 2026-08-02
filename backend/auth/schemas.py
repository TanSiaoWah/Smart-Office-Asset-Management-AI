"""Pydantic schemas for authentication and user profiles."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class GoogleTokenRequest(BaseModel):
    """Request body containing a Supabase access token from Google SSO."""

    access_token: str


class ProfileOut(BaseModel):
    """Public profile response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str
    avatar_url: str | None = None
    role: str
    created_at: datetime
    updated_at: datetime


class AuthResponse(BaseModel):
    """Response returned after successful Google SSO authentication."""

    profile: ProfileOut


class ProfileUpdateRequest(BaseModel):
    """Request body for updating the user's profile name."""

    name: str
