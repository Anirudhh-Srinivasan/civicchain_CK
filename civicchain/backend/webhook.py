from __future__ import annotations

import base64
import base58
import hashlib
import json
import sqlite3
import struct
import sys
import uuid
from pathlib import Path
from typing import Any, Iterable

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


PROGRAM_ID = "12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm"
DB_PATH = Path(__file__).with_name("complaints.db")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
AI_BACKEND_PATHS = (
    PROJECT_ROOT / "ai-backend",
    PROJECT_ROOT.parent / "ai-backend",
)
SUBMIT_COMPLAINT_DISCRIMINATOR = hashlib.sha256(
    b"global:submit_complaint"
).digest()[:8]

app = FastAPI(title="CivicChain Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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


class VerifyRequest(BaseModel):
    complaint_text: str
    before_image_path: str
    after_image_path: str
    complaint_pubkey: str
    bid_pubkey: str
    escrow_pubkey: str
    contractor_pubkey: str


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_ai_workflow():
    for path in AI_BACKEND_PATHS:
        if path.exists() and str(path) not in sys.path:
            sys.path.insert(0, str(path))

    try:
        from ai_verifier import run_ai_workflow
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="AI backend not found. Expected ai_verifier.py in ai-backend/.",
        ) from exc

    return run_ai_workflow


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
                estimated_fund REAL DEFAULT 0,
                bid_amount REAL,
                contractor_pubkey TEXT,
                ai_confidence REAL,
                ai_reasoning TEXT,
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
            "estimated_fund": "ALTER TABLE complaints ADD COLUMN estimated_fund REAL DEFAULT 0",
            "bid_amount": "ALTER TABLE complaints ADD COLUMN bid_amount REAL",
            "contractor_pubkey": "ALTER TABLE complaints ADD COLUMN contractor_pubkey TEXT",
            "ai_confidence": "ALTER TABLE complaints ADD COLUMN ai_confidence REAL",
            "ai_reasoning": "ALTER TABLE complaints ADD COLUMN ai_reasoning TEXT",
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
        "estimated_fund": row["estimated_fund"],
        "bid_amount": row["bid_amount"],
        "contractor_pubkey": row["contractor_pubkey"],
        "ai_confidence": row["ai_confidence"],
        "ai_reasoning": row["ai_reasoning"],
        "payment_released": bool(row["payment_released"]),
        "signature": row["signature"],
        "slot": row["slot"],
        "created_at": row["created_at"],
    }


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
    run_ai_workflow = load_ai_workflow()
    ai_result = run_ai_workflow(
        request.complaint_text,
        request.before_image_path,
        request.after_image_path,
    )

    should_release = bool(
        ai_result.get("fund_decision", {}).get("release_payment")
    )
    payment_signature = None

    if should_release:
        release_payment = load_release_payment()
        payment_signature = release_payment(
            complaint_pubkey=request.complaint_pubkey,
            bid_pubkey=request.bid_pubkey,
            escrow_pubkey=request.escrow_pubkey,
            contractor_pubkey=request.contractor_pubkey,
        )

    return {
        "ai_result": ai_result,
        "payment_released": should_release,
        "payment_signature": payment_signature,
    }


@app.post("/complaint")
def create_complaint(request: ManualComplaintRequest) -> dict[str, Any]:
    init_db()
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
                estimated_fund,
                signature,
                slot,
                raw_transaction
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                complaint_pubkey,
                request.citizen_pubkey,
                request.title,
                request.description,
                request.location,
                request.category or "pothole",
                "Open",
                request.photo_url,
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
