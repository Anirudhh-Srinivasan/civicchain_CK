import os
import base64
import json
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None
try:
    from groq import Groq
except ImportError:
    Groq = None

if load_dotenv is not None:
    load_dotenv()

MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct"
APPROVAL_THRESHOLD = 75
RATE_CARD = {
    "Chennai": {
        "pothole": {
            "low": 3000,
            "medium": 7000,
            "high": 10000
        },
        "flooding": {
            "low": 5000,
            "medium": 12000,
            "high": 25000
        },
        "garbage": {
            "low": 2000,
            "medium": 5000,
            "high": 9000
        },
        "water leak": {
            "low": 6000,
            "medium": 15000,
            "high": 30000
        },
        "streetlight": {
            "low": 2500,
            "medium": 6000,
            "high": 12000
        }
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

def encode_image(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    if Groq is None:
        raise RuntimeError("groq package is not installed")
    return Groq(api_key=api_key)


def extract_json(response_text):
    response_text = response_text.strip()

    start = response_text.find("{")
    end = response_text.rfind("}") + 1

    if start == -1 or end == 0:
        raise ValueError("No JSON object found in AI response")

    json_text = response_text[start:end]
    return json.loads(json_text)


def call_groq_vision(complaint_text, before_url, after_url):
    client = get_groq_client()
    if client is None:
        raise RuntimeError("GROQ_API_KEY is not configured")

    completion = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
You are an AI civic infrastructure verification assistant.

Reported complaint:
{complaint_text}

Compare these two images.

Image 1 is the BEFORE image.
Image 2 is the AFTER image.

Your task:
1. Identify the reported infrastructure issue.
2. Check whether the reported issue is visibly fixed in the after image.
3. Be strict. Minor improvement does not count as fully fixed.
4. If repair is only in progress, fixed must be false.
5. If the images do not show the same location or same issue type, fixed must be false.
6. Give a confidence score from 0 to 100.
7. Explain briefly.

Return only JSON in this exact format:

{{
  "issue_type": "",
  "fixed": true,
  "confidence": 0,
  "reasoning": ""
}}
"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": before_url
                        }
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": after_url
                        }
                    }
                ]
            }
        ]
    )

    return completion.choices[0].message.content


def verify_repair(complaint_text, before_path, after_path):
    if not os.path.exists(before_path):
        return {
            "fixed": False,
            "confidence": 0,
            "decision": "review",
            "error": f"Before image not found: {before_path}"
        }
    if not os.path.exists(after_path):
        return {
            "fixed": False,
            "confidence": 0,
            "decision": "review",
            "error": f"After image not found: {after_path}"
        }

    before_image = encode_image(before_path)
    after_image = encode_image(after_path)

    before_url = f"data:image/jpeg;base64,{before_image}"
    after_url = f"data:image/jpeg;base64,{after_image}"

    last_error = None
    raw_response = None

    for attempt in range(2):
        try:
            raw_response = call_groq_vision(complaint_text, before_url, after_url)
            result = extract_json(raw_response)

            fixed = bool(result.get("fixed", False))
            confidence = int(result.get("confidence", 0))

            if fixed and confidence >= APPROVAL_THRESHOLD:
                decision = "approve"
            elif fixed and confidence < APPROVAL_THRESHOLD:
                decision = "review"
            else:
                decision = "review"

            return {
                "issue_type": result.get("issue_type", "unknown"),
                "fixed": fixed,
                "confidence": confidence,
                "reasoning": result.get("reasoning", ""),
                "decision": decision
            }

        except Exception as e:
            last_error = str(e)

    return {
        "fixed": False,
        "confidence": 0,
        "decision": "review",
        "error": "AI verification failed after retry",
        "details": last_error,
        "raw_response": raw_response
    }
