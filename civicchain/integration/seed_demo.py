from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def database_path() -> Path:
    configured = os.getenv("CIVICCHAIN_DB_PATH")
    if configured:
        return Path(configured).resolve()

    data_root = os.getenv("RAILWAY_VOLUME_MOUNT_PATH") or os.getenv("CIVICCHAIN_DATA_ROOT")
    if data_root:
        return (Path(data_root) / "complaints.db").resolve()

    return ROOT / "backend" / "complaints.db"


DB_PATH = database_path()
PAYMENT_REVIEW_WINDOW_HOURS = float(os.getenv("PAYMENT_REVIEW_WINDOW_HOURS", "24"))



COMPLAINTS = [
    ("Open", "pothole", "Deep pothole near Anna Nagar roundabout", "A large pothole is slowing traffic and causing two-wheelers to swerve during peak hours.", "Anna Nagar, Chennai", 0.42),
    ("Assigned", "flooding", "Storm water stagnation on T Nagar service lane", "Rainwater has remained for two days and is blocking shop entrances near the bus stop.", "T Nagar, Chennai", 0.58),
    ("Completed", "garbage", "Overflowing garbage bins beside Velachery MRTS", "Waste is spilling onto the pavement and attracting pests near the station entrance.", "Velachery, Chennai", 0.31),
    ("Verified", "streetlight", "Streetlights restored on Adyar 2nd Avenue", "Three lights were not working along a dark residential stretch used by pedestrians.", "Adyar, Chennai", 0.27),
    ("Open", "water leak", "Water leak near Tambaram market road", "A damaged pipeline is leaking continuously and creating slippery conditions.", "Tambaram, Chennai", 0.49),
    ("Assigned", "pothole", "Multiple potholes at Mylapore temple street", "The road surface is broken in several places after recent cable work.", "Mylapore, Chennai", 0.44),
    ("Verified", "flooding", "Cleared drain blockage at Guindy subway", "Drainage obstruction caused water to pool near the subway entrance after rainfall.", "Guindy, Chennai", 0.66),
    ("Completed", "garbage", "Construction debris dumped in Porur", "Broken tiles and cement bags have been dumped along the service road.", "Porur, Chennai", 0.38),
    ("Open", "streetlight", "Broken streetlight pole on OMR", "The pole is leaning and the light fixture is damaged near a pedestrian crossing.", "OMR, Chennai", 0.35),
    ("Assigned", "water leak", "Sewage overflow complaint in Chromepet", "Overflow from a manhole is entering the side lane and causing a foul smell.", "Chromepet, Chennai", 0.62),
    ("Verified", "pothole", "Repaired pothole outside Anna Nagar school", "Parents reported a dangerous crater at the school gate that needed urgent patching.", "Anna Nagar, Chennai", 0.33),
    ("Open", "garbage", "Garbage pile behind T Nagar market", "Daily market waste is not being cleared and is blocking part of the lane.", "T Nagar, Chennai", 0.29),
    ("Completed", "water leak", "Leaking valve near Adyar signal", "A valve chamber is leaking onto the main road and reducing water pressure nearby.", "Adyar, Chennai", 0.53),
    ("Assigned", "streetlight", "Dark stretch near Velachery lake road", "Five consecutive streetlights are off, making the walking route unsafe after sunset.", "Velachery, Chennai", 0.41),
    ("Verified", "flooding", "Flooded shoulder cleared in Tambaram", "Blocked shoulder drain caused standing water beside the bus depot.", "Tambaram, Chennai", 0.57),
]


