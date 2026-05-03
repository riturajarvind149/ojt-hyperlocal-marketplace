import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Set VITE_GOOGLE_CLIENT_ID in client/.env to enable Google Sign-In.
// Get your client ID at: https://console.cloud.google.com/
//   1. APIs & Services → Credentials → Create OAuth 2.0 Client ID
//   2. Application type: Web application
//   3. Authorized JavaScript origins: http://localhost:5173
//   4. Copy the Client ID into client/.env as VITE_GOOGLE_CLIENT_ID=...
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const isGoogleConfigured =
  GOOGLE_CLIENT_ID.length > 0 && GOOGLE_CLIENT_ID !== "your_google_client_id_here";

function Root() {
  if (isGoogleConfigured) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    );
  }
  // No valid client ID — render without provider.
  // GoogleLoginButton will show a disabled placeholder automatically.
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
