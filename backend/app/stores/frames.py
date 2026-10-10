"""Screenshots captured during live audits. Local disk now; Cloud Storage in the deploy phase."""

from pathlib import Path
from typing import Protocol


class FrameStore(Protocol):
    def save(self, audit_id: str, n: int, jpeg: bytes) -> str:
        """Store frame n of an audit; return the URL the browser loads it from."""
        ...

    def path(self, audit_id: str, n: int) -> Path | None: ...


class LocalFrameStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def save(self, audit_id: str, n: int, jpeg: bytes) -> str:
        folder = self.root / audit_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{n}.jpg").write_bytes(jpeg)
        return f"/api/audits/{audit_id}/frames/{n}.jpg"

    def path(self, audit_id: str, n: int) -> Path | None:
        file = self.root / audit_id / f"{n}.jpg"
        return file if file.is_file() else None