def ensure_schema(conn: sqlite3.Connection) -> None:
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
            review_deadline TEXT,
            dispute_reason TEXT,
            disputed_by TEXT,
            disputed_at TEXT,
            pre_dispute_status TEXT,
            signature TEXT,
            slot INTEGER,
            raw_transaction TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(complaints)")}
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
        "review_deadline": "ALTER TABLE complaints ADD COLUMN review_deadline TEXT",
        "dispute_reason": "ALTER TABLE complaints ADD COLUMN dispute_reason TEXT",
        "disputed_by": "ALTER TABLE complaints ADD COLUMN disputed_by TEXT",
        "disputed_at": "ALTER TABLE complaints ADD COLUMN disputed_at TEXT",
        "pre_dispute_status": "ALTER TABLE complaints ADD COLUMN pre_dispute_status TEXT",
    }
    for column, statement in migrations.items():
        if column not in columns:
            conn.execute(statement)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            wallet_address TEXT PRIMARY KEY,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            role TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contractor_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER NOT NULL,
            citizen_id TEXT NOT NULL,
            contractor_pubkey TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            review TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (complaint_id, citizen_id)
        )
        """
    )


def main() -> None:
    if os.getenv("ENABLE_DEMO_SEED", "false").lower() != "true":
        print("Demo seeding is disabled by default. Set ENABLE_DEMO_SEED=true to seed demo data.")
        return
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        ensure_schema(conn)

        conn.execute(
            "DELETE FROM contractor_ratings WHERE complaint_id IN (SELECT id FROM complaints WHERE complaint_pubkey LIKE 'demo:%')"
        )
        conn.execute("DELETE FROM complaints WHERE complaint_pubkey LIKE 'demo:%'")
        conn.execute("DELETE FROM users WHERE wallet_address LIKE 'ContractorDemoWallet%'")
        for index, (status, category, title, description, location, fund) in enumerate(COMPLAINTS, start=1):
            verified = status == "Verified"
            has_bid = status in {"Assigned", "Completed", "Verified"}
            cursor = conn.execute(
                """
                INSERT INTO complaints (
                    complaint_pubkey, citizen_pubkey, title, description, location,
                    category, status, photo_url, estimated_fund, bid_amount,
                    contractor_pubkey, ai_confidence, ai_reasoning, ai_source,
                    verification_status, verification_checked_at, proof_hash,
                    before_image_path, after_image_path, payment_released,
                    review_deadline, signature, slot, raw_transaction
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"demo:{uuid.uuid4()}",
                    f"CitizenDemoWallet{index:02d}",
                    title,
                    description,
                    location,
                    category,
                    status,
                    f"https://source.unsplash.com/900x600/?Chennai,{category.replace(' ', '%20')}",
                    fund,
                    round(fund * 0.86, 2) if has_bid else None,
                    f"ContractorDemoWallet{index:02d}" if has_bid else None,
                    0.88 + (index % 8) / 100 if verified else None,
                    "Before and after imagery matches the reported issue and shows successful remediation." if verified else None,
                    "groq" if verified else None,
                    "approved" if verified else ("queued" if status == "Completed" else None),
                    datetime.now(timezone.utc).isoformat() if verified else None,
                    f"demo-proof-{index:02d}" if verified else None,
                    None,
                    None,
                    1 if verified else 0,
                    (datetime.now(timezone.utc) + timedelta(hours=PAYMENT_REVIEW_WINDOW_HOURS)).isoformat()
                    if status == "Completed" else None,
                    f"demo-signature-{index:02d}",
                    100000 + index,
                    json.dumps({"source": "seed_demo"}),
                ),
            )
            if has_bid:
                contractor_wallet = f"ContractorDemoWallet{index:02d}"
                conn.execute(
                    "INSERT OR REPLACE INTO users (wallet_address, username, role) VALUES (?, ?, 'contractor')",
                    (contractor_wallet, f"chennai_works_{index:02d}"),
                )
                if status in {"Completed", "Verified"}:
                    conn.execute(
                        """
                        INSERT INTO contractor_ratings (
                            complaint_id, citizen_id, contractor_pubkey, rating, review
                        )
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            cursor.lastrowid,
                            f"CitizenDemoWallet{index:02d}",
                            contractor_wallet,
                            4 + (index % 2),
                            "Demo citizen feedback for completed work.",
                        ),
                    )
    print(f"Seeded {len(COMPLAINTS)} demo complaints into {DB_PATH}")


if __name__ == "__main__":
    main()
