export default function UserIdentity({ identity, walletAddress, className = "" }) {
  const wallet = walletAddress || identity?.wallet_address;
  const username = identity?.username;
  const label = username || (wallet ? `${wallet.slice(0, 5)}…${wallet.slice(-4)}` : "Unknown");

  return (
    <span className={className} title={wallet || undefined}>
      {label}
    </span>
  );
}
