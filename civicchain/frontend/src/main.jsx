import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import AppShell from "./layouts/AppShell.jsx";
import CitizenPortal from "./pages/CitizenPortal.jsx";
import ContractorPortal from "./pages/ContractorPortal.jsx";
import GovernmentPortal from "./pages/GovernmentPortal.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { getSession, pathForRole, clearSession, roles } from "./services/auth.js";

function Providers({ children }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function HomeRedirect() {
  const session = getSession();
  return <Navigate to={session ? pathForRole(session.role) : "/login"} replace />;
}

function RequireRole({ role, children }) {
  const session = getSession();
  const { publicKey, connected } = useWallet();

  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={pathForRole(session.role)} replace />;

  // Contractors use their connected wallet as the bidding identity.
  if (role === "contractor") {
    if (!connected || !publicKey) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-black text-white">Wallet Connection Required</h2>
          <p className="mt-2 text-slate-400">Please connect your screened Solana wallet to access the contractor workspace.</p>
          <div className="mt-6">
            <WalletMultiButton />
          </div>
        </div>
      );
    }
    if (session.id !== publicKey.toBase58()) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-black text-white">Wallet Mismatch</h2>
          <p className="mt-2 text-slate-400 font-medium max-w-md break-all">
            Connected wallet ({publicKey.toBase58()}) does not match session ID ({session.id}).
          </p>
          <p className="mt-1 text-sm text-slate-500">Please connect the correct wallet or log in again.</p>
          <div className="mt-6 flex gap-4">
            <WalletMultiButton />
            <button
              onClick={() => {
                clearSession();
                window.location.reload();
              }}
              className="rounded-lg border border-white/10 px-4 py-2 font-bold text-white hover:bg-white/5"
            >
              Back to Login
            </button>
          </div>
        </div>
      );
    }
  }

  return children;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<HomeRedirect />} />
            <Route path="/citizen/*" element={<RequireRole role="citizen"><CitizenPortal /></RequireRole>} />
            <Route path="/contractor/*" element={<RequireRole role="contractor"><ContractorPortal /></RequireRole>} />
            <Route path="/government/*" element={<RequireRole role="government"><GovernmentPortal /></RequireRole>} />
          </Route>
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  </React.StrictMode>,
);
