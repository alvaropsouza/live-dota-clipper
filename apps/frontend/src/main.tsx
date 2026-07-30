import "./index.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient()

const root = document.getElementById("root")
if (!root) throw new Error("no root element")

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background p-8">
        <h1 className="text-2xl font-bold">Dota VOD Processor</h1>
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
