from __future__ import annotations

import base64
import base58
import hashlib
import json
import os
import sqlite3
import struct
import sys
import uuid
from pathlib import Path
from typing import Any, Iterable

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv(Path(__file__).with_name(".env"))

try:
    from PIL import Image
except ImportError:
    Image = None

PROGRAM_ID = os.getenv("CIVICCHAIN_PROGRAM_ID", "12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm")
DB_PATH = Path(__file__).with_name("complaints.db")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
AI_BACKEND_PATHS = (
    PROJECT_ROOT / "ai-backend",
    PROJECT_ROOT.parent / "ai-backend",
)
UPLOAD_ROOT = Path(os.getenv("CIVICCHAIN_UPLOAD_ROOT", str(DB_PATH.parent / "uploads"))).resolve()
PAYMENT_RELEASE_CONFIDENCE_THRESHOLD = float(
    os.getenv("PAYMENT_RELEASE_CONFIDENCE_THRESHOLD", "0.85")
)
MAX_PROOF_IMAGE_BYTES = int(os.getenv("MAX_PROOF_IMAGE_BYTES", str(8 * 1024 * 1024)))
MIN_PROOF_IMAGE_WIDTH = int(os.getenv("MIN_PROOF_IMAGE_WIDTH", "160"))
MIN_PROOF_IMAGE_HEIGHT = int(os.getenv("MIN_PROOF_IMAGE_HEIGHT", "160"))
ALLOWED_PROOF_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
SUBMIT_COMPLAINT_DISCRIMINATOR = hashlib.sha256(
    b"global:submit_complaint"
).digest()[:8]

app = FastAPI(title="CivicChain Backend")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ManualComplaintRequest(BaseModel):
    title: str
    description: str
    location: str
    category: str | None = None
    citizen_pubkey: str | None = None
    photo_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class VerifyRequest(BaseModel):
    complaint_id: int | None = None
    complaint_text: str | None = None
    before_image_path: str | None = None
    after_image_path: str | None = None
    before_image_name: str | None = None
    after_image_name: str | None = None
    proof_text: str | None = None
    proof_hash: str | None = None
    complaint_pubkey: str | None = None
    bid_pubkey: str | None = None
    escrow_pubkey: str | None = None
    contractor_pubkey: str | None = None


class BidRequest(BaseModel):
    amount: float
    contractor_pubkey: str | None = None


class ProofRequest(BaseModel):
    before_image_name: str | None = None
    after_image_name: str | None = None
    proof_text: str | None = None
    proof_hash: str | None = None


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_ai_verifier():
    for path in AI_BACKEND_PATHS:
        if path.exists() and str(path) not in sys.path:
            sys.path.insert(0, str(path))

    try:
        from ai_verifier import run_ai_workflow, verify_submitted_proof
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="AI backend not found. Expected ai_verifier.py in ai-backend/.",
        ) from exc

    return run_ai_workflow, verify_submitted_proof


