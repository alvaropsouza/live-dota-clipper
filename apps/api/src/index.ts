import Fastify from "fastify"
import { ProcessRequestSchema } from "@dota-vod/shared"
import { db } from "@/db"
import { jobQueue } from "@/queue"

const app = Fastify({ logger: true })

app.get("/health", async () => ({ ok: true }))

app.post("/process", async (request, reply) => {
  const body = ProcessRequestSchema.parse(request.body)

  const jobId = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO jobs (id, status, url, createdAt) VALUES (?, 'pending', ?, ?)`,
    args: [jobId, body.videoPath, new Date().toISOString()],
  })

  await jobQueue.add("download", { jobId, videoPath: body.videoPath })

  return reply.code(202).send({ jobId })
})

app.get("/jobs/:id", async (request, reply) => {
  const { id } = request.params as { id: string }
  const result = await db.execute({ sql: `SELECT * FROM jobs WHERE id = ?`, args: [id] })
  const job = result.rows[0]
  if (!job) return reply.code(404).send({ error: "not found" })
  return job
})

await app.listen({ port: Number(process.env["API_PORT"] ?? 3000), host: "0.0.0.0" })
