import Fastify from "fastify"
import pino from "pino"
import { access, rm, writeFile } from "node:fs/promises"
import { createReadStream, statSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { ProcessRequestSchema } from "@dota-vod/shared"
import { db } from "@/db"

const TMP_DIR = path.resolve(process.env["TMP_DIR"] ?? "../../data/tmp")
const FFMPEG = process.env["FFMPEG_PATH"] ?? "ffmpeg"

const logger = pino({
  name: "api",
  transport: { target: "pino-pretty", options: { colorize: true } },
})

const app = Fastify({ logger: { level: "warn" } })

app.get("/health", async () => ({ ok: true }))

app.post("/process", async (request, reply) => {
  const body = ProcessRequestSchema.parse(request.body)

  const jobId = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO jobs (id, status, url, createdAt) VALUES (?, 'pending', ?, ?)`,
    args: [jobId, body.videoPath, new Date().toISOString()],
  })

  logger.info({ jobId, url: body.videoPath }, "job created")
  return reply.code(202).send({ jobId })
})

app.get("/jobs", async (_request, reply) => {
  const result = await db.execute({ sql: `SELECT * FROM jobs ORDER BY createdAt DESC`, args: [] })
  return reply.send(result.rows)
})

app.get("/jobs/:id", async (request, reply) => {
  const { id } = request.params as { id: string }
  const result = await db.execute({ sql: `SELECT * FROM jobs WHERE id = ?`, args: [id] })
  const job = result.rows[0]
  if (!job) return reply.code(404).send({ error: "not found" })
  return job
})

app.post("/jobs/:id/complete", async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = request.body as { matches?: Array<{ match: number; start: string; end: string }>; error?: string }

  if (body.error) {
    logger.error({ jobId: id, err: body.error }, "detection failed via callback")
    await db.execute({
      sql: `UPDATE jobs SET status = 'failed', finishedAt = ? WHERE id = ?`,
      args: [new Date().toISOString(), id],
    })
    return reply.code(204).send()
  }

  const matches = body.matches ?? []
  const jobDir = path.join(TMP_DIR, `job-${id}`)
  await writeFile(path.join(jobDir, "matches.json"), JSON.stringify(matches, null, 2))

  await db.execute({
    sql: `UPDATE jobs SET status = 'cutting', progress = 0 WHERE id = ?`,
    args: [id],
  })
  logger.info({ jobId: id, matchCount: matches.length }, "detection complete → cutting")
  return reply.code(204).send()
})

app.patch("/jobs/:id/progress", async (request, reply) => {
  const { id } = request.params as { id: string }
  const { progress } = request.body as { progress: number }
  await db.execute({ sql: `UPDATE jobs SET progress = ? WHERE id = ?`, args: [progress, id] })
  return reply.code(204).send()
})

app.post("/jobs/:id/retry", async (request, reply) => {
  const { id } = request.params as { id: string }
  const jobDir = path.join(TMP_DIR, `job-${id}`)

  const { targetStatus } = (request.body ?? {}) as { targetStatus?: string }

  let resumeStatus: string
  if (targetStatus) {
    resumeStatus = targetStatus
  } else {
    const exists = (p: string) => access(p).then(() => true).catch(() => false)
    const hasMatches = await exists(path.join(jobDir, "matches.json"))
    const hasVideo   = await exists(path.join(jobDir, "video.mp4"))
    resumeStatus = hasMatches ? "cutting" : hasVideo ? "preprocessing" : "pending"
  }

  const result = await db.execute({
    sql: `UPDATE jobs SET status = ?, finishedAt = NULL WHERE id = ? AND status NOT IN ('pending') RETURNING id`,
    args: [resumeStatus, id],
  })
  if (result.rows.length === 0) return reply.code(409).send({ error: "job not retryable" })
  logger.info({ jobId: id, resumeStatus }, "job retried")
  return reply.code(202).send({ jobId: id, resumeStatus })
})

app.get("/jobs/:id/thumbnail", async (request, reply) => {
  const { id } = request.params as { id: string }
  const jobDir = path.join(TMP_DIR, `job-${id}`)
  const thumbPath = path.join(jobDir, "thumbnail.jpg")

  try { await access(thumbPath) } catch {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG, [
        "-ss", "00:00:10", "-i", path.join(jobDir, "video.mp4"),
        "-frames:v", "1", "-q:v", "4", "-y", thumbPath,
      ])
      proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))
      proc.on("error", reject)
    })
  }

  return reply.type("image/jpeg").send(createReadStream(thumbPath))
})

app.get("/jobs/:id/files", async (request) => {
  const { id } = request.params as { id: string }
  const result = await db.execute({ sql: `SELECT * FROM files WHERE jobId = ? ORDER BY path`, args: [id] })
  return result.rows.map((r) => ({
    id: r.id,
    path: r.path,
    name: path.basename(r.path as string),
    url: `/api/jobs/${id}/output/${path.basename(r.path as string)}`,
  }))
})

app.get("/jobs/:id/output/:filename/thumb", async (request, reply) => {
  const { id, filename } = request.params as { id: string; filename: string }
  const row = await db.execute({ sql: `SELECT path FROM files WHERE jobId = ? AND path LIKE ?`, args: [id, `%${filename}`] })
  if (!row.rows[0]) return reply.code(404).send({ error: "not found" })
  const filePath = row.rows[0]['path'] as string
  const thumbPath = path.join(path.dirname(filePath), `thumb_${filename}.jpg`)

  try {
    await access(filePath)
  } catch {
    return reply.code(404).send({ error: "not found" })
  }

  try { await access(thumbPath) } catch {
    const generated = await new Promise<boolean>((resolve) => {
      const proc = spawn(FFMPEG, [
        "-ss", "00:00:05", "-i", filePath,
        "-frames:v", "1", "-q:v", "3", "-vf", "scale=320:-1",
        "-y", thumbPath,
      ])
      proc.on("close", (code) => resolve(code === 0))
      proc.on("error", () => resolve(false))
    })
    if (!generated) return reply.code(404).send({ error: "thumb generation failed" })
  }

  return reply.type("image/jpeg").send(createReadStream(thumbPath))
})

app.get("/jobs/:id/output/:filename", async (request, reply) => {
  const { id, filename } = request.params as { id: string; filename: string }
  const row = await db.execute({ sql: `SELECT path FROM files WHERE jobId = ? AND path LIKE ?`, args: [id, `%${filename}`] })
  if (!row.rows[0]) return reply.code(404).send({ error: "not found" })
  const filePath = row.rows[0].path as string
  try {
    await access(filePath)
    const stat = statSync(filePath)
    const range = request.headers.range
    if (range) {
      const [startStr, endStr] = range.replace("bytes=", "").split("-")
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1
      reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${end}/${stat.size}`)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", end - start + 1)
        .type("video/mp4")
      return reply.send(createReadStream(filePath, { start, end }))
    }
    reply.header("Content-Length", stat.size).type("video/mp4")
    return reply.send(createReadStream(filePath))
  } catch {
    return reply.code(404).send({ error: "not found" })
  }
})

app.delete("/jobs/:id", async (request, reply) => {
  const { id } = request.params as { id: string }
  await db.execute({ sql: `DELETE FROM jobs WHERE id = ?`, args: [id] })
  await rm(path.join(TMP_DIR, `job-${id}`), { recursive: true, force: true })
  logger.info({ jobId: id }, "job deleted + tmp cleaned")
  return reply.code(204).send()
})

await app.listen({ port: Number(process.env["API_PORT"] ?? 3000), host: "0.0.0.0" })
logger.info({ port: process.env["API_PORT"] ?? 3000 }, "api ready")
