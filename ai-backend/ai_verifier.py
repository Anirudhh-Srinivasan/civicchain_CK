import base64
import hashlib
import json
import os
import re
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None
try:
    from groq import Groq
except ImportError:
    Groq = None
try:
    from PIL import Image
except ImportError:
    Image = None

if load_dotenv is not None:
    load_dotenv()

MODEL_NAME = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
APPROVAL_THRESHOLD = int(os.getenv("AI_APPROVAL_THRESHOLD", "85"))
MIN_IMAGE_WIDTH = int(os.getenv("AI_MIN_IMAGE_WIDTH", "160"))
MIN_IMAGE_HEIGHT = int(os.getenv("AI_MIN_IMAGE_HEIGHT", "160"))
MAX_IMAGE_BYTES = int(os.getenv("AI_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
SUPPORTED_IMAGE_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
}
RATE_CARD = {
    "Chennai": {
        "pothole": {
            "low": 3000,
            "medium": 7000,
            "high": 10000,
        },
        "flooding": {
            "low": 5000,
            "medium": 12000,
            "high": 25000,
        },
        "garbage": {
            "low": 2000,
            "medium": 5000,
            "high": 9000,
        },
        "water leak": {
            "low": 6000,
            "medium": 15000,
            "high": 30000,
        },
        "streetlight": {
            "low": 2500,
            "medium": 6000,
            "high": 12000,
        },
    }
}


def calculate_fund(issue_type, severity, location):
    issue_type = issue_type.lower()
    severity = severity.lower()
    location = location.title()

    city_rates = RATE_CARD.get(location)

    if not city_rates:
        return 0

    for known_issue in city_rates:
        if known_issue in issue_type:
            return city_rates[known_issue].get(severity, 0)

    return 0


def clamp_int(value, default=0, minimum=0, maximum=100):
    try:
        value = int(round(float(value)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "fixed", "complete", "completed"}
    return False


def clean_text(value, fallback=""):
    if value is None:
        return fallback
    return str(value).strip() or fallback


def image_error(reasoning, code, confidence=0, **extra):
    result = {
        "issue_type": "unknown",
        "fixed": False,
        "same_location": False,
        "issue_matches_complaint": False,
        "after_shows_completed_work": False,
        "confidence": clamp_int(confidence),
        "decision": "review",
        "reasoning": reasoning,
        "error": code,
        "blocking_reasons": [code],
    }
    result.update(extra)
    return result


def inspect_image(image_path):
    path = Path(image_path)
    if not path.exists():
        return None, image_error(f"Image not found: {image_path}", "image_not_found")
    if not path.is_file():
        return None, image_error(f"Image path is not a file: {image_path}", "image_not_file")

    size = path.stat().st_size
    if size <= 0:
        return None, image_error(f"Image file is empty: {image_path}", "image_empty")
    if size > MAX_IMAGE_BYTES:
        return None, image_error(
            f"Image file is too large. Maximum allowed size is {MAX_IMAGE_BYTES} bytes.",
            "image_too_large",
        )
    if Image is None:
        return None, image_error("Pillow is not installed, so image validation cannot run.", "pillow_missing")

    try:
        with Image.open(path) as image:
            width, height = image.size
            image_format = image.format
            image.verify()
    except Exception as exc:
        return None, image_error("Uploaded proof is not a valid image.", "invalid_image", details=str(exc))

    mime_type = SUPPORTED_IMAGE_FORMATS.get(image_format)
    if mime_type is None:
        return None, image_error(
            "Only JPEG and PNG proof images are supported.",
            "unsupported_image_format",
            image_format=image_format,
        )
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        return None, image_error(
            f"Image is too small. Minimum size is {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT} pixels.",
            "image_too_small",
            width=width,
            height=height,
        )

    return {
        "path": str(path),
        "mime_type": mime_type,
        "width": width,
        "height": height,
        "bytes": size,
        "format": image_format,
    }, None


def file_sha256(image_path):
    digest = hashlib.sha256()
    with open(image_path, "rb") as image_file:
        for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def image_data_url(image_path):
    metadata, error = inspect_image(image_path)
    if error:
        return None, error
    return f"data:{metadata['mime_type']};base64,{encode_image(image_path)}", None


def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    if Groq is None:
        raise RuntimeError("groq package is not installed")
    return Groq(api_key=api_key)


def extract_json(response_text):
    response_text = clean_text(response_text)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", response_text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        response_text = fenced.group(1).strip()

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass

    start = response_text.find("{")
    end = response_text.rfind("}") + 1

    if start == -1 or end == 0:
        raise ValueError("No JSON object found in AI response")

    return json.loads(response_text[start:end])


def call_groq_vision(complaint_text, before_url, after_url):
    client = get_groq_client()
    if client is None:
        raise RuntimeError("GROQ_API_KEY is not configured")

    completion = client.chat.completions.create(
        model=MODEL_NAME,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
You are a strict civic infrastructure verification assistant.

Reported complaint:
{complaint_text}

Compare the two images. Image 1 is BEFORE repair work. Image 2 is AFTER repair work.

Approval rules:
1. Approve only when the after image clearly shows the reported issue fully fixed.
2. Minor improvement, partial work, temporary covering, work in progress, or unclear evidence is not fixed.
3. If the images are not the same place, mark same_location false and fixed false.
4. If the visible issue does not match the complaint, mark issue_matches_complaint false and fixed false.
5. If the after image does not clearly show completed work, mark after_shows_completed_work false and fixed false.
6. Treat cropped, blurry, dark, obstructed, or low-evidence photos as not fixed.
7. Confidence is your confidence in the verification result, from 0 to 100.

Return only this JSON object:

{{
  "issue_type": "",
  "fixed": false,
  "same_location": false,
  "issue_matches_complaint": false,
  "after_shows_completed_work": false,
  "confidence": 0,
  "evidence": "",
  "risks": [],
  "reasoning": ""
}}
""",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": before_url,
                        },
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": after_url,
                        },
                    },
                ],
            }
        ],
    )

    return completion.choices[0].message.content


def normalize_model_verification(result):
    fixed_claim = coerce_bool(result.get("fixed"))
    same_location = coerce_bool(result.get("same_location"))
    issue_matches = coerce_bool(result.get("issue_matches_complaint"))
    completed = coerce_bool(result.get("after_shows_completed_work"))
    confidence = clamp_int(result.get("confidence"))
    risks = result.get("risks") if isinstance(result.get("risks"), list) else []

    blockers = []
    if not same_location:
        blockers.append("location_mismatch_or_unclear")
    if not issue_matches:
        blockers.append("issue_mismatch_or_unclear")
    if not completed:
        blockers.append("after_image_does_not_show_completed_work")
    if not fixed_claim:
        blockers.append("reported_issue_not_visibly_fixed")
    if confidence < APPROVAL_THRESHOLD:
        blockers.append("confidence_below_threshold")
    if risks:
        blockers.append("verification_risks_present")

    approved = not blockers
    reasoning = clean_text(result.get("reasoning")) or clean_text(result.get("evidence"))
    if not reasoning:
        reasoning = "AI verification completed with strict before/after evidence checks."

    return {
        "issue_type": clean_text(result.get("issue_type"), "unknown"),
        "fixed": approved,
        "same_location": same_location,
        "issue_matches_complaint": issue_matches,
        "after_shows_completed_work": completed,
        "confidence": confidence,
        "reasoning": reasoning,
        "evidence": clean_text(result.get("evidence")),
        "risks": risks,
        "decision": "approve" if approved else "review",
        "blocking_reasons": blockers,
        "approval_threshold": APPROVAL_THRESHOLD,
    }


def verify_repair(complaint_text, before_path, after_path):
    before_url, before_error = image_data_url(before_path)
    if before_error:
        return before_error

    after_url, after_error = image_data_url(after_path)
    if after_error:
        return after_error

    try:
        if file_sha256(before_path) == file_sha256(after_path):
            return image_error(
                "The before and after proof images are identical, so they cannot prove completed repair work.",
                "identical_before_after_images",
                confidence=98,
                same_location=True,
                issue_matches_complaint=True,
            )
    except OSError as exc:
        return image_error("Could not compare before and after image hashes.", "image_hash_failed", details=str(exc))

    if get_groq_client() is None:
        return image_error(
            "GROQ_API_KEY is not configured, so vision verification cannot approve this proof.",
            "groq_api_key_missing",
        )

    last_error = None
    raw_response = None

    for _ in range(2):
        try:
            raw_response = call_groq_vision(complaint_text, before_url, after_url)
            return normalize_model_verification(extract_json(raw_response))
        except Exception as exc:
            last_error = str(exc)

    return image_error(
        "AI verification failed after retry.",
        "ai_verification_failed",
        details=last_error,
        raw_response=raw_response,
    )


def analyze_complaint(complaint_text, image_path):
    client = get_groq_client()
    if client is None:
        return {
            "issue_type": "unknown",
            "severity": "unknown",
            "estimated_required_fund": 0,
            "priority": "normal",
            "confidence": 0,
            "reasoning": "GROQ_API_KEY is not configured; complaint analysis was skipped.",
        }

    image_url, image_validation_error = image_data_url(image_path)
    if image_validation_error:
        return {
            "issue_type": "unknown",
            "severity": "unknown",
            "estimated_required_fund": 0,
            "priority": "normal",
            "confidence": 0,
            "reasoning": image_validation_error.get("reasoning"),
            "error": image_validation_error.get("error"),
        }

    completion = client.chat.completions.create(
        model=MODEL_NAME,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
You are an AI civic infrastructure cost estimation assistant.

A citizen has reported a civic issue.

Citizen complaint:
{complaint_text}

Analyze the image carefully.

Your task:
1. Identify the civic infrastructure issue type.
2. Estimate severity as low, medium, or high.
3. Estimate the exact repair fund required in Indian Rupees.
4. Do not return a range. Return one exact integer value only.
5. Consider visible damage size, material requirement, labor effort, urgency, location impact, and repair complexity.
6. Set priority as low, normal, urgent, or emergency.
7. Give confidence from 0 to 100.
8. Explain briefly.

Important:
- estimated_required_fund must be a number only.
- Do not write ranges or approximate phrases.
- Return exactly one integer like 8500.

Return only JSON in this exact format:

{{
  "issue_type": "",
  "severity": "",
  "estimated_required_fund": 0,
  "priority": "",
  "confidence": 0,
  "reasoning": ""
}}
""",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                        },
                    },
                ],
            }
        ],
    )

    response_text = completion.choices[0].message.content.strip()

    try:
        result = extract_json(response_text)

        return {
            "issue_type": clean_text(result.get("issue_type"), "unknown"),
            "severity": clean_text(result.get("severity"), "unknown"),
            "estimated_required_fund": max(0, int(float(result.get("estimated_required_fund", 0)))),
            "priority": clean_text(result.get("priority"), "normal"),
            "confidence": clamp_int(result.get("confidence")),
            "reasoning": clean_text(result.get("reasoning")),
        }

    except Exception as exc:
        return {
            "error": "Complaint analysis failed",
            "details": str(exc),
            "raw_response": response_text,
        }


