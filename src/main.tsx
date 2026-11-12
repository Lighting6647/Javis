import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { themeStore } from "./services/themeStore";
import "./styles.css";
import "./hud.css";

themeStore.init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
