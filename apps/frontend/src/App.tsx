import { useEffect, useRef, useState } from "react"
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
type CutFile = { id: string; path: string; name: string; type: string; extracting: boolean; hlProgress: number | null; url: string }

function youtubeThumb(url: string): { max: string; fallback: string } | null {
  try {
    const u = new URL(url)
    const id = u.searchParams.get("v") ?? u.pathname.split("/").pop()
    if (!id) return null
    return {
      max: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      fallback: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    }
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


function CheckIcon() {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XMarkIcon() {
  return (
    <svg aria-hidden="true" width="9" height="9" viewBox="0 0 9 9" fill="none">
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
  if (status === "done")   cls += "bg-accent-muted text-accent"
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
          else if (isDone)  { nodeBg = "var(--primary)";       nodeBorder = "var(--primary)"; labelColor = "var(--muted)" }
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
              width: "100%",
              backgroundColor: "var(--primary)",
              borderRadius: 2,
              transform: `scaleX(${progress / 100})`,
              transformOrigin: "left",
              transition: "transform 0.5s ease",
              willChange: "transform",
            }}
          />
        </div>
      )}
    </div>
  )
}

function JobCard({ jobId, onDelete }: { jobId: string; onDelete: () => void }) {
  const [showRetryMenu, setShowRetryMenu] = useState(false)
  const retryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showRetryMenu) return
    function handle(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key === "Escape") { setShowRetryMenu(false); return }
      if (e instanceof MouseEvent && retryRef.current && !retryRef.current.contains(e.target as Node)) {
        setShowRetryMenu(false)
      }
    }
    document.addEventListener("mousedown", handle)
    document.addEventListener("keydown", handle)
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("keydown", handle) }
  }, [showRetryMenu])

  const { data, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (q) =>
      q.state.data?.status === "done" || q.state.data?.status === "failed" ? false : 3000,
  })

  const { data: videoTitle } = useQuery({
    queryKey: ["oembed", data?.url],
    queryFn: async (): Promise<string | null> => {
      if (!data?.url) return null
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(data.url)}&format=json`)
        if (!res.ok) return null
        const json = await res.json() as { title?: string }
        return json.title ?? null
      } catch { return null }
    },
    enabled: !!data?.url,
    staleTime: Infinity,
  })

  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [extractStep, setExtractStep] = useState<{ current: number; total: number } | null>(null)
  const [highlightDuration, setHighlightDuration] = useState(60)
  const [minKills, setMinKills] = useState(2)
  const [stopping, setStopping] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const currentExtractingIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const { data: files } = useQuery({
    queryKey: ["files", jobId],
    queryFn: async (): Promise<CutFile[]> => {
      const res = await fetch(`/api/jobs/${jobId}/files`)
      if (!res.ok) return []
      return res.json() as Promise<CutFile[]>
    },
    enabled: data?.status === "done",
    refetchInterval: (q) => (q.state.data?.some((f) => f.extracting) || extractStep !== null) ? 2000 : false,
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
      void queryClient.invalidateQueries({ queryKey: ["job", jobId] })
    },
  })

  const serverExtracting = files?.some((f) => f.extracting) ?? false
  const extracting = serverExtracting || extractStep !== null

  async function stopExtraction() {
    cancelledRef.current = true
    setStopping(true)
    abortControllerRef.current?.abort()
    const fid = currentExtractingIdRef.current
    if (fid) {
      fetch(`/api/jobs/${jobId}/files/${fid}/detect-highlights`, { method: "DELETE" }).catch(() => {})
    }
  }

  async function extractHighlights() {
    cancelledRef.current = false
    setStopping(false)
    const ids = [...selectedMatchIds]
    setExtractStep({ current: 1, total: ids.length })
    for (let i = 0; i < ids.length; i++) {
      if (cancelledRef.current) break
      setExtractStep({ current: i + 1, total: ids.length })
      currentExtractingIdRef.current = ids[i]
      const ac = new AbortController()
      abortControllerRef.current = ac
      try {
        const res = await fetch(`/api/jobs/${jobId}/files/${ids[i]}/detect-highlights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxDuration: highlightDuration, minKills }),
          signal: ac.signal,
        })
        if (!res.ok) console.error(`highlight extraction failed for ${ids[i]}: ${await res.text()}`)
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e)
      }
      void queryClient.invalidateQueries({ queryKey: ["files", jobId] })
    }
    setExtractStep(null)
    currentExtractingIdRef.current = null
    abortControllerRef.current = null
    setStopping(false)
    setSelectedMatchIds(new Set())
  }

  const status = isError ? "failed" : (data?.status ?? "pending")
  const isDone = status === "done"

  return (
    <div
      className="rounded-xl border border-border bg-surface"
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          {/* Title + URL */}
          <div className="flex-1 min-w-0">
            {videoTitle && (
              <p className="text-sm font-medium text-ink truncate leading-snug">{videoTitle}</p>
            )}
            <p className={`truncate leading-snug ${videoTitle ? "text-[11px] text-muted mt-0.5" : "text-sm text-ink"}`}>
              {data?.url ?? jobId}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusChip status={status} />

            {/* Retry */}
            {data && data.status !== "pending" && (
              <div className="relative" ref={retryRef}>
                <button
                  onClick={() => setShowRetryMenu((v) => !v)}
                  disabled={retryMutation.isPending}
                  aria-label="Reiniciar a partir de..."
                  aria-haspopup="menu"
                  aria-expanded={showRetryMenu}
                  className="flex items-center justify-center w-8 h-8 rounded-md border border-border bg-transparent text-muted hover:text-ink hover:border-ink transition-colors duration-150 disabled:opacity-40 text-sm"
                >
                  <span aria-hidden="true">↺</span>
                </button>
                {showRetryMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 top-7 z-20 rounded-lg border border-border bg-surface overflow-hidden"
                    style={{ minWidth: 160, boxShadow: "0 8px 24px oklch(0 0 0 / 0.18)" }}
                  >
                    <p className="px-3 py-2 text-[10px] font-semibold text-muted border-b border-border">
                      Reiniciar a partir de
                    </p>
                    {RETRYABLE_STEPS.map((step) => (
                      <button
                        key={step.status}
                        role="menuitem"
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
              aria-label="Remover job"
              className="flex items-center justify-center w-8 h-8 rounded-md border border-transparent text-dim hover:text-error hover:bg-error-muted hover:border-error-muted transition-colors duration-150 disabled:opacity-40 text-xs"
            >
              <span aria-hidden="true">✕</span>
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

      {/* Video preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "oklch(0 0 0 / 0.88)" }}
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative"
            style={{ maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewUrl(null)}
              aria-label="Fechar"
              style={{
                position: "absolute", top: -14, right: -14,
                width: 28, height: 28, borderRadius: "50%",
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: "var(--ink)", cursor: "pointer", fontSize: 12,
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
                fontFamily: "inherit",
              }}
            >✕</button>
            <video
              controls
              autoPlay
              src={previewUrl}
              style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8, display: "block" }}
            />
          </div>
        </div>
      )}

      {/* Done state: thumbnail + files */}
      {isDone && (
        <div className="border-t border-border px-4 pb-4 pt-4">
          {(() => {
            const thumb = data?.url ? youtubeThumb(data.url) : null
            return thumb ? (
              <div className="relative rounded-lg overflow-hidden mb-4" style={{ aspectRatio: "16/9" }}>
                <img
                  src={thumb.max}
                  alt="thumbnail da VOD"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = thumb.fallback }}
                />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.65) 0%, transparent 55%)" }} />
                <span className="absolute bottom-2.5 left-3 text-xs font-semibold text-white">
                  VOD completa
                </span>
              </div>
            ) : null
          })()}

          {files && files.length > 0 && (() => {
            const matches    = files.filter((f) => f.type !== "highlight")
            const highlights = files.filter((f) => f.type === "highlight")

            const toggleMatch = (id: string) => {
              setSelectedMatchIds((prev) => {
                const next = new Set(prev)
                next.has(id) ? next.delete(id) : next.add(id)
                return next
              })
            }

            return (
              <>
                {matches.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[11px] font-medium text-muted">
                        {matches.length} partida{matches.length !== 1 ? "s" : ""} detectada{matches.length !== 1 ? "s" : ""}
                      </p>
                      {(selectedMatchIds.size > 0 || extracting) && (
                        <div className="flex items-center gap-1.5">
                          {!extracting && (
                            <>
                              <div className="flex items-center gap-1 rounded-md border border-border px-2" style={{ background: "var(--surface-2)" }}>
                                <label htmlFor="hl-dur" className="text-[10px] text-muted whitespace-nowrap">máx</label>
                                <input
                                  id="hl-dur"
                                  type="number"
                                  min={20}
                                  max={300}
                                  value={highlightDuration}
                                  onChange={(e) => setHighlightDuration(Number(e.target.value))}
                                  onBlur={(e) => setHighlightDuration(Math.max(20, Math.min(300, Number(e.target.value))))}
                                  className="w-10 text-[11px] text-ink bg-transparent border-none outline-none text-right"
                                  style={{ fontFamily: "inherit" }}
                                />
                                <span className="text-[10px] text-muted">s</span>
                              </div>
                              <div className="flex items-center gap-1 rounded-md border border-border px-2" style={{ background: "var(--surface-2)" }}>
                                <label htmlFor="hl-kills" className="text-[10px] text-muted whitespace-nowrap">kills</label>
                                <input
                                  id="hl-kills"
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={minKills}
                                  onChange={(e) => setMinKills(Number(e.target.value))}
                                  onBlur={(e) => setMinKills(Math.max(1, Math.min(20, Number(e.target.value))))}
                                  className="w-8 text-[11px] text-ink bg-transparent border-none outline-none text-right"
                                  style={{ fontFamily: "inherit" }}
                                />
                                <span className="text-[10px] text-muted">mín</span>
                              </div>
                            </>
                          )}
                          {extracting ? (
                            <button
                              onClick={() => void stopExtraction()}
                              disabled={stopping}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors duration-150 disabled:opacity-60"
                              style={{ background: "var(--error, #e53)", color: "white", border: "none", cursor: stopping ? "default" : "pointer", fontFamily: "inherit" }}
                            >
                              {stopping
                                ? "Parando…"
                                : extractStep
                                ? `◼ Parar (${extractStep.current}/${extractStep.total})`
                                : "◼ Parar"}
                            </button>
                          ) : (
                            <button
                              onClick={() => void extractHighlights()}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors duration-150"
                              style={{ background: "var(--primary)", color: "var(--primary-fg)", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                            >
                              {`✦ Extrair highlights (${selectedMatchIds.size})`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" }}>
                      {matches.map((f, i) => {
                        const selected = selectedMatchIds.has(f.id)
                        const isActive = f.extracting
                        return (
                          <div key={f.id} className="flex flex-col overflow-hidden rounded-lg border transition-colors duration-150"
                            style={{ borderColor: isActive || selected ? "var(--primary)" : "var(--border)" }}
                          >
                            <button
                              onClick={() => !extracting && toggleMatch(f.id)}
                              className="relative h-16 overflow-hidden w-full p-0 border-none"
                              style={{ background: "var(--surface-2)", cursor: extracting ? "default" : "pointer" }}
                              aria-pressed={selected}
                              aria-label={`Selecionar partida ${i + 1}`}
                            >
                              <img src={`/api/jobs/${jobId}/output/${f.name}/thumb`} alt={`Partida ${i + 1}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.55) 0%, transparent 50%)" }} />
                              <span className="absolute bottom-1.5 left-2 text-[15px] font-black text-white leading-none">{i + 1}</span>
                              {isActive && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3" style={{ background: "oklch(0 0 0 / 0.72)" }}>
                                  {f.hlProgress !== null ? (
                                    <>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "white", letterSpacing: "0.05em" }}>
                                        DETECTANDO {f.hlProgress}%
                                      </span>
                                      <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                        <div style={{
                                          height: "100%",
                                          width: "100%",
                                          background: "var(--primary)",
                                          borderRadius: 2,
                                          transform: `scaleX(${f.hlProgress / 100})`,
                                          transformOrigin: "left",
                                          transition: "transform 0.4s ease",
                                        }} />
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
                                        <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                      </svg>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "white", letterSpacing: "0.05em" }}>DETECTANDO</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {!extracting && (
                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded flex items-center justify-center"
                                  style={{
                                    background: selected ? "var(--primary)" : "oklch(0 0 0 / 0.45)",
                                    border: `1.5px solid ${selected ? "var(--primary)" : "rgba(255,255,255,0.6)"}`,
                                    transition: "background 0.15s, border-color 0.15s",
                                  }}
                                >
                                  {selected && <CheckIcon />}
                                </div>
                              )}
                            </button>
                            <div className="px-2 py-1.5 bg-surface flex items-center justify-between gap-1">
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium text-ink">Partida {i + 1}</p>
                                <p className="text-[10px] text-muted truncate">{f.name}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => setPreviewUrl(f.url)} aria-label="Pré-visualizar"
                                  className="text-dim hover:text-ink transition-colors duration-150"
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "inherit" }}
                                >▶</button>
                                <a href={f.url} download={f.name} aria-label="Baixar"
                                  className="shrink-0 text-dim hover:text-ink transition-colors duration-150"
                                  style={{ fontSize: 13 }}
                                >⬇</a>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {highlights.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[11px] font-medium text-muted">
                        {highlights.length} highlight{highlights.length !== 1 ? "s" : ""}
                      </p>
                      <button
                        onClick={async () => {
                          await fetch(`/api/jobs/${jobId}/highlights`, { method: "DELETE" })
                          void queryClient.invalidateQueries({ queryKey: ["files", jobId] })
                        }}
                        className="text-[10px] transition-colors duration-150"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontFamily: "inherit" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)" }}
                      >
                        remover todos
                      </button>
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" }}>
                      {highlights.map((f, i) => (
                        <div key={f.id} className="group flex flex-col overflow-hidden rounded-lg border border-border hover:border-primary transition-colors duration-150">
                          <button
                            onClick={() => setPreviewUrl(f.url)}
                            className="relative h-16 overflow-hidden w-full p-0"
                            style={{ background: "var(--surface-2)", border: "none", cursor: "pointer" }}
                            aria-label={`Pré-visualizar highlight ${i + 1}`}
                          >
                            <img
                              src={`/api/jobs/${jobId}/output/${f.name}/thumb`}
                              alt={`Highlight ${i + 1}`}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, oklch(0 0 0 / 0.55) 0%, transparent 50%)" }} />
                            <span className="absolute bottom-1.5 left-2 text-[13px] font-black text-white leading-none">H{i + 1}</span>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ background: "oklch(0 0 0 / 0.5)" }}>
                              <span style={{ fontSize: 22, color: "white" }}>▶</span>
                            </div>
                          </button>
                          <div className="px-2 py-1.5 bg-surface flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-ink">Highlight {i + 1}</p>
                              <p className="text-[10px] text-muted truncate">{f.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <a href={f.url} download={f.name} aria-label="Baixar"
                                className="text-dim hover:text-ink transition-colors duration-150"
                                style={{ fontSize: 13 }}
                              >⬇</a>
                              <button
                                onClick={async () => {
                                  await fetch(`/api/jobs/${jobId}/files/${f.id}`, { method: "DELETE" })
                                  void queryClient.invalidateQueries({ queryKey: ["files", jobId] })
                                }}
                                aria-label="Remover highlight"
                                className="shrink-0 text-dim hover:text-error transition-colors duration-150"
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }}
                              >✕</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function App() {
  const [url, setUrl] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: async (): Promise<Job[]> => {
      const res = await fetch("/api/jobs")
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<Job[]>
    },
    refetchInterval: 5000,
  })

  const jobIds = jobs.map((j) => j.id)

  const mutation = useMutation({
    mutationFn: submitVod,
    onSuccess: () => {
      void refetchJobs()
      setUrl("")
    },
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--surface-2)" }}>
      {/* Discord-style channel header */}
      <header
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}
        className="flex items-center gap-3 px-4 h-12"
      >
        {/* Server icon */}
        <div
          className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center"
          style={{ background: "var(--primary)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 3h8M2 6h8M2 9h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-dim font-bold text-base leading-none select-none">#</span>
          <h1 className="text-[14px] font-semibold text-ink m-0">dota-vod-processor</h1>
        </div>
        <div className="flex-1" />
        <span className="hidden sm:inline text-[11px] text-dim font-medium">Extração automática de partidas</span>
        {/* Mobile sidebar toggle */}
        <button
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink transition-colors duration-150"
          style={{ background: "transparent", border: "none" }}
          aria-label={sidebarOpen ? "Fechar painel" : "Abrir painel de processamento"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Body: sidebar + main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar — always visible on sm+, drawer on mobile */}
        <aside
          style={{
            width: 300,
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            flexShrink: 0,
            overflowY: "auto",
            position: undefined,
          }}
          className={`flex flex-col gap-4 p-3 ${sidebarOpen ? "flex" : "hidden"} sm:flex`}
        >
          {/* Section label */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--dim)" }}>
              Nova Transmissão
            </p>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (url.trim()) mutation.mutate(url.trim())
              }}
            >
              <label htmlFor="vod-url" className="sr-only">URL da transmissão</label>
              <input
                id="vod-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
                className="w-full px-3 py-2 text-sm rounded-md text-ink placeholder:text-dim outline-none transition-colors duration-150"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary)"
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-muted)"
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)"
                  e.currentTarget.style.boxShadow = "none"
                }}
              />
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full px-4 py-2 text-sm font-semibold rounded-md border-none cursor-pointer disabled:cursor-not-allowed transition-all duration-150"
                style={{
                  background: mutation.isPending ? "var(--primary-muted)" : "var(--primary)",
                  color: mutation.isPending ? "var(--primary)" : "var(--primary-fg)",
                  fontFamily: "inherit",
                }}
              >
                {mutation.isPending ? "Enviando..." : "Processar"}
              </button>
            </form>
            {mutation.isError && (
              <p className="mt-2 text-xs" style={{ color: "var(--error)" }}>
                {(mutation.error as Error).message}
              </p>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)" }} />

          {/* Stats */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--dim)" }}>
              Sessão
            </p>
            <div className="rounded-md px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "var(--muted)" }}>Jobs ativos</span>
                <span className="text-[12px] font-semibold text-ink">
                  {jobs.filter(j => j.status !== "done" && j.status !== "failed").length}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[12px]" style={{ color: "var(--muted)" }}>Concluídos</span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                  {jobs.filter(j => j.status === "done").length}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main
          style={{ flex: 1, background: "var(--bg)", overflowY: "auto" }}
          className="p-6"
        >
          {jobIds.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold" style={{ color: "var(--muted)" }}>
                  {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
                </span>
                <button
                  onClick={() => {
                    void Promise.allSettled(
                      jobIds.map((id) => fetch(`/api/jobs/${id}`, { method: "DELETE" }))
                    ).then(() => refetchJobs())
                  }}
                  className="text-xs border-none cursor-pointer transition-colors duration-150"
                  style={{ background: "transparent", color: "var(--dim)", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)" }}
                >
                  limpar tudo
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {jobIds.map((id) => (
                  <JobCard
                    key={id}
                    jobId={id}
                    onDelete={() => void refetchJobs()}
                  />
                ))}
              </div>
            </>
          )}

          {jobIds.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ minHeight: 320 }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--surface)" }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 7h20M4 14h20M4 21h12" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold" style={{ color: "var(--muted)" }}>Nenhum job ainda</p>
              <p className="text-[13px]" style={{ color: "var(--dim)" }}>Cole um link na barra lateral para começar.</p>
            </div>
          )}
        </main>
      </div>
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
