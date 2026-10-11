"""Screenshots captured during live audits: local disk in development, Cloud Storage when deployed.

Either way the browser loads them from /api/audits/{id}/frames/{n}.jpg, so they
stay same-origin (the PDF crops them on a canvas) and no signed URLs are needed.
The methods block; callers run them in a thread.
"""

from pathlib import Path
from typing import Protocol

from google.cloud import storage


def frame_url(audit_id: str, n: int) -> str:
    return f"/api/audits/{audit_id}/frames/{n}.jpg"


class FrameStore(Protocol):
    def save(self, audit_id: str, n: int, jpeg: bytes) -> str:
        """Store frame n of an audit; return the URL the browser loads it from."""
        ...

    def read(self, audit_id: str, n: int) -> bytes | None: ...


class LocalFrameStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def save(self, audit_id: str, n: int, jpeg: bytes) -> str:
        folder = self.root / audit_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{n}.jpg").write_bytes(jpeg)
        return frame_url(audit_id, n)

    def read(self, audit_id: str, n: int) -> bytes | None:
        file = self.root / audit_id / f"{n}.jpg"
        return file.read_bytes() if file.is_file() else None


class GcsFrameStore:
    """gs://<bucket>/<prefix>audits/{auditId}/frames/{n}.jpg (the bucket's lifecycle rule deletes old ones)."""

    def __init__(self, bucket: str, *, project: str, prefix: str = "", client: storage.Client | None = None) -> None:
        self._bucket = (client or storage.Client(project=project)).bucket(bucket)
        self._prefix = prefix

    def _blob(self, audit_id: str, n: int) -> storage.Blob:
        return self._bucket.blob(f"{self._prefix}audits/{audit_id}/frames/{n}.jpg")

    def save(self, audit_id: str, n: int, jpeg: bytes) -> str:
        self._blob(audit_id, n).upload_from_string(jpeg, content_type="image/jpeg")
        return frame_url(audit_id, n)

    def read(self, audit_id: str, n: int) -> bytes | None:
        blob = self._blob(audit_id, n)
        try:
            return blob.download_as_bytes()
        except Exception as err:
            if getattr(err, "code", None) == 404:
                return None
            raise
