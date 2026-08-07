from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import base58
from fastapi import HTTPException

from backend import webhook


def wallet(seed: int) -> str:
    return base58.b58encode(bytes([seed]) * 32).decode()


class CivicFeatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = webhook.DB_PATH
        webhook.DB_PATH = Path(self.temp_dir.name) / "features.db"
        webhook.init_db()
        self.citizen_id = "CTZ-AB12CD"
        self.contractor = wallet(2)
        with webhook.get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO complaints (
                    complaint_pubkey, citizen_pubkey, title, description, location,
                    status, bid_amount, contractor_pubkey, verification_status,
                    review_deadline, bids_json
                )
                VALUES (?, ?, ?, ?, ?, 'Completed', ?, ?, 'approved', ?, '[]')
                """,
                (
                    "manual:test",
                    self.citizen_id,
                    "Test repair",
                    "Repair description",
                    "Chennai",
                    0.2,
                    self.contractor,
                    (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                ),
            )
            self.complaint_id = cursor.lastrowid

    def tearDown(self) -> None:
        webhook.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_username_is_unique_case_insensitively(self) -> None:
        first_wallet = wallet(3)
        second_wallet = wallet(4)
        profile = webhook.save_username(
            first_wallet,
            webhook.UsernameRequest(
                wallet_address=first_wallet,
                username="Road_Team",
                role="contractor",
            ),
        )
        self.assertEqual(profile["username"], "Road_Team")

        with self.assertRaises(HTTPException) as raised:
            webhook.save_username(
                second_wallet,
                webhook.UsernameRequest(
                    wallet_address=second_wallet,
                    username="road_team",
                    role="contractor",
                ),
            )
        self.assertEqual(raised.exception.status_code, 409)

    def test_one_rating_per_citizen_and_job(self) -> None:
        updated = webhook.rate_contractor(
            self.complaint_id,
            webhook.RatingRequest(
                citizen_id=self.citizen_id,
                rating=5,
                review="Good work",
            ),
        )
        self.assertEqual(updated["contractor"]["average_rating"], 5.0)
        self.assertEqual(updated["contractor"]["ratings_count"], 1)

        with self.assertRaises(HTTPException) as raised:
            webhook.rate_contractor(
                self.complaint_id,
                webhook.RatingRequest(citizen_id=self.citizen_id, rating=4),
            )
        self.assertEqual(raised.exception.status_code, 409)

    def test_dispute_blocks_payment_during_review_window(self) -> None:
        updated = webhook.dispute_complaint(
            self.complaint_id,
            webhook.DisputeRequest(
                citizen_id=self.citizen_id,
                reason="The repair has already failed.",
            ),
        )
        self.assertEqual(updated["status"], "Disputed")
        self.assertFalse(updated["payout_eligible"])
        self.assertIn("blocked", updated["payout_status"].lower())

    def test_payment_becomes_eligible_after_review_window(self) -> None:
        with webhook.get_db() as conn:
            conn.execute(
                "UPDATE complaints SET review_deadline = ? WHERE id = ?",
                (
                    (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
                    self.complaint_id,
                ),
            )
            row = conn.execute(
                "SELECT * FROM complaints WHERE id = ?",
                (self.complaint_id,),
            ).fetchone()
        eligible, reason = webhook.payout_eligibility(row)
        self.assertTrue(eligible)
        self.assertEqual(reason, "Eligible for payout")


if __name__ == "__main__":
    unittest.main()