def load_release_payment():
    try:
        from backend.escrow import release_payment
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="Escrow backend unavailable. Check backend/escrow.py dependencies.",
        ) from exc

    return release_payment


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_pubkey TEXT UNIQUE NOT NULL,
                citizen_pubkey TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                location TEXT NOT NULL,
                category TEXT DEFAULT 'pothole',
                status TEXT DEFAULT 'Open',
                photo_url TEXT,
                latitude REAL,
                longitude REAL,
                estimated_fund REAL DEFAULT 0,
                bid_amount REAL,
                contractor_pubkey TEXT,
                ai_confidence REAL,
                ai_reasoning TEXT,
                ai_source TEXT,
                verification_status TEXT,
                verification_checked_at TEXT,
                proof_hash TEXT,
                before_image_path TEXT,
                after_image_path TEXT,
                payment_released INTEGER DEFAULT 0,
                signature TEXT,
                slot INTEGER,
                raw_transaction TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(complaints)")
        }
        migrations = {
            "category": "ALTER TABLE complaints ADD COLUMN category TEXT DEFAULT 'pothole'",
            "status": "ALTER TABLE complaints ADD COLUMN status TEXT DEFAULT 'Open'",
            "photo_url": "ALTER TABLE complaints ADD COLUMN photo_url TEXT",
            "latitude": "ALTER TABLE complaints ADD COLUMN latitude REAL",
            "longitude": "ALTER TABLE complaints ADD COLUMN longitude REAL",
            "estimated_fund": "ALTER TABLE complaints ADD COLUMN estimated_fund REAL DEFAULT 0",
            "bid_amount": "ALTER TABLE complaints ADD COLUMN bid_amount REAL",
            "contractor_pubkey": "ALTER TABLE complaints ADD COLUMN contractor_pubkey TEXT",
            "ai_confidence": "ALTER TABLE complaints ADD COLUMN ai_confidence REAL",
            "ai_reasoning": "ALTER TABLE complaints ADD COLUMN ai_reasoning TEXT",
            "ai_source": "ALTER TABLE complaints ADD COLUMN ai_source TEXT",
            "verification_status": "ALTER TABLE complaints ADD COLUMN verification_status TEXT",
            "verification_checked_at": "ALTER TABLE complaints ADD COLUMN verification_checked_at TEXT",
            "proof_hash": "ALTER TABLE complaints ADD COLUMN proof_hash TEXT",
            "before_image_path": "ALTER TABLE complaints ADD COLUMN before_image_path TEXT",
            "after_image_path": "ALTER TABLE complaints ADD COLUMN after_image_path TEXT",
            "payment_released": "ALTER TABLE complaints ADD COLUMN payment_released INTEGER DEFAULT 0",
        }
        for column, statement in migrations.items():
            if column not in existing_columns:
                conn.execute(statement)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_complaints_pubkey ON complaints(complaint_pubkey)"
        )


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "complaint_pubkey": row["complaint_pubkey"],
        "citizen_pubkey": row["citizen_pubkey"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "category": row["category"],
        "status": row["status"],
        "photo_url": row["photo_url"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "estimated_fund": row["estimated_fund"],
        "bid_amount": row["bid_amount"],
        "contractor_pubkey": row["contractor_pubkey"],
        "ai_confidence": row["ai_confidence"],
        "ai_reasoning": row["ai_reasoning"],
        "ai_source": row["ai_source"],
        "verification_status": row["verification_status"],
        "verification_checked_at": row["verification_checked_at"],
        "proof_hash": row["proof_hash"],
        "before_image_path": row["before_image_path"],
        "after_image_path": row["after_image_path"],
        "payment_released": bool(row["payment_released"]),
        "signature": row["signature"],
        "slot": row["slot"],
        "created_at": row["created_at"],
    }


def require_text(value: str | None, field: str) -> str:
    if value is None or not value.strip():
        raise HTTPException(status_code=400, detail=f"{field} is required")
    return value.strip()


def valid_solana_pubkey(value: str | None) -> bool:
    if not value or value.startswith("manual:") or value.startswith("local:"):
        return False
    try:
        decoded = base58.b58decode(value)
    except Exception:
        return False
    return len(decoded) == 32


def optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def is_relative_to(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def normalize_allowed_image_path(value: str | None) -> str | None:
    value = optional_text(value)
    if value is None:
        return None

    raw_path = Path(value).expanduser()
    candidates = [raw_path] if raw_path.is_absolute() else [
        (PROJECT_ROOT / raw_path),
        (PROJECT_ROOT.parent / raw_path),
        (UPLOAD_ROOT / raw_path),
    ]
    allowed_roots = [UPLOAD_ROOT, PROJECT_ROOT, *AI_BACKEND_PATHS]

    for candidate in candidates:
        resolved = candidate.resolve()
        if not resolved.exists():
            continue
        if any(is_relative_to(resolved, root.resolve()) for root in allowed_roots if root.exists()):
            return str(resolved)

    raise HTTPException(
        status_code=400,
        detail="Image paths must point to existing proof images inside the project upload folders.",
    )


def validate_proof_image(file_path: Path) -> None:
    if Image is None:
        raise HTTPException(
            status_code=500,
            detail="Pillow is required to validate proof images. Install backend requirements.",
        )

    try:
        with Image.open(file_path) as image:
            width, height = image.size
            image_format = image.format
            image.verify()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Proof upload is not a valid image") from exc

    if image_format not in {"JPEG", "PNG"}:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG proof images are allowed")
    if width < MIN_PROOF_IMAGE_WIDTH or height < MIN_PROOF_IMAGE_HEIGHT:
        raise HTTPException(
            status_code=400,
            detail=f"Proof image is too small. Minimum size is {MIN_PROOF_IMAGE_WIDTH}x{MIN_PROOF_IMAGE_HEIGHT} pixels.",
        )


def save_uploaded_image(folder: str, label: str, upload: UploadFile) -> str:
    extension = Path(upload.filename or "").suffix.lower()
    if extension not in ALLOWED_PROOF_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG proof images are allowed")

    target_dir = UPLOAD_ROOT / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{label}-{uuid.uuid4().hex}{extension}"

    total = 0
    try:
        with target_path.open("wb") as target_file:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_PROOF_IMAGE_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Proof image is too large. Maximum size is {MAX_PROOF_IMAGE_BYTES} bytes.",
                    )
                target_file.write(chunk)
        validate_proof_image(target_path)
    except HTTPException:
        if target_path.exists():
            target_path.unlink()
        raise
    except Exception as exc:
        if target_path.exists():
            target_path.unlink()
        raise HTTPException(status_code=400, detail="Proof image could not be saved") from exc

    return str(target_path)


def save_proof_image(complaint_id: int, label: str, upload: UploadFile) -> str:
    return save_uploaded_image(f"proofs/{complaint_id}", label, upload)


def public_upload_url(file_path: str) -> str:
    path = Path(file_path).resolve()
    relative = path.relative_to(UPLOAD_ROOT).as_posix()
    return f"/uploads/{relative}"


def confidence_value(ai_result: dict[str, Any]) -> float:
    confidence = ai_result.get("confidence")
    if confidence is None:
        confidence = ai_result.get("confidence_score", 0)
        try:
            return float(confidence) / 100
        except (TypeError, ValueError):
            return 0

    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        return 0

    return confidence / 100 if confidence > 1 else confidence


def is_trusted_ai_approval(ai_result: dict[str, Any]) -> bool:
    return bool(
        ai_result.get("approved")
        and ai_result.get("source") == "groq"
        and ai_result.get("trusted_ai")
        and not ai_result.get("requires_human_review")
        and confidence_value(ai_result) >= PAYMENT_RELEASE_CONFIDENCE_THRESHOLD
    )


def should_attempt_release(request: VerifyRequest, ai_result: dict[str, Any]) -> bool:
    if not is_trusted_ai_approval(ai_result):
        return False
    if not request.proof_hash or len(request.proof_hash.strip()) < 16:
        return False
    if os.getenv("CIVICCHAIN_ENABLE_ESCROW_RELEASE", "").lower() not in {"1", "true", "yes"}:
        return False
    return all(
        valid_solana_pubkey(value)
        for value in (
            request.complaint_pubkey,
            request.bid_pubkey,
            request.escrow_pubkey,
            request.contractor_pubkey,
        )
    )


def find_complaint_for_verification(conn: sqlite3.Connection, request: VerifyRequest) -> sqlite3.Row | None:
    if request.complaint_id is not None:
        return conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (request.complaint_id,),
        ).fetchone()
    if request.complaint_pubkey:
        return conn.execute(
            "SELECT * FROM complaints WHERE complaint_pubkey = ?",
            (request.complaint_pubkey,),
        ).fetchone()
    return None