def run_ai_workflow(complaint_text, complaint_image_path, contractor_image_path):
    complaint_analysis = analyze_complaint(
        complaint_text,
        complaint_image_path,
    )

    work_verification = verify_repair(
        complaint_text,
        complaint_image_path,
        contractor_image_path,
    )

    initial_fund = complaint_analysis.get("estimated_required_fund", 0)
    release_payment = work_verification.get("decision") == "approve"

    return {
        "complaint_analysis": complaint_analysis,
        "work_verification": work_verification,
        "fund_decision": {
            "initial_estimated_fund": initial_fund,
            "release_payment": release_payment,
            "payment_action": "release_payment" if release_payment else "hold_for_review",
        },
    }


def _keyword_verdict(complaint_text, proof_text):
    proof = clean_text(proof_text).lower()
    if not proof:
        return False, 20, "No proof note was provided."

    negative_terms = (
        "not fixed",
        "not repaired",
        "not resolved",
        "not completed",
        "pending",
        "incomplete",
        "partial",
        "blocked",
        "failed",
        "temporary",
        "work remains",
        "still needs",
    )
    positive_terms = (
        "fixed",
        "repaired",
        "resolved",
        "completed",
        "restored",
        "cleared",
        "done",
    )

    if any(term in proof for term in negative_terms):
        return False, 35, "Submitted proof text says the work is not fully complete."
    if any(term in proof for term in positive_terms):
        return True, 55, "Submitted proof text claims completion, but before/after image verification is required."
    return False, 35, "Proof text does not clearly claim the reported work was completed."


