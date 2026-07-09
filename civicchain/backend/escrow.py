from __future__ import annotations

import asyncio
import os
from pathlib import Path

from anchorpy import Context, Program, Provider, Wallet
from anchorpy.idl import Idl
from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey


PROGRAM_ID = Pubkey.from_string(
    os.getenv("CIVICCHAIN_PROGRAM_ID", "12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm")
)
RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
WALLET_PATH = Path(os.getenv("SOLANA_WALLET_PATH", str(Path.home() / ".config" / "solana" / "id.json")))
IDL_PATH = Path(
    os.getenv(
        "CIVICCHAIN_IDL_PATH",
        str(Path(__file__).resolve().parents[1] / "target" / "idl" / "civicchain.json"),
    )
)


def load_wallet(path: Path = WALLET_PATH) -> Wallet:
    keypair = Keypair.from_json(path.read_text())
    return Wallet(keypair)


async def _load_program(client: AsyncClient) -> Program:
    provider = Provider(client, load_wallet())
    idl = Idl.from_json(IDL_PATH.read_text())
    return Program(idl, PROGRAM_ID, provider)


async def release_payment_async(
    complaint_pubkey: str,
    bid_pubkey: str,
    escrow_pubkey: str,
    contractor_pubkey: str,
) -> str:
    async with AsyncClient(RPC_URL) as client:
        program = await _load_program(client)
        citizen = program.provider.wallet.public_key

        signature = await program.rpc["release_payment"](
            ctx=Context(
                accounts={
                    "complaint": Pubkey.from_string(complaint_pubkey),
                    "bid": Pubkey.from_string(bid_pubkey),
                    "escrow": Pubkey.from_string(escrow_pubkey),
                    "contractor": Pubkey.from_string(contractor_pubkey),
                    "citizen": citizen,
                }
            )
        )

        return str(signature)


def release_payment(
    complaint_pubkey: str,
    bid_pubkey: str,
    escrow_pubkey: str,
    contractor_pubkey: str,
) -> str:
    return asyncio.run(
        release_payment_async(
            complaint_pubkey,
            bid_pubkey,
            escrow_pubkey,
            contractor_pubkey,
        )
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Release CivicChain escrow payment")
    parser.add_argument("complaint_pubkey")
    parser.add_argument("bid_pubkey")
    parser.add_argument("escrow_pubkey")
    parser.add_argument("contractor_pubkey")
    args = parser.parse_args()

    tx_signature = release_payment(
        args.complaint_pubkey,
        args.bid_pubkey,
        args.escrow_pubkey,
        args.contractor_pubkey,
    )
    print(tx_signature)
