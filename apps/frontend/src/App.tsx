import { useState } from "react"
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query"

const queryClient = new QueryClient()

const PIPELINE = [
  { status: "pending",       label: "Fila"     },
  { status: "downloading",   label: "Download" },
  { status: "preprocessing", label: "Análise"  },
  { status: "detecting",     label: "Detecção" },
  { status: "cutting",       label: "Corte"    },
  { status: "done",          label: "Pronto"   },
] as const

const RETRYABLE_STEPS = [
  { status: "pending",       label: "Do download" },
  { status: "preprocessing", label: "Da detecção" },
  { status: "cutting",       label: "Do corte"    },
] as const

type Job = {
  id: string
  status: string
  url: string
  createdAt: string
  finishedAt?: string
  progress: number
}
type CutFile = { id: string; path: string; name: string; url: string }

function youtubeThumb(url: string): string | null {
  try {
    const u = new URL(url)
    const id = u.searchParams.get("v") ?? u.pathname.split("/").pop()
    if (!id) return null
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  } catch { return null }
}

async function submitVod(url: string): Promise<{ jobId: string }> {
  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoPath: url }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ jobId: string }>
}

async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<Job>
}

function loadJobIds(): string[] {
  try { return JSON.parse(localStorage.getItem("jobIds") ?? "[]") as string[] }
  catch { return [] }
}

function saveJobIds(ids: string[]) {
  localStorage.setItem("jobIds", JSON.stringify(ids))
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XMarkIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <path d="M2 2L7 7M7 2L2 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending:       "Aguardando",
    downloading:   "Baixando",
    preprocessing: "Analisando",
    detecting:     "Detectando",
    cutting:       "Cortando",
    done:          "Concluído",
    failed:        "Falhou",
  }
  return map[status] ?? status
}

function StatusChip({ status }: { status: string }) {
  let cls = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium "
  if (status === "done")   cls += "bg-primary-muted text-primary"
  else if (status === "failed") cls += "bg-error-muted text-error"
  else if (status === "pending") cls += "bg-surface-2 text-muted"
  else cls += "bg-accent-muted text-accent"
  return <span className={cls}>{statusLabel(status)}</span>
}