def normalize_verdict(work_verification, source="groq"):
    confidence = clamp_int(work_verification.get("confidence"))
    blockers = work_verification.get("blocking_reasons")
    if not isinstance(blockers, list):
        blockers = []

    approved = (
        source == "groq"
        and work_verification.get("decision") == "approve"
        and bool(work_verification.get("fixed"))
        and confidence >= APPROVAL_THRESHOLD
        and not blockers
    )
    verdict = "approved" if approved else "rejected"

    return {
        "verdict": verdict,
        "approved": approved,
        "rejected": not approved,
        "requires_human_review": not approved,
        "confidence": round(confidence / 100, 2),
        "confidence_score": confidence,
        "approval_threshold": APPROVAL_THRESHOLD,
        "reasoning": work_verification.get("reasoning")
        or work_verification.get("error")
        or "AI verification completed.",
        "issue_type": work_verification.get("issue_type", "unknown"),
        "same_location": bool(work_verification.get("same_location")),
        "issue_matches_complaint": bool(work_verification.get("issue_matches_complaint")),
        "after_shows_completed_work": bool(work_verification.get("after_shows_completed_work")),
        "blocking_reasons": blockers,
        "source": source,
        "trusted_ai": approved,
        "raw": work_verification,
    }


def verify_submitted_proof(
    complaint_text,
    before_image_path=None,
    after_image_path=None,
    proof_text="",
    proof_hash=None,
):
    has_before = bool(before_image_path)
    has_after = bool(after_image_path)
    has_images = has_before and has_after

    if has_before != has_after:
        return normalize_verdict(
            image_error(
                "Both before and after images are required for AI verification.",
                "missing_before_or_after_image",
                confidence=20,
            ),
            source="local_review",
        )

    if has_images:
        result = verify_repair(complaint_text, before_image_path, after_image_path)
        source = "groq" if os.getenv("GROQ_API_KEY") and not result.get("error") else "local_review"
        return normalize_verdict(result, source=source)

    text_claimed_complete, confidence, reasoning = _keyword_verdict(complaint_text, proof_text or "")
    blockers = ["missing_before_after_images"]
    if text_claimed_complete:
        blockers.append("text_claim_requires_visual_confirmation")
    if proof_hash and len(str(proof_hash).strip()) >= 16:
        confidence = min(60, confidence + 5)
        reasoning = f"{reasoning} A proof hash was provided for auditability."

    return normalize_verdict(
        {
            "issue_type": "unknown",
            "fixed": False,
            "same_location": False,
            "issue_matches_complaint": False,
            "after_shows_completed_work": False,
            "confidence": confidence,
            "reasoning": reasoning,
            "decision": "review",
            "blocking_reasons": blockers,
        },
        source="text_only",
    )


if __name__ == "__main__":
    result = run_ai_workflow(
        "Large pothole on the road causing danger to vehicles",
        "images/before.jpg",
        "images/after.jpg",
    )

    print(json.dumps(result, indent=4))

    os.makedirs("test_results", exist_ok=True)
    with open("test_results/workflow_result.json", "w") as result_file:
        json.dump(result, result_file, indent=4)

    print("Workflow result saved to test_results/workflow_result.json")
