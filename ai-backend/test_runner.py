import json
import os

from ai_verifier import verify_repair


TEST_CASES = [
    {
        "case_id": "pothole_01",
        "complaint_text": "Large pothole on the road needs to be repaired",
        "before_path": "test_images/pothole_01/before.jpg",
        "after_path": "test_images/pothole_01/after.jpg",
        "expected_fixed": False,
    }
]


def main():
    all_results = []
    correct_count = 0
    wrong_count = 0

    for case in TEST_CASES:
        print("=" * 60)
        print("Running test case:", case["case_id"])

        result = verify_repair(
            case["complaint_text"],
            case["before_path"],
            case["after_path"],
        )

        actual_fixed = result.get("fixed")
        expected_fixed = case["expected_fixed"]

        if actual_fixed == expected_fixed:
            test_status = "PASS"
            correct_count += 1
        else:
            test_status = "FAIL"
            wrong_count += 1

        result["case_id"] = case["case_id"]
        result["complaint_text"] = case["complaint_text"]
        result["expected_fixed"] = expected_fixed
        result["actual_fixed"] = actual_fixed
        result["test_status"] = test_status

        all_results.append(result)

        print("Expected Fixed:", expected_fixed)
        print("Actual Fixed:", actual_fixed)
        print("Test Status:", test_status)
        print("Issue Type:", result.get("issue_type"))
        print("Confidence:", result.get("confidence"))
        print("Decision:", result.get("decision"))
        print("Reasoning:", result.get("reasoning"))

    summary = {
        "total_tests": len(TEST_CASES),
        "correct": correct_count,
        "wrong": wrong_count,
        "accuracy_percent": round((correct_count / len(TEST_CASES)) * 100, 2),
    }

    output = {
        "summary": summary,
        "results": all_results,
    }

    os.makedirs("test_results", exist_ok=True)
    with open("test_results/results.json", "w") as result_file:
        json.dump(output, result_file, indent=4)

    print("=" * 60)
    print("Testing complete")
    print("Summary:", summary)
    print("Results saved to test_results/results.json")

    return 0 if wrong_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
