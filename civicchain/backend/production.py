from __future__ import annotations

import os
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware


def _data_root() -> Path:
    configured = os.getenv("RAILWAY_VOLUME_MOUNT_PATH") or os.getenv("CIVICCHAIN_DATA_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path("/tmp/civicchain-data")


data_root = _data_root()
data_root.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("CIVICCHAIN_UPLOAD_ROOT", str(data_root / "uploads"))

from backend import webhook  # noqa: E402

webhook.DB_PATH = Path(
    os.getenv("CIVICCHAIN_DB_PATH", str(data_root / "complaints.db"))
).resolve()
webhook.DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = webhook.app

configured_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins
    or [
        "https://civicchain-ck.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    webhook.init_db()
    return {
        "status": "ok",
        "service": "CivicChain Backend",
    }
