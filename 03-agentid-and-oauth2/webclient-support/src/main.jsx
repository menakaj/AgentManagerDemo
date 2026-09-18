import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@asgardeo/auth-react";
import "./index.css";
import App from "./App.jsx";
import { asgardeoConfig } from "./authConfig.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider config={asgardeoConfig}>
      <App />
    </AuthProvider>
  </StrictMode>
);
