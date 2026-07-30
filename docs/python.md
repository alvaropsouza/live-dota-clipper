# Python Best Practices

## Configuração

- Python 3.12+ obrigatório.
- Sempre usar ambiente virtual: `venv` ou `uv`.
- Gerenciador de pacotes: `uv` (mais rápido que pip/poetry).
- Formatter: `ruff format`.
- Linter: `ruff check`.
- Type checker: `mypy --strict` ou `pyright`.

`pyproject.toml` em vez de `setup.py` + `requirements.txt`.

## Type Hints

Sempre tipar. Sem `Any` sem justificativa.

```python
# ruim
def process(data):
    return data

# bom
def process(data: list[str]) -> dict[str, int]:
    ...
```

- Usar `from __future__ import annotations` para forward references.
- `X | None` em vez de `Optional[X]` (Python 3.10+).
- `list[str]` em vez de `List[str]` (Python 3.9+).
- `TypeAlias` para aliases complexos.

## Proibido: `Any`

```python
# ruim
from typing import Any
value: Any

# bom
value: unknown  # não existe — usar union ou Protocol
```

Se precisar de `Any`, isolar e documentar por que.

## Dataclasses e Pydantic

Dados → `dataclass` ou Pydantic. Nunca dicionário solto passando entre funções.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Match:
    index: int
    start: str
    end: str
```

`frozen=True` por padrão. Imutabilidade facilita raciocínio.

Validação de dados externos (API, arquivo, env) → Pydantic:

```python
from pydantic import BaseModel

class MatchResult(BaseModel):
    match: int
    start: str
    end: str
```

## Nunca Usar `dict` Como Contrato

```python
# ruim
def get_match() -> dict:
    return {"match": 1, "start": "00:12:30"}

# bom
def get_match() -> Match:
    return Match(index=1, start="00:12:30", end="00:59:10")
```

## Funções

- Uma responsabilidade. Pequenas.
- Máximo 3 parâmetros posicionais. Mais → keyword-only com `*`:

```python
def create(*, name: str, email: str, role: str) -> User: ...
```

- Sem side effects ocultos.
- Funções puras preferidas — mesmo resultado para mesmos inputs.
- Guard clauses em vez de nesting:

```python
# ruim
def process(frame):
    if frame is not None:
        if frame.is_valid():
            ...

# bom
def process(frame: Frame | None) -> None:
    if frame is None:
        return
    if not frame.is_valid():
        return
    ...
```

## Erros

```python
# ruim
raise Exception("erro")
raise "erro"

# bom
raise ValueError("frame inválido")

# melhor
class HUDNotFoundError(Exception): ...
class MatchDetectionError(Exception): ...

raise HUDNotFoundError(f"frame {frame_index}")
```

- Criar hierarquia de erros de domínio.
- Nunca `except Exception` sem re-raise ou log.
- Nunca `except:` (pega `SystemExit`, `KeyboardInterrupt`).
- Capturar exceção mais específica possível.

```python
# ruim
try:
    ...
except Exception:
    pass

# bom
try:
    ...
except ValueError as e:
    logger.error("valor inválido: %s", e)
    raise
```

## Context Managers

Sempre `with` para recursos (arquivos, conexões, locks):

```python
# ruim
f = open("file.txt")
data = f.read()
f.close()

# bom
with open("file.txt") as f:
    data = f.read()
```

Criar context managers com `contextlib.contextmanager` quando necessário.

## Imutabilidade

- `tuple` em vez de `list` quando tamanho não muda.
- `frozenset` em vez de `set` para conjuntos fixos.
- `frozen=True` em dataclasses.
- Evitar variáveis globais mutáveis.

## List Comprehensions

```python
# bom
squares = [x**2 for x in range(10) if x % 2 == 0]

# ruim quando complexo demais — usar loop explícito
result = [transform(x) for x in data if condition(x) and other(x) and more(x)]
```

Comprehension complexa → loop explícito com nome claro.

## Iteradores e Generators

Preferir generators para sequências grandes. Não carregar tudo em memória.

```python
def read_frames(video_path: Path) -> Generator[Frame, None, None]:
    ...
    yield frame
```

`itertools` antes de implementar manualmente: `chain`, `islice`, `groupby`, `product`.

## Pathlib

```python
# ruim
import os
path = os.path.join("tmp", "job-123", "video.mp4")

# bom
from pathlib import Path
path = Path("tmp") / "job-123" / "video.mp4"
```

Sempre `Path`. Nunca `os.path`.

## Logging

```python
import logging

logger = logging.getLogger(__name__)

# ruim
print("processando frame")

# bom
logger.info("processando frame %d", frame_index)
logger.error("falha na detecção: %s", error)
```

- `print` proibido em produção.
- Logger por módulo (`__name__`).
- Sem f-string em log — usar `%s` (lazy evaluation).
- Nível configurável via env var.

## Variáveis de Ambiente

Nunca acessar `os.environ` diretamente espalhado pelo código. Centralizar e validar na inicialização:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_url: str
    tmp_dir: Path = Path("tmp")

settings = Settings()
```

## Organização

Feature-first dentro de cada serviço:

```
vision-python/
  detection/
    hud_detector.py
    state_machine.py
    schemas.py
  api/
    routes.py
    schemas.py
  main.py
```

- Sem `utils.py` genérico. Nomear pelo domínio: `frame_utils.py` → `frame_processing.py`.
- `__init__.py` mínimo. Não reexportar tudo.

## Imports

```python
# ordem: stdlib → third-party → local
import json
from pathlib import Path

import cv2
import numpy as np

from detection.hud_detector import HUDDetector
```

- `isort` ou `ruff` organiza automaticamente.
- Sem `from module import *`.
- Imports absolutos preferidos.

## NumPy / OpenCV

- Evitar loops Python sobre arrays NumPy. Usar operações vetorizadas.
- Nomear dimensões explicitamente em comentário quando não óbvio: `# (H, W, C)`.
- `np.float64` vs `np.float32` — escolher conscientemente (OpenCV usa `float32`).
- Liberar recursos OpenCV: `cap.release()` dentro de `try/finally` ou context manager.

## Testes

- `pytest` para todos os testes.
- Um conceito por teste.
- Nome do teste descreve cenário: `test_hud_detector_returns_false_when_frame_is_menu`.
- `pytest.fixture` para setup compartilhado.
- Sem lógica condicional em testes.
- Testes de integração separados de unitários (`tests/unit/`, `tests/integration/`).

## Smells Comuns

| Smell | Solução |
|-------|---------|
| `dict` como contrato entre funções | `dataclass` ou Pydantic |
| `print` no código | `logger` |
| `except Exception: pass` | Capturar específico, logar, re-raise |
| `os.path.join` | `Path` |
| Loop sobre array NumPy | Operação vetorizada |
| Função com 10+ linhas | Extrair funções menores |
| `Any` no type hint | Tipo concreto ou `Protocol` |
| Variável de ambiente solta | `BaseSettings` centralizado |
| `global` | Injetar dependência |
