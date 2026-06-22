import os
import base64
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

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


def extract_json(response_text):
    response_text = response_text.strip()

    start = response_text.find("{")
    end = response_text.rfind("}") + 1

    if start == -1 or end == 0:
        raise ValueError("No JSON object found in AI response")

    json_text = response_text[start:end]
    return json.loads(json_text)


def call_groq_vision(complaint_text, before_url, after_url):
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