def read_anchor_string(data: bytes, offset: int) -> tuple[str, int]:
    if offset + 4 > len(data):
        raise ValueError("string length is missing")

    length = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    end = offset + length

    if end > len(data):
        raise ValueError("string data is incomplete")

    return data[offset:end].decode("utf-8"), end


def decode_submit_complaint_args(encoded_data: str) -> dict[str, str] | None:
    instruction_data = decode_instruction_data(encoded_data)
    if not instruction_data:
        return None

    if instruction_data[:8] != SUBMIT_COMPLAINT_DISCRIMINATOR:
        return None

    offset = 8
    title, offset = read_anchor_string(instruction_data, offset)
    description, offset = read_anchor_string(instruction_data, offset)
    location, _ = read_anchor_string(instruction_data, offset)

    return {
        "title": title,
        "description": description,
        "location": location,
    }


def decode_instruction_data(encoded_data: str) -> bytes | None:
    if not encoded_data:
        return None

    for decoder in (base58.b58decode, base64.b64decode):
        try:
            return decoder(encoded_data)
        except Exception:
            continue

    return None


def get_signature(transaction: dict[str, Any]) -> str | None:
    if isinstance(transaction.get("signature"), str):
        return transaction["signature"]

    signatures = (
        transaction.get("transaction", {})
        .get("signatures")
    )
    if isinstance(signatures, list) and signatures:
        return signatures[0]

    nested = (
        transaction.get("transaction", {})
        .get("transaction", {})
        .get("signatures")
    )
    if isinstance(nested, list) and nested:
        return nested[0]

    return None


