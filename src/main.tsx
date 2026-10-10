import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./app/styles.css";
import "./app/pwa/index";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(<App />);