function PipelineBar({ status, progress }: { status: string; progress: number }) {
  const failed = status === "failed"
  const allDone = status === "done"
  const currentIdx = PIPELINE.findIndex((s) => s.status === status)
  const hasProgress = (status === "downloading" || status === "detecting") && progress > 0

  return (
    <div className="mt-4">
      {/* Step nodes with connectors */}
      <div className="flex items-start">
        {PIPELINE.map((step, i) => {
          const isDone    = !failed && (allDone || i < currentIdx)
          const isActive  = !failed && !allDone && i === currentIdx

          // Connector before this node (i > 0): filled when step i-1 is done
          const connFilled = !failed && (allDone || i <= currentIdx)
          const connColor  = failed ? "var(--error)" : connFilled ? "var(--primary)" : "var(--border)"

          // Node appearance
          let nodeBg     = "var(--surface-2)"
          let nodeBorder = "var(--border)"
          let labelColor = "var(--dim)"
          if (failed)   { nodeBg = "var(--error-muted)";   nodeBorder = "var(--error)";   labelColor = "var(--error)" }
          else if (isDone)  { nodeBg = "var(--primary)";       nodeBorder = "var(--primary)"; labelColor = "var(--primary)" }
          else if (isActive){ nodeBg = "var(--primary-muted)"; nodeBorder = "var(--primary)"; labelColor = "var(--ink)" }

          return (
            <div key={step.status} className="flex items-start flex-1 min-w-0">
              {/* Connector */}
              {i > 0 && (
                <div className="flex-1 pt-[9px]">
                  <div
                    style={{ height: 1.5, backgroundColor: connColor, transition: "background-color 0.3s" }}
                  />
                </div>
              )}

              {/* Node + label */}
              <div className="flex flex-col items-center shrink-0">
                <div className="relative" style={{ width: 20, height: 20 }}>
                  {/* Pulsing ring for active state */}
                  {isActive && (
                    <div
                      className="step-ring absolute rounded-full"
                      style={{
                        inset: -4,
                        border: "1.5px solid var(--primary)",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {/* Circle */}
                  <div
                    className="relative z-10 flex items-center justify-center rounded-full"
                    style={{
                      width: 20,
                      height: 20,
                      backgroundColor: nodeBg,
                      border: `2px solid ${nodeBorder}`,
                      color: isDone ? "var(--primary-fg)" : failed ? "var(--error-fg)" : nodeBorder,
                      transition: "background-color 0.2s, border-color 0.2s",
                    }}
                  >
                    {isDone  && <CheckIcon />}
                    {isActive && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--primary)" }} />}
                    {failed  && <XMarkIcon />}
                  </div>
                </div>

                {/* Label */}
                <span
                  className="mt-1.5 text-center block"
                  style={{
                    fontSize: 9,
                    lineHeight: 1.2,
                    fontWeight: isActive ? 600 : 400,
                    color: labelColor,
                    maxWidth: 44,
                    transition: "color 0.2s",
                  }}
                >
                  {step.label}
                </span>

                {/* Progress % under label for active + trackable steps */}
                {isActive && progress > 0 && (
                  <span
                    className="block mt-0.5"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--primary)",
                    }}
                  >
                    {progress}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Slim progress track below pipeline for downloadable/detectable states */}
      {hasProgress && (
        <div
          className="mt-3 rounded-full overflow-hidden"
          style={{ height: 2, backgroundColor: "var(--border)" }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor: "var(--primary)",
              borderRadius: 2,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      )}
    </div>
  )
}

function JobCard({ jobId, onDelete }: { jobId: string; onDelete: () => void }) {
  const [showRetryMenu, setShowRetryMenu] = useState(false)

  const { data, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (q) =>
      q.state.data?.status === "done" || q.state.data?.status === "failed" ? false : 3000,
  })

  const { data: files } = useQuery({
    queryKey: ["files", jobId],
    queryFn: async (): Promise<CutFile[]> => {
      const res = await fetch(`/api/jobs/${jobId}/files`)
      if (!res.ok) return []
      return res.json() as Promise<CutFile[]>
    },
    enabled: data?.status === "done",
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
      if (!res.ok && res.status !== 404) throw new Error(await res.text())
    },
    onSuccess: onDelete,
  })

  const retryMutation = useMutation({
    mutationFn: async (targetStatus: string) => {
      const res = await fetch(`/api/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      setShowRetryMenu(false)
      queryClient.invalidateQueries({ queryKey: ["job", jobId] })
    },
  })

  const status = isError ? "failed" : (data?.status ?? "pending")
  const isDone = status === "done"

  return (
    <div
      className="rounded-xl border border-border bg-surface overflow-hidden"
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          {/* URL */}
          <p className="text-sm text-ink truncate flex-1 min-w-0 leading-snug">
            {data?.url ?? jobId}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusChip status={status} />

            {/* Retry */}
            {data && data.status !== "pending" && (
              <div className="relative">
                <button
                  onClick={() => setShowRetryMenu((v) => !v)}
                  disabled={retryMutation.isPending}
                  title="Reiniciar a partir de..."
                  className="flex items-center justify-center w-6 h-6 rounded-md border border-border bg-transparent text-muted hover:text-ink hover:border-ink transition-colors duration-150 disabled:opacity-40 text-sm"
                >
                  ↺
                </button>
                {showRetryMenu && (
                  <div
                    className="absolute right-0 top-7 z-20 rounded-lg border border-border bg-surface overflow-hidden"
                    style={{ minWidth: 160, boxShadow: "0 8px 24px oklch(0 0 0 / 0.18)" }}
                  >
                    <p className="px-3 py-2 text-[10px] font-semibold text-muted border-b border-border">
                      Reiniciar a partir de
                    </p>
                    {RETRYABLE_STEPS.map((step) => (
                      <button
                        key={step.status}
                        onClick={() => retryMutation.mutate(step.status)}
                        className="block w-full px-3 py-2 text-left text-xs text-ink bg-transparent hover:bg-surface-2 transition-colors duration-100"
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              title="Remover job"
              className="flex items-center justify-center w-6 h-6 rounded-md border border-transparent text-dim hover:text-error hover:bg-error-muted hover:border-error-muted transition-colors duration-150 disabled:opacity-40 text-xs"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Job ID */}
        <p className="mt-1 font-mono text-[10px] text-dim">
          {jobId}
        </p>

        {/* Pipeline */}
        {data && <PipelineBar status={data.status} progress={data.progress} />}
      </div>

      {/* Done state: thumbnail + files */}
      {isDone && (
        <div className="border-t border-border px-4 pb-4 pt-4">
          {(() => {
            const thumb = data?.url ? youtubeThumb(data.url) : null
            return thumb ? (
              <div className="relative h-28 rounded-lg overflow-hidden mb-4">
                <img src={thumb} alt="thumbnail da VOD" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.65) 0%, transparent 55%)" }} />
                <span className="absolute bottom-2.5 left-3 text-xs font-semibold text-white">
                  VOD completa
                </span>
              </div>
            ) : null
          })()}

          {files && files.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-muted mb-2.5">
                {files.length} partida{files.length !== 1 ? "s" : ""} detectada{files.length !== 1 ? "s" : ""}
              </p>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" }}
              >
                {files.map((f, i) => (
                  <a
                    key={f.id}
                    href={f.url}
                    download={f.name}
                    className="group flex flex-col overflow-hidden rounded-lg border border-border hover:border-primary transition-colors duration-150 hover:-translate-y-px"
                    style={{ transitionProperty: "border-color, transform", transitionDuration: "150ms" }}
                  >
                    {/* Thumbnail */}
                    <div
                      className="relative h-16 bg-surface-2"
                      style={{
                        backgroundImage: `url(/api/jobs/${jobId}/output/${f.name}/thumb)`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.55) 0%, transparent 50%)" }}
                      />
                      {/* Match number */}
                      <span className="absolute bottom-1.5 left-2 text-[15px] font-black text-white leading-none">
                        {i + 1}
                      </span>
                      {/* Download overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-primary opacity-0 group-hover:opacity-90 transition-opacity duration-150">
                        <span className="text-[11px] font-semibold text-primary-fg">⬇ Baixar</span>
                      </div>
                    </div>
                    {/* Label */}
                    <div className="px-2 py-1.5 bg-surface">
                      <p className="text-[11px] font-medium text-ink">Partida {i + 1}</p>
                      <p className="text-[10px] text-muted truncate">{f.name}</p>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [url, setUrl] = useState("")
  const [jobIds, setJobIds] = useState<string[]>(loadJobIds)

  const mutation = useMutation({
    mutationFn: submitVod,
    onSuccess: (data) => {
      const updated = [data.jobId, ...jobIds]
      setJobIds(updated)
      saveJobIds(updated)
      setUrl("")
    },
  })

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="border-b border-border bg-surface px-5 py-3 flex items-center gap-2.5">
        <div
          className="w-5 h-5 rounded-md shrink-0"
          style={{ backgroundColor: "var(--primary)" }}
        />
        <span className="text-sm font-semibold text-ink">Dota VOD Processor</span>
      </header>

      <main className="max-w-[680px] mx-auto px-4 py-8">
        {/* Input card */}
        <div className="rounded-xl border border-border bg-surface p-5 mb-6">
          <h1 className="text-[15px] font-semibold text-ink mb-1">Processar VOD</h1>
          <p className="text-[13px] text-muted mb-4">
            Cole o link da transmissão para separar as partidas automaticamente
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (url.trim()) mutation.mutate(url.trim())
            }}
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-border bg-bg text-ink placeholder:text-dim outline-none focus:border-primary transition-colors duration-150"
              style={{
                ["--tw-ring-color" as string]: "var(--primary-muted)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-muted)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "none"
              }}
            />
            <button
              type="submit"
              disabled={mutation.isPending}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg border-none cursor-pointer disabled:cursor-not-allowed transition-colors duration-150"
              style={{
                backgroundColor: mutation.isPending ? "var(--primary-muted)" : "var(--primary)",
                color: mutation.isPending ? "var(--primary)" : "var(--primary-fg)",
              }}
            >
              {mutation.isPending ? "Enviando..." : "Processar"}
            </button>
          </form>
          {mutation.isError && (
            <p className="mt-2 text-xs text-error">
              {(mutation.error as Error).message}
            </p>
          )}
        </div>

        {/* Jobs */}
        {jobIds.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted">Jobs recentes</span>
              <button
                onClick={async () => {
                  await Promise.allSettled(
                    jobIds.map((id) => fetch(`/api/jobs/${id}`, { method: "DELETE" }))
                  )
                  setJobIds([])
                  saveJobIds([])
                }}
                className="text-xs text-dim hover:text-error bg-transparent border-none cursor-pointer transition-colors duration-150"
              >
                limpar lista
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {jobIds.map((id) => (
                <JobCard
                  key={id}
                  jobId={id}
                  onDelete={() => {
                    const updated = jobIds.filter((j) => j !== id)
                    setJobIds(updated)
                    saveJobIds(updated)
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {jobIds.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-dim">Cole um link acima para começar.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}
