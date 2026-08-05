import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { apply, getUiScale } from "./hooks/useUiScale";

// Before first paint, so a saved scale doesn't flash at 1× and jump.
apply(getUiScale());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
