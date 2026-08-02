"""Database engine, session factory, and declarative base for SQLAlchemy."""
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load .env before reading DATABASE_URL so the env var is available
# regardless of import order.
load_dotenv()

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/smart_pantry",
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """
    FastAPI dependency that yields a database session.

    Yields:
        Session: A SQLAlchemy session, closed after the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()