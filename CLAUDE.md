# Dota VOD Processor

Aplicação que recebe VOD de Dota 2 e separa automaticamente cada partida em arquivo MP4 independente.

Stack: React + Fastify + BullMQ + Redis + SQLite + Python (OpenCV) + FFmpeg + yt-dlp.

## Documentação

Toda documentação fica em `docs/`. Sempre referenciar arquivos de lá.

- [Regras de Codificação](./docs/coding-rules.md)
- [TypeScript Best Practices](./docs/typescript.md)
- [Clean Code](./docs/clean-code.md)
- [Python Best Practices](./docs/python.md)
- [Plano do Projeto](./plan.md)

## Arquitetura

```
React → Fastify → BullMQ/Redis → Workers (Download, Pré-proc, Python CV, Corte, Finalização)
```

Estrutura de pastas:

```
apps/frontend/
apps/api/
services/vision-python/
workers/downloader/
workers/preprocessing/
workers/cutter/
shared/
docs/
```
