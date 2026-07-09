# CivicChain

CivicChain is a decentralized civic grievance system for Chennai. Citizens report civic issues, contractors bid to resolve them, AI verifies before/after proof, and successful work releases escrowed SOL through the CivicChain Solana program.

Program ID:

```text
12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm
```

## Tech Stack

- Solana + Anchor smart contract: `submit_complaint`, `place_bid`, `accept_bid`, `verify_work`, `release_payment`
- FastAPI backend with SQLite indexing and `/webhook`, `/complaint`, `/complaints`, `/complaints/{id}`, `/verify`, `/complaints/{id}/verify-proof`
- Groq + Llama 4 Vision AI backend through `run_ai_workflow()`
- React + Vite frontend with Tailwind CSS, React Router, Leaflet maps, Axios, and Phantom wallet adapter

## Local Setup

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.webhook:app --reload --host 0.0.0.0 --port 8000
```

The SQLite database lives at `backend/complaints.db`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend expects:

```text
VITE_API_URL=http://localhost:8000
```

### AI Backend

Keep the `ai-backend/` folder next to this project or inside the project root. The FastAPI `/verify` endpoint imports `ai_verifier.py`; uploaded contractor proof goes through:

```python
verify_submitted_proof(complaint_text, before_image_path, after_image_path, proof_text, proof_hash)
```

AI approval is fail-closed: text-only proof is held for review, before/after images must pass validation, and trusted Groq vision approval defaults to an 85% confidence threshold before release can be considered.

### Demo Data

```bash
python integration/seed_demo.py
```

This seeds 15 realistic Chennai complaints across potholes, flooding, garbage, streetlights, and water leaks with mixed statuses.

### Full Flow Test

Start the backend first, then run:

```bash
python integration/full_flow_test.py
```

The script prints pass/fail for complaint creation, complaint listing, and AI verification.

## Demo Flow

1. Open the Citizen Portal at `/citizen`.
2. Connect Phantom, submit a complaint with title, description, Chennai location, category, and photo.
3. View the complaint in My Complaints and on the Chennai map.
4. Switch to the Contractor Portal, place a bid on an open complaint, and upload proof.
5. Switch to the Government Portal to inspect overview stats, filters, map, timeline, AI confidence, and fund transparency.
6. Use `/verify` during the demo to show AI-driven payment release logic.

## Team

- P1: Solana smart contract and backend
- P2: AI verification
- P3: Frontend
- P4: DevOps and demo infrastructure
