# CivicChain Backend

FastAPI backend for indexing CivicChain `submit_complaint` transactions from Helius webhooks and triggering escrow release calls on Solana devnet.

## Setup

Use Python 3.10 or newer.

```bash
cd civicchain
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

The escrow script reads the Solana wallet from:

```text
~/.config/solana/id.json
```

The Anchor IDL is expected at:

```text
target/idl/civicchain.json
```

If it is missing, regenerate it from the project root:

```bash
anchor build
```

## Run the API

```bash
uvicorn backend.webhook:app --reload --host 0.0.0.0 --port 8000
```

The local SQLite database is created automatically at `backend/complaints.db`.

## Endpoints

```text
POST /webhook
GET  /complaints
GET  /complaints/{id}
```

`POST /webhook` accepts Helius webhook payloads. It scans incoming transactions for CivicChain `submit_complaint` instructions, decodes the Anchor instruction arguments, and stores each complaint locally.

## Configure Helius

1. Start the API locally.
2. Expose it publicly for webhook testing, for example:

   ```bash
   ngrok http 8000
   ```

3. In the Helius dashboard, create a webhook with this URL:

   ```text
   https://YOUR_NGROK_DOMAIN/webhook
   ```

4. Filter the webhook to the CivicChain devnet program:

   ```text
   12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm
   ```

5. Submit a complaint on devnet, then check:

   ```bash
   curl http://localhost:8000/complaints
   ```

## Release Escrow Payment

Call from Python:

```python
from backend.escrow import release_payment

signature = release_payment(
    complaint_pubkey="...",
    bid_pubkey="...",
    escrow_pubkey="...",
    contractor_pubkey="...",
)
print(signature)
```

Or from the command line:

```bash
python backend/escrow.py <complaint_pubkey> <bid_pubkey> <escrow_pubkey> <contractor_pubkey>
```

The transaction is sent to Solana devnet using the wallet at `~/.config/solana/id.json`.
