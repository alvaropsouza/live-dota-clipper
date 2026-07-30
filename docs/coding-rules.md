# Coding Rules — Dota VOD Processor

## Arquitetura

- Node.js orquestra. Python só visão computacional. Nunca misturar responsabilidades.
- Workers são independentes. Cada worker faz uma coisa. Sem lógica de outro worker dentro.
- Comunicação Node ↔ Python via HTTP simples. Sem RPC exótico, sem gRPC no MVP.
- SQLite no MVP. Não abstrair para suportar PostgreSQL antes de precisar.

## Workers

- Cada worker tem uma responsabilidade única: Download, Pré-processamento, Python CV, Corte, Finalização.
- Worker não chama worker diretamente. Usa fila BullMQ.
- Job falhou → atualizar status no DB, não silenciar erro.

## Processamento de Vídeo

- FFmpeg faz stream direto para Python via stdout. Não salvar frames em disco.
- Taxa de frames: 2 FPS para detecção. Nunca processar 60 FPS sem motivo explícito.
- Corte com `-c copy` (sem reencode). Só reencode se houver razão documentada.

## Python / Visão Computacional

- Detecção baseada em HUD (presença/ausência). Não usar OCR no MVP.
- Máquina de estados: MENU → LOADING → PARTIDA → PÓS-JOGO → MENU. Não adicionar estados sem justificativa.
- Saída sempre JSON com `match`, `start`, `end`. Não mudar contrato sem atualizar Node também.
- Threshold de transição de estado (X segundos) deve ser constante nomeada, não número mágico.

## API (Fastify)

- Rota de processamento: `POST /process` com `videoPath`. Não inventar rotas novas sem necessidade.
- Validar entrada na borda (schema Fastify). Não validar de novo dentro do worker.
- Status do job exposto via GET. Frontend polling ou WebSocket — não push desnecessário no MVP.

## Frontend (React)

- TanStack Query para estado servidor. Não usar `useState` para dados que vêm da API.
- shadcn/ui para componentes base. Não criar componente customizado se shadcn já resolve.
- Tailwind para estilo. Sem CSS modules, sem styled-components.

## Banco (SQLite)

- Tabela `jobs`: id, status, url, createdAt, finishedAt, progress.
- Tabela `files`: id, jobId, path, duration.
- Sem ORM complexo no MVP. Query direta ou lib leve (better-sqlite3).

## Arquivos Temporários

- Estrutura: `tmp/job-{id}/video.mp4` e `tmp/job-{id}/output/`.
- Worker Finalização limpa `tmp/job-{id}/` inteiro após sucesso.
- Falha no job: manter arquivos para debug. Limpeza manual ou via comando separado.

## Geral

- Sem abstrações antecipadas. Interface com uma implementação = não fazer.
- Sem config para valor que nunca muda.
- Constante nomeada > número mágico.
- Sem logs de debug em produção. Usar nível de log configurável.
- Erro externo (yt-dlp, ffmpeg, Python) → capturar stderr, logar, propagar com mensagem clara.
- Não engolir erro silenciosamente em nenhum worker.

## Workflow

- Sempre rodar lint antes de finalizar qualquer codificação. Sem exceção.

## Comentários

- Proibido comentário no código. Nome de variável/função já documenta.
- Exceção única: workaround para bug externo documentado com link para a issue.

## Dependências

- Sempre usar versão mais recente disponível ao instalar ou atualizar pacote.
- Nunca fixar versão antiga sem motivo documentado no PR.