def analyze_complaint(complaint_text, image_path):
    client = get_groq_client()
    if client is None:
        return {
            "issue_type": "unknown",
            "severity": "unknown",
            "estimated_required_fund": 0,
            "priority": "normal",
            "confidence": 0,
            "reasoning": "GROQ_API_KEY is not configured; complaint analysis was skipped."
        }

    image = encode_image(image_path)
    image_url = f"data:image/jpeg;base64,{image}"

    completion = client.chat.completions.create(
        model=MODEL_NAME,
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
- Do not write "₹5000-₹10000".
- Do not write "around 5000".
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
"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url
                        }
                    }
                ]
            }
        ]
    )

    response_text = completion.choices[0].message.content.strip()

    try:
        result = extract_json(response_text)

        return {
            "issue_type": result.get("issue_type", "unknown"),
            "severity": result.get("severity", "unknown"),
            "estimated_required_fund": int(result.get("estimated_required_fund", 0)),
            "priority": result.get("priority", "normal"),
            "confidence": int(result.get("confidence", 0)),
            "reasoning": result.get("reasoning", "")
        }

    except Exception as e:
        return {
            "error": "Complaint analysis failed",
            "details": str(e),
            "raw_response": response_text
        }
def run_ai_workflow(complaint_text, complaint_image_path, contractor_image_path):
    complaint_analysis = analyze_complaint(
        complaint_text,
        complaint_image_path
    )

    work_verification = verify_repair(
        complaint_text,
        complaint_image_path,
        contractor_image_path
    )

    initial_fund = complaint_analysis.get("estimated_required_fund", 0)

    if work_verification.get("decision") == "approve":
        payment_action = "release_payment"
        release_payment = True
    else:
        payment_action = "hold_for_review"
        release_payment = False

    return {
        "complaint_analysis": complaint_analysis,
        "work_verification": work_verification,
        "fund_decision": {
            "initial_estimated_fund": initial_fund,
            "release_payment": release_payment,
            "payment_action": payment_action
        }
    }


def _keyword_verdict(complaint_text, proof_text):
    text = f"{complaint_text} {proof_text}".lower()
    negative_terms = ("not fixed", "pending", "incomplete", "partial", "blocked", "failed")
    positive_terms = ("fixed", "repaired", "resolved", "completed", "restored", "cleared", "done")

    if any(term in text for term in negative_terms):
        return False, 35, "Submitted proof indicates the work is not fully complete."
    if any(term in text for term in positive_terms):
        return True, 82, "Submitted proof text indicates the reported work has been completed."
    return False, 45, "Proof was submitted, but it does not clearly confirm completion."


def normalize_verdict(work_verification, source="groq"):
    confidence = work_verification.get("confidence", 0) or 0
    try:
        confidence = int(confidence)
    except (TypeError, ValueError):
        confidence = 0

    approved = bool(work_verification.get("fixed")) and confidence >= APPROVAL_THRESHOLD
    verdict = "approved" if approved else "rejected"
    if work_verification.get("decision") == "review" and not approved:
        verdict = "rejected"

    return {
        "verdict": verdict,
        "approved": approved,
        "rejected": not approved,
        "confidence": round(confidence / 100, 2),
        "confidence_score": confidence,
        "reasoning": work_verification.get("reasoning")
        or work_verification.get("error")
        or "AI verification completed.",
        "issue_type": work_verification.get("issue_type", "unknown"),
        "source": source,
        "raw": work_verification,
    }


def verify_submitted_proof(
    complaint_text,
    before_image_path=None,
    after_image_path=None,
    proof_text="",
    proof_hash=None,
):
    has_images = bool(before_image_path and after_image_path)
    if has_images and os.getenv("GROQ_API_KEY"):
        result = verify_repair(complaint_text, before_image_path, after_image_path)
        return normalize_verdict(result, source="groq")

    approved, confidence, reasoning = _keyword_verdict(complaint_text, proof_text or "")
    if proof_hash and len(str(proof_hash).strip()) >= 16:
        confidence = min(95, confidence + 5)
        reasoning = f"{reasoning} A proof hash was provided for auditability."

    if has_images and not os.getenv("GROQ_API_KEY"):
        reasoning = (
            "GROQ_API_KEY is not configured, so image verification used the local "
            "development heuristic instead of Groq vision. " + reasoning
        )

    return normalize_verdict(
        {
            "issue_type": "unknown",
            "fixed": approved,
            "confidence": confidence,
            "reasoning": reasoning,
            "decision": "approve" if approved else "review",
        },
        source="local_heuristic",
    )
if __name__ == "__main__":
    result = run_ai_workflow(
        "Large pothole on the road causing danger to vehicles",
        "images/before.jpg",
        "images/after.jpg"
    )

    print(json.dumps(result, indent=4))

    with open("test_results/workflow_result.json", "w") as f:
        json.dump(result, f, indent=4)

    print("Workflow result saved to test_results/workflow_result.json")
