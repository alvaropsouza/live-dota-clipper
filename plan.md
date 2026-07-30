# Dota VOD Processor
## MVP — Extração Automática de Partidas Inteiras

---

# Objetivo

Criar uma aplicação capaz de receber uma VOD (live inteira) de Dota 2 e separar automaticamente cada partida em um arquivo de vídeo independente.

Exemplo:

```
Live de 8 horas

↓

Match 1.mp4
Match 2.mp4
Match 3.mp4
Match 4.mp4
Match 5.mp4
...
```

O MVP **NÃO** gera clips.

O MVP apenas identifica onde cada partida começa e termina.

---

# Arquitetura

```
React
    │
    ▼
Node API (Fastify)
    │
    ▼
BullMQ + Redis
    │
    ▼
Workers
    │
    ├── Download
    ├── Pré-processamento
    ├── IA (Python)
    ├── Corte
    └── Finalização
```

---

# Stack

## Frontend

- React
- TanStack Query
- Tailwind
- shadcn/ui

---

## Backend

- Node.js
- Fastify
- BullMQ
- Redis
- SQLite (MVP)

Futuro:

- PostgreSQL

---

## Download

yt-dlp

Responsável por baixar a VOD.

Entrada:

```
https://youtube.com/watch?v=xxxx
```

Saída:

```
video.mp4
```

---

## Processamento de vídeo

FFmpeg

Responsável por:

- ler vídeo
- enviar frames
- cortar vídeos
- gerar mp4

---

## IA / Visão Computacional

Python

Bibliotecas

- OpenCV
- NumPy

Futuro

- YOLO
- ONNX Runtime
- PyTorch

---

# Estrutura do Projeto

```
apps/

    frontend/

    api/

services/

    vision-python/

workers/

    downloader/

    preprocessing/

    cutter/

shared/
```

---

# Fluxo completo

## 1)

Usuário cola URL

↓

API cria Job

↓

Status = Downloading

---

## 2)

Worker Download

Executa

```
yt-dlp
```

gera

```
video.mp4
```

---

## 3)

Worker Pré-processamento

Executa

```
FFmpeg
```

Não salva frames.

Faz stream diretamente para Python.

```
FFmpeg

↓

stdout

↓

Python
```

---

## 4)

Worker Python

Recebe frames.

Apenas 2 FPS.

Não precisa processar 60 FPS.

Fluxo

```
Frame

↓

OpenCV

↓

Detectar HUD

↓

Atualizar Máquina de Estados
```

---

# Máquina de Estados

```
MENU

↓

LOADING

↓

PARTIDA

↓

PÓS-JOGO

↓

MENU
```

Estados possíveis

- Menu
- Loading
- Partida
- Pós-jogo

---

# Estratégia para detectar partidas

A estratégia principal NÃO será OCR.

Também NÃO será detectar texto.

A estratégia será detectar a HUD.

Enquanto existir HUD

↓

Estamos dentro de uma partida.

Quando HUD desaparecer por X segundos

↓

Fim da partida.

Quando HUD voltar por X segundos

↓

Nova partida.

Isso torna o algoritmo muito mais robusto.

---

# Elementos da HUD

Detectar:

- HP
- Mana
- Inventário
- Skills
- Minimap
- Gold

Não é necessário detectar todos.

Basta alguns elementos fixos.

---

# Resultado do Python

Retornar JSON

```json
[
    {
        "match":1,
        "start":"00:12:30",
        "end":"00:59:10"
    },
    {
        "match":2,
        "start":"01:03:42",
        "end":"01:51:55"
    }
]
```

---

# Corte

Node recebe

- video.mp4
- timestamps

Executa

```
ffmpeg

-ss START

-to END

-c copy
```

Sem reencode.

Muito rápido.

Saída

```
match001.mp4

match002.mp4

match003.mp4
```

---

# Organização

```
output/

    match001.mp4

    match002.mp4

    match003.mp4

    metadata.json

    processing.json
```

---

# Limpeza

Ao finalizar

Apagar

- vídeo original
- cache
- temporários

Manter apenas

```
output/
```

---

# API entre Node e Python

## Node

POST

```
/process
```

Body

```json
{
    "videoPath":"/tmp/job123/video.mp4"
}
```

Resposta

```json
{
    "matches":[]
}
```

---

# Banco

Tabela Jobs

```
id

status

url

createdAt

finishedAt

progress
```

Tabela Arquivos

```
id

jobId

path

duration
```

---

# Workers

## Worker Download

Responsável por:

- baixar vídeo

---

## Worker Pré-processamento

Responsável por:

- iniciar FFmpeg
- enviar stream

---

## Worker Python

Responsável por:

- detectar HUD
- detectar início
- detectar fim
- gerar timestamps

---

## Worker Corte

Responsável por:

- gerar MP4 das partidas

---

## Worker Finalização

Responsável por:

- metadata
- zip
- limpeza

---

# Estrutura temporária

```
tmp/

    job-123/

        video.mp4

        output/

            match001.mp4

            match002.mp4
```

---

# Evolução futura

Após o MVP

```
Extrair partidas

↓

Detectar Teamfights

↓

Detectar Kills

↓

Detectar Buybacks

↓

Detectar Roshan

↓

Detectar Smoke

↓

Detectar Rampages

↓

Pontuar emoção

↓

Selecionar melhores momentos

↓

Gerar Clips

↓

Adicionar Zoom

↓

Adicionar Legendas

↓

Upload automático
```

---

# Roadmap

## MVP

- Download da VOD
- Detectar partidas
- Cortar partidas
- Download dos vídeos

---

## Versão 2

- Detecção de Teamfight

- Detecção de Kill

- Detecção de Roshan

---

## Versão 3

IA para detectar momentos épicos.

---

## Versão 4

Editor automático.

---

## Versão 5

Publicação automática em

- TikTok
- Shorts
- Reels

---

# Arquitetura Final

```
                 React

                   │

                   ▼

          Fastify (Node.js)

                   │

          BullMQ + Redis

                   │

     ┌─────────────┼─────────────┐

     ▼             ▼             ▼

 Download     Python CV      Cutter

     │             │             │

     └─────────────┼─────────────┘

                   ▼

             Output MP4

                   ▼

            Download / API
```

---

# Princípios do Projeto

- Node.js como orquestrador.
- Python apenas para visão computacional.
- FFmpeg para todo processamento de vídeo.
- Comunicação simples entre Node e Python via HTTP.
- Workers independentes para facilitar escalabilidade.
- Arquivos temporários removidos ao final do processamento.
- Arquitetura preparada para evolução para geração automática de clips.