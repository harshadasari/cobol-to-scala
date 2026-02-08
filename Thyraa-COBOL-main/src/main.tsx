import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error handler for uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent the error from appearing in console if it's a known browser extension issue
  if (event.reason?.message?.includes('message channel closed')) {
    event.preventDefault();
  }
});

// Global error handler for general errors
window.addEventListener('error', (event) => {
  // Suppress known browser extension errors
  if (event.message?.includes('message channel closed')) {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
