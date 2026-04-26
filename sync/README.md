# sync/

Scripts de rollout do ecossistema didio. Entregue em F05 (slim).

> Consumidor real: F06 em `claude-didio-config` usa o MCP instalado por
> estes scripts para fazer `mcp__second-brain__memory_search` em vez de
> ler `memory/agent-learnings/*.md` direto.

## Conteúdo

- `lib.sh` — biblioteca compartilhada (log, backup, jq merge, registry update)
- `install-mcp-in-project.sh` — instala o MCP `second-brain` em um projeto downstream
- `install-discord-hooks.sh` — instala os 3 hooks Discord (user-scope ou per-project)
- `tests/` — testes bash dos scripts acima

## Pré-requisitos

- `jq` instalado (macOS: `brew install jq`)
- `bun` instalado (para o MCP server)
- Path do hub: o hub é localizado via `${BASH_SOURCE[0]}` nos scripts;
  não precisa variável de ambiente.

## Instalar o MCP em um projeto

```bash
bash sync/install-mcp-in-project.sh /Users/eduardodidio/<project>
```

Opções:
- `--dry-run` — imprime o diff esperado sem escrever.

O script:
1. Valida o target.
2. Cria `.claude/` se preciso.
3. Backup com timestamp UTC.
4. Merge em `mcpServers.second-brain` apontando para `mcp-server/src/index.ts` do hub.
5. Atualiza `projects/registry.yaml` (`mcp_integrated: true` para o projeto correspondente).

## Instalar os hooks Discord

User-scope (recomendado — cobre qualquer projeto futuro):
```bash
bash sync/install-discord-hooks.sh --user-scope
```

Per-project (alternativo):
```bash
bash sync/install-discord-hooks.sh --project /Users/eduardodidio/<project>
```

Ambos suportam `--dry-run`.

**Trade-off user-scope vs per-project**: ver [ADR-0005](../docs/adr/0005-sync-strategy.md).

## Hub helpers requeridos

Os hooks Discord apontam para o hub via `SYNC_HUB_DIR`. O install
valida que o hub contém:

- `patterns/hooks/_lib/load-env.sh` — carregamento de `.env` do hub
- `patterns/hooks/_lib/registry-match.sh` — filtro
  `CLAUDE_PROJECT_DIR` via `projects/registry.yaml`
- `patterns/hooks/_lib/feature-context.sh` — detecção de
  feature/task/phase para enriquecer notificações (F14)

Falta de qualquer um desses arquivos faz o install abortar com
exit code 4.

## Rollout completo

Estado pós-F05.b: 6/6 projetos didio têm `mcp_integrated: true` em
[`projects/registry.yaml`](../projects/registry.yaml):

1. `blind-warrior`
2. `access-play-create`
3. `escudo-do-mestre-v1`
4. `mellon-bot`
5. `mellon-magic-maker`
6. `claude-didio-config` (piloto F05)

Para adicionar um projeto novo:

```bash
# 1. Adicione entrada em projects/registry.yaml (mcp_integrated: false)
# 2. Rode:
bash sync/install-mcp-in-project.sh /Users/eduardodidio/<novo-projeto>
```

Hooks Discord já cobrem qualquer projeto novo automaticamente
(instalados user-scope em F05). Veja `patterns/hooks/README.md`
para o comportamento do filtro `CLAUDE_PROJECT_DIR`.

## Testes

```bash
bash sync/tests/run-all.sh
```

## Referências

- ADR-0005: [`../docs/adr/0005-sync-strategy.md`](../docs/adr/0005-sync-strategy.md)
- Registry: [`../projects/registry.yaml`](../projects/registry.yaml)
