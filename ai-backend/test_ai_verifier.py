import os
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from ai_verifier import verify_repair, verify_submitted_proof


class VerifySubmittedProofTest(unittest.TestCase):
    def test_text_only_completion_claim_requires_visual_verification(self):
        result = verify_submitted_proof(
            complaint_text="Pothole on Anna Nagar road",
            proof_text="The pothole was fixed and the road repair is completed.",
            proof_hash="abc123def4567890",
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertFalse(result["approved"])
        self.assertTrue(result["requires_human_review"])
        self.assertIn("missing_before_after_images", result["blocking_reasons"])

    def test_rejects_incomplete_work_text(self):
        result = verify_submitted_proof(
            complaint_text="Streetlight is broken",
            proof_text="Repair is partial and still pending.",
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertFalse(result["approved"])

    def test_rejects_missing_one_image(self):
        result = verify_submitted_proof(
            complaint_text="Drain is blocked",
            before_image_path="before.jpg",
            proof_text="The drain was cleared.",
        )

        self.assertEqual(result["verdict"], "rejected")
        self.assertIn("missing_before_or_after_image", result["blocking_reasons"])

    def test_identical_before_after_images_cannot_verify_repair(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            before_path = os.path.join(temp_dir, "before.jpg")
            after_path = os.path.join(temp_dir, "after.jpg")
            image = Image.new("RGB", (240, 240), color=(80, 80, 80))
            image.save(before_path, format="JPEG")
            image.save(after_path, format="JPEG")

            with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}):
                result = verify_repair("Broken streetlight", before_path, after_path)

        self.assertFalse(result["fixed"])
        self.assertEqual(result["decision"], "review")
        self.assertIn("identical_before_after_images", result["blocking_reasons"])


if __name__ == "__main__":
    unittest.main()