def get_slot(transaction: dict[str, Any]) -> int | None:
    slot = transaction.get("slot")
    return slot if isinstance(slot, int) else None


def normalize_account(account: Any) -> str | None:
    if isinstance(account, str):
        return account
    if isinstance(account, dict):
        for key in ("pubkey", "account", "address"):
            value = account.get(key)
            if isinstance(value, str):
                return value
    return None


def transaction_account_keys(transaction: dict[str, Any]) -> list[str]:
    message = (
        transaction.get("transaction", {})
        .get("message", {})
    )
    nested_message = (
        transaction.get("transaction", {})
        .get("transaction", {})
        .get("message", {})
    )
    account_keys = message.get("accountKeys") or nested_message.get("accountKeys") or []

    return [
        account
        for account in (normalize_account(item) for item in account_keys)
        if account is not None
    ]


def extract_accounts(
    instruction: dict[str, Any],
    account_keys: list[str],
) -> list[str]:
    accounts = instruction.get("accounts") or instruction.get("accountKeys") or []
    resolved = []

    for account in accounts:
        if isinstance(account, int) and account < len(account_keys):
            resolved.append(account_keys[account])
            continue

        normalized = normalize_account(account)
        if normalized is not None:
            resolved.append(normalized)

    return resolved


def instruction_program_id(
    instruction: dict[str, Any],
    account_keys: list[str],
) -> str | None:
    for key in ("programId", "program_id"):
        value = instruction.get(key)
        if isinstance(value, str):
            return value

    program_index = instruction.get("programIdIndex")
    if isinstance(program_index, int) and program_index < len(account_keys):
        return account_keys[program_index]

    return None


