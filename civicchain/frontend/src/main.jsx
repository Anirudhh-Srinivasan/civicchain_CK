import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import AppShell from "./layouts/AppShell.jsx";
import CitizenPortal from "./pages/CitizenPortal.jsx";
import ContractorPortal from "./pages/ContractorPortal.jsx";
import GovernmentPortal from "./pages/GovernmentPortal.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { getSession, pathForRole } from "./services/auth.js";

function Providers({ children }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
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
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={pathForRole(session.role)} replace />;
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
