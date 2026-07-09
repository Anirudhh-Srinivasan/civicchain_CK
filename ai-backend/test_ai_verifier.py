import unittest

from ai_verifier import verify_submitted_proof


class VerifySubmittedProofTest(unittest.TestCase):
    def test_approves_completed_work_text(self):
        result = verify_submitted_proof(
            complaint_text="Pothole on Anna Nagar road",
            proof_text="The pothole was fixed and the road repair is completed.",
            proof_hash="abc123def4567890",
        )

        self.assertEqual(result["verdict"], "approved")
        self.assertTrue(result["approved"])
        self.assertGreaterEqual(result["confidence"], 0.75)

    def test_rejects_incomplete_work_text(self):
        result = verify_submitted_proof(
            complaint_text="Streetlight is broken",
            proof_text="Repair is partial and still pending.",
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertFalse(result["approved"])


if __name__ == "__main__":
    unittest.main()
