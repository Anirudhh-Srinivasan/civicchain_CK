"""Direct SOL payouts from a single government-controlled wallet.

This is intentionally simpler than the full Anchor escrow flow in
``escrow.py``: instead of requiring on-chain complaint/bid/escrow PDAs,
CivicChain keeps one government wallet funded, and once the AI verifier
trusts a contractor's proof, this module sends the bid amount directly
from that wallet to the contractor's wallet as a native SOL transfer.

Configure with two env vars (see ``.env.example``):
  GOVERNMENT_WALLET_SECRET_KEY - the government wallet's private key,
      either Phantom's base58 "Export Private Key" string, or a
      solana-keygen style JSON byte array (e.g. "[12,34,...]").
  SOLANA_RPC_URL - defaults to the public devnet endpoint.

Never commit a real secret key to the repo. Set it only as a Railway
(or local .env, gitignored) environment variable.
"""

from __future__ import annotations

import json
import os

from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction

LAMPORTS_PER_SOL = 1_000_000_000


class PayoutError(RuntimeError):
    """Raised when a direct government-wallet payout cannot be sent."""


def _rpc_url() -> str:
    return os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")


def _load_government_keypair() -> Keypair:
    secret = os.getenv("GOVERNMENT_WALLET_SECRET_KEY", "").strip()
    if not secret:
        raise PayoutError("GOVERNMENT_WALLET_SECRET_KEY is not configured")

    try:
        if secret.startswith("["):
            return Keypair.from_bytes(bytes(json.loads(secret)))
        return Keypair.from_base58_string(secret)
    except Exception as exc:  # noqa: BLE001 - surface as a clean payout error
        raise PayoutError(f"GOVERNMENT_WALLET_SECRET_KEY is invalid: {exc}") from exc


def government_wallet_address() -> str | None:
    """Return the government wallet's public address, or None if unconfigured."""
    try:
        return str(_load_government_keypair().pubkey())
    except PayoutError:
        return None


def get_government_wallet_balance_sol() -> float | None:
    """Return the government wallet's current devnet/mainnet balance in SOL."""
    keypair = _load_government_keypair()
    client = Client(_rpc_url())
    resp = client.get_balance(keypair.pubkey(), commitment=Confirmed)
    return resp.value / LAMPORTS_PER_SOL


def send_direct_payout(contractor_pubkey: str, amount_sol: float) -> str:
    """Send ``amount_sol`` SOL from the government wallet to a contractor.

    Returns the transaction signature on success. Raises PayoutError on
    any failure (bad config, invalid destination, insufficient funds,
    RPC/network error).
    """
    if amount_sol <= 0:
        raise PayoutError("Payout amount must be greater than zero")

    try:
        destination = Pubkey.from_string(contractor_pubkey)
    except Exception as exc:  # noqa: BLE001
        raise PayoutError(f"Invalid contractor wallet address: {contractor_pubkey}") from exc

    keypair = _load_government_keypair()
    client = Client(_rpc_url())

    lamports = int(round(amount_sol * LAMPORTS_PER_SOL))

    try:
        blockhash_resp = client.get_latest_blockhash(commitment=Confirmed)
        blockhash = blockhash_resp.value.blockhash

        instruction = transfer(
            TransferParams(
                from_pubkey=keypair.pubkey(),
                to_pubkey=destination,
                lamports=lamports,
            )
        )
        message = Message.new_with_blockhash([instruction], keypair.pubkey(), blockhash)
        transaction = Transaction([keypair], message, blockhash)

        result = client.send_transaction(
            transaction,
            opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed),
        )
        return str(result.value)
    except PayoutError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize all RPC/SDK errors
        raise PayoutError(f"Payout transaction failed: {exc}") from exc


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Send a direct CivicChain government payout")
    parser.add_argument("contractor_pubkey")
    parser.add_argument("amount_sol", type=float)
    args = parser.parse_args()

    signature = send_direct_payout(args.contractor_pubkey, args.amount_sol)
    print(signature)
