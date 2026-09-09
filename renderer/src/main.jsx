import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/theme.css";

window.addEventListener("error", (e) => {
  console.error("UNCAUGHT ERROR:", e.message, e.error?.stack ?? "");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED REJECTION:", e.reason?.message ?? e.reason, e.reason?.stack ?? "");
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
