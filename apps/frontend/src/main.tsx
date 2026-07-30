import "./index.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import Root from "./App"

const container = document.getElementById("root")
if (!container) throw new Error("no root element")

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