def walk_instructions(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        if "data" in value and any(
            key in value for key in ("programId", "program_id", "programIdIndex")
        ):
            yield value

        for item in value.values():
            yield from walk_instructions(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_instructions(item)


def extract_complaints(transaction: dict[str, Any]) -> list[dict[str, Any]]:
    complaints: list[dict[str, Any]] = []
    signature = get_signature(transaction)
    slot = get_slot(transaction)
    account_keys = transaction_account_keys(transaction)

    for instruction in walk_instructions(transaction):
        if instruction_program_id(instruction, account_keys) != PROGRAM_ID:
            continue

        decoded = decode_submit_complaint_args(str(instruction.get("data", "")))
        if decoded is None:
            continue

        accounts = extract_accounts(instruction, account_keys)
        complaints.append(
            {
                "complaint_pubkey": accounts[0] if len(accounts) > 0 else "",
                "citizen_pubkey": accounts[1] if len(accounts) > 1 else None,
                "title": decoded["title"],
                "description": decoded["description"],
                "location": decoded["location"],
                "signature": signature,
                "slot": slot,
                "raw_transaction": json.dumps(transaction),
            }
        )

    return complaints


@app.post("/webhook")
async def helius_webhook(request: Request) -> dict[str, Any]:
    init_db()
    payload = await request.json()
    transactions = payload if isinstance(payload, list) else [payload]

    saved = 0
    with get_db() as conn:
        for transaction in transactions:
            if not isinstance(transaction, dict):
                continue

            for complaint in extract_complaints(transaction):
                if not complaint["complaint_pubkey"]:
                    continue

                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO complaints (
                        complaint_pubkey,
                        citizen_pubkey,
                        title,
                        description,
                        location,
                        category,
                        status,
                        estimated_fund,
                        signature,
                        slot,
                        raw_transaction
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        complaint["complaint_pubkey"],
                        complaint["citizen_pubkey"],
                        complaint["title"],
                        complaint["description"],
                        complaint["location"],
                        "pothole",
                        "Open",
                        0,
                        complaint["signature"],
                        complaint["slot"],
                        complaint["raw_transaction"],
                    ),
                )
                saved += cursor.rowcount if cursor.rowcount > 0 else 0

    return {"ok": True, "saved": saved}


@app.post("/verify")
def verify_complaint(request: VerifyRequest) -> dict[str, Any]:
    init_db()
    _, verify_submitted_proof = load_ai_verifier()

    with get_db() as conn:
        row = find_complaint_for_verification(conn, request)

    if row is not None and row["status"] not in ("Assigned", "Completed", "Verified"):
        raise HTTPException(
            status_code=400,
            detail="Proof can only be verified after a bid has been assigned",
        )

    complaint_text = request.complaint_text or (row["description"] if row else None)
    complaint_text = require_text(complaint_text, "complaint_text")
    proof_text = request.proof_text or ""
    if not proof_text and (request.before_image_name or request.after_image_name):
        proof_text = (
            f"Before image: {request.before_image_name or 'not provided'}. "
            f"After image: {request.after_image_name or 'not provided'}. "
            "Only filenames were submitted, so visual verification still requires uploaded image content."
        )

    if not proof_text and not (request.before_image_path and request.after_image_path):
        raise HTTPException(
            status_code=400,
            detail="Submit proof_text or both before_image_path and after_image_path",
        )

    before_image_path = normalize_allowed_image_path(request.before_image_path)
    after_image_path = normalize_allowed_image_path(request.after_image_path)

    ai_result = verify_submitted_proof(
        complaint_text=complaint_text,
        before_image_path=before_image_path,
        after_image_path=after_image_path,
        proof_text=proof_text,
        proof_hash=request.proof_hash,
    )

    release_eligible = bool(
        is_trusted_ai_approval(ai_result)
        and request.proof_hash
        and len(request.proof_hash.strip()) >= 16
    )
    should_release = should_attempt_release(request, ai_result)
    payment_signature = None
    payment_error = None

    if should_release:
        try:
            release_payment = load_release_payment()
            payment_signature = release_payment(
                complaint_pubkey=request.complaint_pubkey or "",
                bid_pubkey=request.bid_pubkey or "",
                escrow_pubkey=request.escrow_pubkey or "",
                contractor_pubkey=request.contractor_pubkey or "",
                ai_confidence=int(ai_result.get("confidence_score") or confidence_value(ai_result) * 100),
                proof_hash=request.proof_hash or "",
            )
        except Exception as exc:
            payment_error = str(exc)
            should_release = False

    updated_complaint = None
    if row is not None:
        next_status = "Verified" if ai_result.get("approved") else "Completed"
        payment_released = bool(payment_signature or row["payment_released"])
        with get_db() as conn:
            conn.execute(
                """
                UPDATE complaints
                SET status = ?,
                    ai_confidence = ?,
                    ai_reasoning = ?,
                    ai_source = ?,
                    verification_status = ?,
                    verification_checked_at = CURRENT_TIMESTAMP,
                    proof_hash = ?,
                    before_image_path = ?,
                    after_image_path = ?,
                    payment_released = ?
                WHERE id = ?
                """,
                (
                    next_status,
                    ai_result.get("confidence"),
                    ai_result.get("reasoning"),
                    ai_result.get("source"),
                    ai_result.get("verdict"),
                    request.proof_hash,
                    before_image_path,
                    after_image_path,
                    1 if payment_released else 0,
                    row["id"],
                ),
            )
            updated = conn.execute(
                "SELECT * FROM complaints WHERE id = ?",
                (row["id"],),
            ).fetchone()
            updated_complaint = row_to_dict(updated)

    payment_released_response = bool(
        payment_signature
        or (updated_complaint and updated_complaint.get("payment_released"))
    )

    return {
        "ai_result": ai_result,
        "verdict": ai_result.get("verdict"),
        "approved": bool(ai_result.get("approved")),
        "confidence": ai_result.get("confidence"),
        "ai_source": ai_result.get("source"),
        "requires_human_review": bool(ai_result.get("requires_human_review")),
        "release_eligible": release_eligible,
        "release_threshold": PAYMENT_RELEASE_CONFIDENCE_THRESHOLD,
        "payment_released": payment_released_response,
        "payment_signature": payment_signature,
        "payment_error": payment_error,
        "complaint": updated_complaint,
    }


@app.post("/complaints/{complaint_id}/verify-proof")
def verify_uploaded_proof(
    complaint_id: int,
    before_image: UploadFile = File(...),
    after_image: UploadFile = File(...),
    complaint_text: str | None = Form(None),
    proof_text: str | None = Form(None),
    proof_hash: str | None = Form(None),
    complaint_pubkey: str | None = Form(None),
    bid_pubkey: str | None = Form(None),
    escrow_pubkey: str | None = Form(None),
    contractor_pubkey: str | None = Form(None),
) -> dict[str, Any]:
    init_db()
    before_path = None
    after_path = None
    try:
        before_path = save_proof_image(complaint_id, "before", before_image)
        after_path = save_proof_image(complaint_id, "after", after_image)
    except HTTPException:
        for saved_path in (before_path, after_path):
            if saved_path and Path(saved_path).exists():
                Path(saved_path).unlink()
        raise

    request = VerifyRequest(
        complaint_id=complaint_id,
        complaint_text=optional_text(complaint_text),
        before_image_path=before_path,
        after_image_path=after_path,
        proof_text=optional_text(proof_text),
        proof_hash=optional_text(proof_hash),
        complaint_pubkey=optional_text(complaint_pubkey),
        bid_pubkey=optional_text(bid_pubkey),
        escrow_pubkey=optional_text(escrow_pubkey),
        contractor_pubkey=optional_text(contractor_pubkey),
    )
    try:
        return verify_complaint(request)
    except HTTPException:
        for saved_path in (before_path, after_path):
            if saved_path and Path(saved_path).exists():
                Path(saved_path).unlink()
        raise



@app.post("/complaint-upload")
def create_complaint_upload(
    title: str = Form(...),
    description: str = Form(...),
    location: str = Form(...),
    category: str | None = Form(None),
    citizen_pubkey: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    photo: UploadFile = File(...),
) -> dict[str, Any]:
    saved_path = save_uploaded_image("complaints", "issue", photo)
    try:
        return create_complaint(
            ManualComplaintRequest(
                title=title,
                description=description,
                location=location,
                category=category,
                citizen_pubkey=citizen_pubkey,
                photo_url=public_upload_url(saved_path),
                latitude=latitude,
                longitude=longitude,
            )
        )
    except HTTPException:
        if Path(saved_path).exists():
            Path(saved_path).unlink()
        raise
@app.post("/complaint")
def create_complaint(request: ManualComplaintRequest) -> dict[str, Any]:
    init_db()
    title = require_text(request.title, "title")
    description = require_text(request.description, "description")
    location = require_text(request.location, "location")
    complaint_pubkey = f"manual:{uuid.uuid4()}"

    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO complaints (
                complaint_pubkey,
                citizen_pubkey,
                title,
                description,
                location,
                category,
                status,
                photo_url,
                latitude,
                longitude,
                estimated_fund,
                signature,
                slot,
                raw_transaction
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                complaint_pubkey,
                request.citizen_pubkey,
                title,
                description,
                location,
                request.category or "pothole",
                "Open",
                request.photo_url,
                request.latitude,
                request.longitude,
                0,
                None,
                None,
                json.dumps({"source": "manual"}),
            ),
        )
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=500, detail="Complaint was not saved")

    return row_to_dict(row)


