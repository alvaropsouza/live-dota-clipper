# Clean Code — Boas Práticas

## Nomes

- Nome revela intenção. Se precisa de comentário para explicar, renomear.
- Sem abreviações: `d` → `elapsedDays`, `hp` → `hitPoints`.
- Sem prefixos desnecessários: `m_name`, `strName`, `IInterface`.
- Sem desinformação: não chamar de `list` se não é lista.
- Nomes pronunciáveis e pesquisáveis.
- Classe = substantivo. Função = verbo. `Customer`, `processPayment()`.
- Uma palavra por conceito: não misturar `fetch`, `get`, `retrieve` para a mesma operação.
- Sem números mágicos — constante nomeada sempre.

## Funções

- Fazer uma coisa só. Se precisa de "e" para descrever o que faz, dividir.
- Pequenas. Menores ainda.
- Um nível de abstração por função. Não misturar lógica de alto nível com detalhes.
- Máximo 3 parâmetros. Mais que isso → objeto.
- Sem side effects ocultos. Função que diz `check()` não deve alterar estado.
- Sem flag parameters (`true`/`false`). Dividir em duas funções.
- Command ou Query — nunca os dois. Função faz algo OU retorna algo.
- DRY: duplicação é raiz de todo mal. Abstrair quando aparecer pela terceira vez (regra de três).

## Comentários

- Melhor código não precisa de comentário.
- Comentário bom: intenção, aviso de consequência, TODO (com rastreamento), amplificação de algo não óbvio.
- Comentário ruim: redundante, enganoso, código comentado (deletar — git guarda histórico), diário de mudanças (git faz isso), ruído (`// constructor`).
- Nunca fechar chaves com comentário: `} // end if`.

## Formatação

- Arquivo pequeno é melhor que arquivo grande. Ideal: < 200 linhas.
- Conceitos relacionados ficam juntos verticalmente.
- Conceitos não relacionados ficam separados por linha em branco.
- Variáveis declaradas próximas ao uso.
- Funções chamadas abaixo das que as chamam (fluxo de cima para baixo).
- Linha curta. Sem scroll horizontal.
- Time define formatação e todos seguem. Prettier resolve isso.

## Objetos e Estruturas de Dados

- Estrutura de dados expõe dados, sem comportamento.
- Objeto esconde dados, expõe comportamento.
- Não misturar os dois (híbrido é o pior dos mundos).
- Lei de Demeter: objeto não fala com estranhos. `a.getB().getC().doSomething()` → violação.
- Train wrecks: `a.b.c.d` → sinal de acoplamento excessivo.

## Tratamento de Erros

- Preferir exceções a códigos de retorno de erro.
- Não retornar `null`. Lançar exceção ou retornar tipo especial.
- Não passar `null` como argumento.
- Criar exceções com contexto: mensagem clara + dados relevantes para rastrear.
- Separar lógica de negócio de tratamento de erro (try/catch em função própria).

## Boundaries (Fronteiras)

- Código de terceiros fica isolado. Nunca espalhar chamadas de lib por todo o codebase.
- Testar código de terceiros com learning tests. Documenta comportamento e detecta mudanças em updates.
- Depender de abstração própria, não da lib diretamente.

## Testes

- Um assert por teste (idealmente).
- Um conceito por teste.
- FIRST: Fast, Independent, Repeatable, Self-validating, Timely.
- Teste limpo é tão importante quanto código de produção.
- Sem lógica condicional em testes.
- Dados de teste legíveis — Build-Operate-Check pattern.

## Classes

- Pequenas. Responsabilidade única (SRP).
- Nome da classe deve descrever responsabilidade. Se usa "e", "ou", "mas" → dividir.
- Alta coesão: variáveis de instância usadas pela maioria dos métodos.
- Aberta para extensão, fechada para modificação (OCP).
- Depender de abstrações, não de implementações concretas (DIP).

## Sistemas

- Separar construção de uso. `main` constrói o sistema, a aplicação só usa.
- Dependency Injection para separar construção de lógica.
- Crescer incrementalmente. Não over-engineer desde o início.
- Decisões devem ser adiadas até o último momento responsável.

## Emergência (Regras de Kent Beck)

1. Passa todos os testes.
2. Sem duplicação.
3. Expressa intenção do programador.
4. Minimiza número de classes e funções.

Nessa ordem. Sem testes, nada mais importa.

## Smells Comuns

| Smell | Solução |
|-------|---------|
| Função longa | Extrair funções |
| Lista de parâmetros longa | Objeto de parâmetros |
| Código duplicado | Extrair e centralizar |
| Classe grande | Dividir responsabilidades |
| Comentário explicando código | Renomear / extrair |
| Número mágico | Constante nomeada |
| Código morto | Deletar |
| Switch/if-else em cascata | Polimorfismo ou union type |
| Inveja de funcionalidade | Mover método para classe certa |
| Acoplamento temporal oculto | Tornar sequência explícita |
