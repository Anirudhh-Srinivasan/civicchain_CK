from __future__ import annotations

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_URL = "http://localhost:8000"


def request_json(method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        f"{API_URL}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=20) as response:
      return response.status, json.loads(response.read().decode("utf-8"))


def report(name: str, ok: bool, detail: str = "") -> bool:
    print(f"{'PASS' if ok else 'FAIL'} - {name}{': ' + detail if detail else ''}")
    return ok


def main() -> int:
    passed = []
    try:
        status, complaint = request_json(
            "POST",
            "/complaint",
            {
                "title": "Integration test pothole",
                "description": "Pothole reported by full flow integration test.",
                "location": "Anna Nagar, Chennai",
                "category": "pothole",
                "citizen_pubkey": "IntegrationCitizenWallet",
            },
        )
        passed.append(report("POST /complaint", status == 200 and "id" in complaint, str(complaint)))

        _, complaints = request_json("GET", "/complaints")
        found = any(item.get("id") == complaint.get("id") for item in complaints)
        passed.append(report("GET /complaints contains created complaint", found))

        status, bid = request_json(
            "POST",
            f"/complaints/{complaint['id']}/bid",
            {
                "amount": 0.42,
                "contractor_pubkey": "IntegrationContractorWallet",
            },
        )
        passed.append(report("POST /complaints/{id}/bid", status == 200 and bid.get("status") == "Assigned", str(bid)))

        try:
            status, verification = request_json(
                "POST",
                "/verify",
                {
                    "complaint_id": complaint["id"],
                    "complaint_text": complaint["description"],
                    "before_image_name": "before.jpg",
                    "after_image_name": "after.jpg",
                    "proof_text": "The pothole repair is completed and the road surface is fixed.",
                    "proof_hash": "integration-proof-hash-0001",
                    "complaint_pubkey": complaint["complaint_pubkey"],
                    "contractor_pubkey": "IntegrationContractorWallet",
                },
            )
            verified = (
                status == 200
                and verification.get("approved") is True
                and verification.get("complaint", {}).get("status") == "Verified"
            )
            passed.append(report("POST /verify approves proof", verified, str(verification)))
        except HTTPError as error:
            detail = error.read().decode("utf-8")
            passed.append(report("POST /verify", False, detail))

    except (HTTPError, URLError, TimeoutError, KeyError) as error:
        passed.append(report("Full flow setup", False, str(error)))

    return 0 if all(passed) else 1


if __name__ == "__main__":
    sys.exit(main())
