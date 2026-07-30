import { useState } from "react"
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query"

const queryClient = new QueryClient()

const PIPELINE = [
  { status: "pending",       label: "Aguardando" },
  { status: "downloading",   label: "Baixando" },
  { status: "preprocessing", label: "Pré-processando" },
  { status: "detecting",     label: "Detectando partidas" },
  { status: "cutting",       label: "Cortando vídeo" },
  { status: "done",          label: "Concluído" },
] as const

type Job = { id: string; status: string; url: string; createdAt: string; finishedAt?: string; progress: number }
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

function PipelineBar({ status, progress }: { status: string; progress: number }) {
  const currentIdx = PIPELINE.findIndex((s) => s.status === status)
  const failed = status === "failed"

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1">
        {PIPELINE.map((step, i) => {
          const done = !failed && i < currentIdx
          const active = !failed && i === currentIdx
          return (
            <div key={step.status} className="flex flex-1 flex-col items-center gap-1">
              <div className={[
                "h-1.5 w-full rounded-full",
                done   ? "bg-green-500" :
                active ? "bg-blue-500 animate-pulse" :
                failed ? "bg-red-400" :
                         "bg-gray-200",
              ].join(" ")} />
              <span className={[
                "text-[10px] leading-tight text-center",
                active ? "font-semibold text-blue-600" :
                done   ? "text-green-600" :
                failed ? "text-red-500" :
                         "text-gray-400",
              ].join(" ")}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {(status === "downloading" || status === "detecting") && progress > 0 && (
        <div className="space-y-0.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-[10px] text-blue-600">{progress}%</p>
        </div>
      )}
    </div>
  )
}

const RETRYABLE_STEPS = [
  { status: "pending",       label: "Download" },
  { status: "preprocessing", label: "Detecção" },
  { status: "cutting",       label: "Corte" },
] as const

function JobCard({ jobId, onDelete }: { jobId: string; onDelete: () => void }) {
  const [showRetryMenu, setShowRetryMenu] = useState(false)
  const { data, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "failed") ? false : 3000,
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

  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm text-gray-700">{data?.url ?? jobId}</p>
        <div className="relative flex shrink-0 items-center gap-2">
          <span className={[
            "rounded-full px-2 py-0.5 text-xs font-medium",
            data?.status === "done"   ? "bg-green-100 text-green-700" :
            data?.status === "failed" ? "bg-red-100 text-red-700" :
            isError                   ? "bg-red-100 text-red-700" :
                                        "bg-blue-100 text-blue-700",
          ].join(" ")}>
            {isError ? "erro" : (data?.status ?? "...")}
          </span>
          {data && data.status !== "pending" && (
            <div className="relative">
              <button
                onClick={() => setShowRetryMenu((v) => !v)}
                disabled={retryMutation.isPending}
                className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
                title="Reiniciar a partir de..."
              >
                ↺
              </button>
              {showRetryMenu && (
                <div className="absolute right-0 top-5 z-10 w-36 rounded border bg-white shadow-lg">
                  <p className="border-b px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Reiniciar a partir de</p>
                  {RETRYABLE_STEPS.map((step) => (
                    <button
                      key={step.status}
                      onClick={() => retryMutation.mutate(step.status)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
            title="Eliminar job"
          >
            ✕
          </button>
        </div>
      </div>
      <p className="mt-1 font-mono text-[10px] text-gray-400">{jobId}</p>
      {data && <PipelineBar status={data.status} progress={data.progress} />}

      {data?.status === "done" && (
        <div className="mt-4 space-y-4">
          {(() => {
            const thumb = data.url ? youtubeThumb(data.url) : null
            return thumb ? (
              <div className="relative h-40 overflow-hidden rounded-lg">
                <img src={thumb} alt="thumbnail" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute bottom-2 left-3 text-xs font-semibold text-white drop-shadow">VOD completa</span>
              </div>
            ) : null
          })()}

          {files && files.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {files.length} partida{files.length !== 1 ? "s" : ""} cortada{files.length !== 1 ? "s" : ""}
              </p>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {files.map((f, i) => (
                  <a
                    key={f.id}
                    href={f.url}
                    download={f.name}
                    className="group relative flex flex-col overflow-hidden rounded-lg border border-gray-200 transition hover:border-blue-400 hover:shadow-md"
                  >
                    <div
                      className="relative flex h-24 items-end justify-start bg-cover bg-center bg-gradient-to-br from-indigo-900 to-blue-800"
                      style={{ backgroundImage: `url(/api/jobs/${jobId}/output/${f.name}/thumb)` }}
                    >
                      <div className="absolute inset-0 bg-black/40" />
                      <span className="relative z-10 px-2 pb-1.5 text-2xl font-black text-white drop-shadow">#{i + 1}</span>
                    </div>
                    <div className="bg-white px-2 py-1.5">
                      <p className="text-[11px] font-medium text-gray-700">Partida {i + 1}</p>
                      <p className="truncate text-[10px] text-gray-400">{f.name}</p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-blue-600/80 opacity-0 transition group-hover:opacity-100">
                      <span className="text-sm font-semibold text-white">⬇ Baixar</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
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
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold">Dota VOD Processor</h1>
      <p className="mt-1 text-sm text-gray-500">Cole o link da VOD para separar as partidas</p>

      <form
        className="mt-6 flex gap-2"
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
          className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Enviando..." : "Processar"}
        </button>
      </form>

      {mutation.isError && (
        <p className="mt-2 text-sm text-red-600">Erro: {(mutation.error as Error).message}</p>
      )}

      {jobIds.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">Jobs</h2>
            <button
              onClick={async () => {
                await Promise.allSettled(
                  jobIds.map((id) => fetch(`/api/jobs/${id}`, { method: "DELETE" }))
                )
                setJobIds([])
                saveJobIds([])
              }}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              limpar lista
            </button>
          </div>
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
      )}
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
