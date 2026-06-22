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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/citizen" replace />} />
            <Route path="/citizen/*" element={<CitizenPortal />} />
            <Route path="/contractor/*" element={<ContractorPortal />} />
            <Route path="/government/*" element={<GovernmentPortal />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  </React.StrictMode>,
);
