# TypeScript Best Practices

## Configuração

`strict: true` obrigatório. Também habilitar:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true
  }
}
```

## Tipos vs Classes

Usar `type` para dados. Classes só para comportamento.

```ts
// bom
type User = {
  id: string
  name: string
}

// ruim
class User {
  constructor(public id: string, public name: string) {}
}
```

Usar `interface` só quando: API pública, declaration merging, design de lib.

## Proibido: `any`

```ts
// ruim
const value: any

// bom
const value: unknown

if (typeof value === "string") {
  value.toUpperCase()
}
```

## Discriminated Unions

```ts
type Result =
  | { type: "success"; data: User }
  | { type: "error"; message: string }

switch (result.type) {
  case "success": ...
  case "error": ...
}
```

Dá exhaustive checking. Preferir sobre `status: string`.

## Proibido: Enums

```ts
// ruim
enum Status { Pending, Completed }

// bom
const Status = {
  Pending: "pending",
  Completed: "completed",
} as const

type Status = typeof Status[keyof typeof Status]
```

Benefícios: tree-shakeable, serializável, debuggável.

## Literal Types

```ts
type Role = "admin" | "user" | "guest"
```

## Validação de Dados Externos

Nunca confiar em: APIs, banco, Redis, env vars, input do usuário.

Sempre validar com Zod ou Valibot:

```ts
const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
})

type User = z.infer<typeof UserSchema>
```

Inferir tipos do schema. Nunca duplicar interface + schema.

## Funções

- Funções pequenas com responsabilidade única.
- Preferir funções puras. Evitar mutações ocultas.
- Guard clauses no lugar de nesting profundo:

```ts
if (!user) return
if (!invoice) return
// ...
```

- Parâmetros múltiplos → objeto nomeado:

```ts
// ruim
createInvoice(id, value, currency, tax)

// bom
createInvoice({ id, value, currency, tax })
```

- Sem parâmetros booleanos posicionais:

```ts
// ruim
createUser(true)

// bom
createUser({ sendEmail: true })
```

## Erros

```ts
// ruim
throw "error"

// bom
throw new Error("error")

// melhor
throw new UserNotFoundError()
throw new PaymentExpiredError()
throw new InvoiceAlreadyPaidError()
```

Criar domain errors específicos. Nunca lançar strings.

## Imutabilidade

```ts
readonly id: string
Readonly<User>
```

## Switches Exaustivos

```ts
switch (status) {
  case "pending": ...
  case "paid": ...
  default:
    const _: never = status
}
```

## Imports

- Imports absolutos com path aliases: `@/utils` não `../../../../utils`.
- Evitar barrel files (`index.ts`) exceto em APIs públicas estáveis.
- Tipos próximos ao uso. Sem `types.ts` com tipos não relacionados.

## Organização

Feature-first:

```
users/
  create-user.ts
  delete-user.ts
  repository.ts
  schema.ts

payments/
orders/
```

Separar domínio de infraestrutura:

```
domain/
application/
infrastructure/
presentation/
```

Regras de negócio não dependem de Express, Fastify, Prisma ou HTTP.

Nunca vazar models do ORM. Mapear: Database → Domain → DTO → HTTP.

## Dependency Injection

```ts
// ruim
const db = new PrismaClient() // dentro da função

// bom
constructor(private db: PrismaClient)
```

## Generics

Não adicionar genérico antes de ter 2+ casos reais de uso. Começar concreto.

## Return Types Explícitos

Funções exportadas e APIs públicas devem ter return type explícito:

```ts
export function createUser(dto: CreateUserDto): Promise<User>
```

## Tipos em Runtime

TypeScript some em runtime. Validação, autorização e invariantes críticos precisam de código runtime (Zod), não só tipos.

## Value Objects

```ts
// ruim
email: string

// bom
email: Email
amount: Money
document: CPF
```

## Utility Types

Usar em vez de duplicar shapes:

`Partial<T>` `Required<T>` `Readonly<T>` `Pick<T, K>` `Omit<T, K>`
`Record<K, V>` `Exclude<T, U>` `Extract<T, U>` `ReturnType<T>` `Parameters<T>`

## Stack Recomendada

| Categoria | Ferramenta |
|-----------|-----------|
| Formatter | Prettier |
| Linter | ESLint + typescript-eslint |
| Validação runtime | Zod ou Valibot |
| Testes | Vitest |
| Package manager | pnpm |
| Build | tsup / tsdown / Vite |
| Backend | Fastify |
| ORM | Drizzle |
| Logging | Pino |

## ESLint — Regras Obrigatórias

```
no-explicit-any
no-floating-promises
no-unused-vars
consistent-type-imports
no-misused-promises
prefer-nullish-coalescing
eqeqeq
```
