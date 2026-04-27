# patterns/

Este diretório contém **artefatos executáveis reutilizáveis** compartilhados entre os projetos do ecossistema didio. A distinção central em relação a `knowledge/` é: `knowledge/` armazena informação e conceitos (o quê e por quê); `patterns/` armazena artefatos que você copia, executa ou referencia diretamente (prompts, scripts, snippets de código). Se você está descrevendo acessibilidade web, vai para `knowledge/`; se está criando um agente revisor de acessibilidade, vai para `patterns/`.

## Estrutura

```
patterns/
├── agents/     # Prompts de subagentes reutilizáveis
├── skills/     # Claude Code skills (com triggers e gatilhos definidos)
├── hooks/      # Hooks do Claude Code (PreToolUse, PostToolUse, etc.)
└── snippets/   # Trechos de código ou prompts curtos, sem a complexidade de agents/skills
```

### `agents/`

Prompts de subagentes especializados além dos 4 do framework (`architect`, `developer`, `techlead`, `qa`). Exemplos: `accessibility-reviewer`, `crypto-backtester`. Use quando precisar de um agente com domínio específico que pode ser invocado via `didio spawn-agent` em múltiplos projetos.

### `skills/`

Skills no formato do Claude Code — arquivos `SKILL.md` (ou similar) com triggers, gatilhos e instruções de invocação definidos. Diferem dos agentes: skills são invocadas pelo usuário via `/skill-name` dentro de uma sessão Claude; agentes são processos isolados disparados pelo orquestrador. Use quando quiser expor um fluxo interativo ao usuário.

### `hooks/`

Hooks do Claude Code (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, etc.) em shell (`.sh`) ou Node/TypeScript (`.ts`). Devem ser portáveis — sem referências a caminhos absolutos de projetos específicos. Documente dependências de ambiente no cabeçalho do arquivo. **Atenção:** instalar um hook em projeto downstream pode exigir atualização de `.claude/settings.json`; isso é responsabilidade do rollout script (F05), não do pattern em si.

### `snippets/`

Trechos reutilizáveis de código, configuração ou prompts curtos que não justificam a estrutura de um agente ou skill. Use para padrões de 5–50 linhas que aparecem repetidamente em projetos diferentes.

## Formato do arquivo

Todo arquivo dentro de `patterns/` deve começar com YAML frontmatter:

```yaml
---
type: agent | skill | hook | snippet   # enum fechada — nenhum outro valor é válido
projects: [all]                         # ou lista de nomes de projects/registry.yaml
tags: [<lista de tags livres>]
---
```

**Regras por tipo:**

| Tipo | Extensão esperada | Observações |
|------|-------------------|-------------|
| `agent` | `.md` | Prompt em Markdown; sem referências hardcoded a paths |
| `skill` | `SKILL.md` ou `<name>.md` | Deve incluir seção `## Trigger` |
| `hook` | `.sh` ou `.ts` | Documentar deps no cabeçalho; deve ser idempotente |
| `snippet` | `.md`, `.ts`, `.sh`, `.py` | Comentar onde é tipicamente usado |

**Sobre `projects:`**: use `[all]` para patterns genéricos aplicáveis a qualquer projeto. Se o pattern for específico a um subconjunto, liste os nomes exatos conforme aparecem em `projects/registry.yaml`. Valores fora do registry são inválidos.

**Sobre `type:`**: a enum é fechada — `agent`, `skill`, `hook`, `snippet` são os únicos valores aceitos. Se você está criando um tipo novo, atualize esta documentação e abra um ADR antes.

## Como adicionar um pattern

1. Escolha a subpasta correta (`agents/`, `skills/`, `hooks/`, `snippets/`).
2. Crie o arquivo com frontmatter válido (copie o bloco acima).
3. Verifique que `projects:` lista nomes existentes em `projects/registry.yaml` (ou use `[all]`).
4. Garanta portabilidade: sem paths absolutos específicos de um projeto.
5. Se você criou uma subpasta nova ou introduziu um `type:` novo, **atualize este README** — mudanças na taxonomia sem atualização aqui tornam o diretório inconsistente.

## Portabilidade

Agents e hooks **não devem conter referências hardcoded** a caminhos de projetos específicos (ex.: `/Users/fulano/meu-projeto/...`). Use placeholders como `{{PROJECT_ROOT}}` ou `{{PROJECT_NAME}}` que o rollout script (F05) substitui no momento da instalação. Skills e snippets devem seguir a mesma regra quando referenciam arquivos externos.

Exemplo de placeholder aceitável em um hook:

```sh
#!/bin/bash
# deps: none
PROJECT_ROOT="{{PROJECT_ROOT}}"
LOG="$PROJECT_ROOT/logs/hook.log"
```

## Consumidores

- **MCP server (F04):** expõe `patterns.search` e `patterns.get` para que agentes de projetos downstream consultem patterns sem clonar este repo. Disponível (F04).
- **Rollout scripts (F05):** copiam e instanciam patterns nos projetos downstream, substituindo placeholders e atualizando `.claude/settings.json` quando necessário (ex.: registrar um hook novo).

---

## Exemplo: `agents/accessibility-reviewer.md`

```markdown
---
type: agent
projects: [projeto-a, projeto-b]
tags: [accessibility, wcag, review]
---

# Accessibility Reviewer

You are an accessibility specialist agent...
(prompt continua)
```

---

*Taxonomia fechada. Se a sua necessidade não se encaixa em nenhuma das 4 categorias, discuta antes de criar uma subpasta nova.*
