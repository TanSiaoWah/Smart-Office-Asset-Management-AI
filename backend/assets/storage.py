"""Supabase Storage service for uploading and managing images."""
import os
import time
import tempfile
import logging

from supabase import create_client, Client

logger = logging.getLogger(__name__)


class SupabaseStorageService:
    """Service for interacting with Supabase Storage buckets."""

    def __init__(self) -> None:
        """Initialize Supabase client from environment variables."""
        self.url: str = os.environ.get("SUPABASE_URL", "")
        self.key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.bucket_name: str = os.environ.get("SUPABASE_BUCKET_NAME", "images")

        if not self.url or not self.key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables."
            )

        self.client: Client = create_client(self.url, self.key)
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Create the bucket if it does not already exist."""
        try:
            buckets = self.client.storage.list_buckets()
            bucket_names = [b.name for b in buckets]
            if self.bucket_name not in bucket_names:
                self.client.storage.create_bucket(
                    self.bucket_name,
                    options={"public": True},
                )
                logger.info("Created Supabase bucket '%s'", self.bucket_name)
            else:
                logger.info("Supabase bucket '%s' already exists", self.bucket_name)
        except Exception as exc:
            logger.warning(
                "Could not verify/create bucket '%s': %s",
                self.bucket_name,
                exc,
            )

    def upload_image(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str = "image/jpeg",
    ) -> str:
        """
        Upload an image to the Supabase storage bucket.

        The supabase-py library expects a file path string for upload, so the
        image bytes are written to a temporary file first.

        Args:
            image_bytes: Raw image bytes to upload.
            filename: Destination filename (e.g. 'detected_20260729_132116.jpg').
            content_type: MIME type of the image.

        Returns:
            Public URL of the uploaded image.

        Raises:
            Exception: If the upload fails.
        """
        # Create a temporary file using mkstemp so we can close the fd immediately
        fd, tmp_path = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)

        try:
            # Write bytes to the temp file
            with open(tmp_path, "wb") as f:
                f.write(image_bytes)

            # Upload using the file path
            self.client.storage.from_(self.bucket_name).upload(
                path=filename,
                file=tmp_path,
                file_options={"content-type": content_type},
            )
        finally:
            # Clean up the temporary file (retry on Windows if still locked)
            self._force_delete(tmp_path)

        # Generate the public URL
        public_url = self.client.storage.from_(self.bucket_name).get_public_url(
            filename
        )
        logger.info("Uploaded '%s' to Supabase bucket '%s'", filename, self.bucket_name)
        return public_url

    @staticmethod
    def _force_delete(path: str, max_retries: int = 5, delay: float = 0.1) -> None:
        """
        Delete a file with retries (handles Windows file locking).

        Args:
            path: Path to the file to delete.
            max_retries: Number of retry attempts.
            delay: Delay in seconds between retries.
        """
        for attempt in range(max_retries):
            try:
                if os.path.exists(path):
                    os.remove(path)
                return
            except PermissionError:
                if attempt < max_retries - 1:
                    time.sleep(delay)
                else:
                    logger.warning(
                        "Could not delete temp file '%s' after %d attempts",
                        path,
                        max_retries,
                    )

    def get_public_url(self, filename: str) -> str:
        """
        Get the public URL for a file in the bucket.

        Args:
            filename: Name of the file in the bucket.

        Returns:
            Public URL string.
        """
        return self.client.storage.from_(self.bucket_name).get_public_url(filename)