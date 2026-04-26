# knowledge/

Este diretório armazena conhecimento de domínio consumível pelos 6 projetos do ecossistema didio (blind-warrior, access-play-create, escudo-do-mestre-v1, mellon-bot, mellon-magic-maker, claude-didio-config) via MCP server (planejado em F02). Cada artigo é um arquivo Markdown com frontmatter YAML obrigatório que permite indexação, busca e filtragem por projeto ou domínio.

## Estrutura

```
knowledge/
├── accessibility/       # WCAG, screen readers, ARIA, audio-first UX, teclado, contraste
│                        #   → relevante p/ blind-warrior, access-play-create
├── crypto-trading/      # trading bots, market making, order book, indicadores técnicos
│                        #   → relevante p/ mellon-bot (mellon-magic-maker se aplicável)
├── game-engine/         # game loops, ECS, spatial audio, state machines
│                        #   → relevante p/ blind-warrior, escudo-do-mestre-v1
└── react-patterns/      # hooks, composition, state management, React Query, WebSocket
                         #   → relevante p/ access-play-create, mellon-magic-maker
```

## Formato do arquivo

Todo artigo deve começar com o frontmatter YAML abaixo. Todos os 4 campos são obrigatórios.

```yaml
---
domain: accessibility          # "accessibility" | "crypto-trading" | "game-engine" | "react-patterns"
projects: [blind-warrior, access-play-create]  # nomes que casam com projects/registry.yaml
tags: [wcag, aria, screen-reader]              # lowercase, hyphen-separated
updated: 2026-04-17                            # data da última revisão (YYYY-MM-DD)
---
```

O valor de `domain` deve casar literalmente com o nome da subpasta onde o arquivo está salvo. Um lint futuro (F02+) vai validar essa consistência automaticamente.

`projects: []` é permitido para artigos genéricos que não se aplicam a um projeto específico, mas é um caso-limite raro — prefira listar os projetos relevantes sempre que possível.

### Exemplo de artigo esqueleto

```markdown
---
domain: accessibility
projects: [blind-warrior, access-play-create]
tags: [aria, live-region, screen-reader]
updated: 2026-04-17
---

# ARIA Live Regions

Live regions (`aria-live`) permitem que leitores de tela anunciem atualizações
dinâmicas sem que o foco do usuário se mova.

## Valores principais

- `polite` — anuncia na próxima pausa do usuário (preferido na maioria dos casos)
- `assertive` — interrompe imediatamente (reservar para erros críticos)

## Referências

- WCAG 2.1 — Success Criterion 4.1.3
- MDN: aria-live attribute
```

## Como adicionar um artigo

1. Escolha o domínio que melhor descreve o conteúdo (`accessibility`, `crypto-trading`, `game-engine` ou `react-patterns`).
2. Crie o arquivo `knowledge/<domínio>/<slug>.md` usando kebab-case para o nome.
3. Preencha o frontmatter com os 4 campos obrigatórios. Os valores válidos para `projects:` estão em `projects/registry.yaml`.
4. Escreva o conteúdo do artigo abaixo do frontmatter.
5. Atualize o campo `updated:` para a data de hoje sempre que revisar o artigo.

## Como adicionar um novo domínio

Criar uma nova subpasta de domínio é uma mudança estrutural que afeta todos os consumidores (MCP server, projetos downstream). Para fazer isso corretamente:

1. Crie a subpasta com um `.gitkeep`.
2. Atualize este README: adicione a pasta em **Estrutura** com descrição de escopo.
3. Se a mudança for significativa (novo contrato de MCP, impacto em múltiplos projetos), abra um ADR em `docs/adr/`.
4. O valor do novo domínio deve ser adicionado ao enum de `domain:` aceito pelas ferramentas (F02+).

Não crie subpastas sem passar por esse processo — artigos com `domain:` fora das pastas conhecidas falharão na validação do lint.

## Consumidores

| Consumidor | Como usa | Status |
|---|---|---|
| MCP server (`mcp-server/`) | Expõe `knowledge.list` e `knowledge.get` para projetos downstream | Disponível (F04) |
| Scripts de rollout (`sync/`) | Podem ler artigos para instalar em projetos downstream | Planejado (F05) |
