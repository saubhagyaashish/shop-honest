"""One key per product, so history from every audit of it lands in one place."""

import re
from urllib.parse import urlsplit

DEMO_PATH = re.compile(r"^/demo/[a-z0-9-]+/p/[a-z0-9-]+$")
DEMO_HOSTS = ("localhost", "127.0.0.1")
DEMO_DOMAINS = (".web.app", ".firebaseapp.com")


def product_key(url: str) -> str:
    """The demo stores share one history wherever they're served (laptop, preview, live); other sites are host + path."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    path = parts.path.rstrip("/").lower() or "/"
    if DEMO_PATH.match(path) and (host in DEMO_HOSTS or host.endswith(DEMO_DOMAINS)):
        return f"bazaarnest{path}"
    return f"{host}{path}"