@app.get("/complaints")
def list_complaints() -> list[dict[str, Any]]:
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM complaints ORDER BY id DESC"
        ).fetchall()
        return [row_to_dict(row) for row in rows]


@app.get("/complaints/{complaint_id}")
def get_complaint(complaint_id: int) -> dict[str, Any]:
    init_db()
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Complaint not found")

    return row_to_dict(row)


@app.post("/complaints/{complaint_id}/bid")
def place_bid(complaint_id: int, request: BidRequest) -> dict[str, Any]:
    init_db()
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Bid amount must be greater than zero")

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Complaint not found")
        if row["status"] not in ("Open", "Assigned"):
            raise HTTPException(
                status_code=400,
                detail="Only open or assigned complaints can receive bids",
            )

        conn.execute(
            """
            UPDATE complaints
            SET status = 'Assigned',
                bid_amount = ?,
                contractor_pubkey = ?,
                estimated_fund = CASE WHEN estimated_fund > 0 THEN estimated_fund ELSE ? END
            WHERE id = ?
            """,
            (
                request.amount,
                request.contractor_pubkey or "DemoContractorWallet",
                request.amount,
                complaint_id,
            ),
        )
        updated = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()

    return row_to_dict(updated)


@app.post("/complaints/{complaint_id}/proof")
def submit_proof(complaint_id: int, request: ProofRequest) -> dict[str, Any]:
    init_db()
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Complaint not found")
        if row["status"] not in ("Assigned", "Completed", "Verified"):
            raise HTTPException(
                status_code=400,
                detail="Proof can only be submitted after a bid is assigned",
            )

        proof_text = request.proof_text or ""
        if not proof_text and not (request.before_image_name and request.after_image_name):
            raise HTTPException(
                status_code=400,
                detail="Submit proof text or before/after proof image names",
            )

        reasoning = "Proof submitted and queued for AI verification."
        if request.before_image_name and request.after_image_name:
            reasoning = (
                f"Proof submitted with before image '{request.before_image_name}' "
                f"and after image '{request.after_image_name}'. Awaiting AI verification."
            )

        conn.execute(
            """
            UPDATE complaints
            SET status = 'Completed',
                ai_confidence = NULL,
                ai_reasoning = ?,
                ai_source = NULL,
                verification_status = 'queued',
                verification_checked_at = NULL,
                proof_hash = ?,
                before_image_path = NULL,
                after_image_path = NULL
            WHERE id = ?
            """,
            (reasoning, request.proof_hash, complaint_id),
        )
        updated = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (complaint_id,),
        ).fetchone()

    return row_to_dict(updated)

