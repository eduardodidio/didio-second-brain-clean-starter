# patterns/hooks/

Hooks Discord padronizados do ecossistema didio. Instalar via
`sync/install-discord-hooks.sh` (ver F05). Filtro por projeto via
`_lib/registry-match.sh` (F05b).

## Hooks disponíveis

| Hook | Evento | Canal Discord |
|---|---|---|
| `stop-session-summary/` | `Stop` | `#claude-done` (env `DISCORD_WEBHOOK_DONE`) |
| `subagent-stop-progress/` | `SubagentStop` | `#claude-progress` (env `DISCORD_WEBHOOK_PROGRESS`) |
| `post-tool-use-error/` | `PostToolUse` (exit_code ≠ 0 em Bash) | `#claude-alerts` (env `DISCORD_WEBHOOK_ALERTS`) |

## Filtro `CLAUDE_PROJECT_DIR`

Hooks user-scope disparam em **toda** sessão Claude Code do usuário
(decisão ADR-0005). Para evitar ruído em projetos fora do
ecossistema didio, os 3 hooks sourceiam
`_lib/registry-match.sh` e saem silenciosos (`exit 0`) se
`$CLAUDE_PROJECT_DIR` não bater com nenhum `path:` em
`projects/registry.yaml`.

### Fluxo
1. Claude Code dispara o hook (com `$CLAUDE_PROJECT_DIR` setada).
2. Hook checa `DISCORD_ENABLED` e webhook presente.
3. Hook sourceia `_lib/registry-match.sh` e chama `registry_match`.
4. Se no-match → `exit 0` silencioso.
5. Se match → POST Discord normal.

Ver decisão em [ADR-0006](../../docs/adr/0006-cross-project-rollout.md).

## Variáveis de ambiente

| Var | Default | Efeito |
|---|---|---|
| `SECOND_BRAIN_HUB` | `/Users/eduardodidio/didio-second-brain-claude` | Path do hub. Usado para localizar `registry.yaml`. |
| `DIDIO_HOOKS_DISABLE_FILTER` | `0` | `1` desliga o filtro — hook dispara em qualquer projeto. |
| `DISCORD_ENABLED` | `true` | `false` silencia todos os hooks. |
| `DISCORD_WEBHOOK_PROGRESS` | (vazio) | Webhook de `#claude-progress`. Vazio → hook sai. |
| `DISCORD_WEBHOOK_ALERTS` | (vazio) | Webhook de `#claude-alerts`. Vazio → hook sai. |
| `DISCORD_WEBHOOK_DONE` | (vazio) | Webhook de `#claude-done`. Vazio → hook sai. |

## Debug

- Bypassar o filtro: `DIDIO_HOOKS_DISABLE_FILTER=1 bash patterns/hooks/stop-session-summary/hook.sh`
- Silenciar tudo: `export DISCORD_ENABLED=false` no shell.
- Verificar que um projeto está no registry:
  `grep -A1 "name: <proj>" ${SECOND_BRAIN_HUB}/projects/registry.yaml`

## Referências

- ADR-0004 (Discord observabilidade): `docs/adr/0004-discord-observability.md`
- ADR-0005 (sync strategy — user-scope): `docs/adr/0005-sync-strategy.md`
- ADR-0006 (filtro CLAUDE_PROJECT_DIR): `docs/adr/0006-cross-project-rollout.md`
- Instalação: `sync/README.md` (F05)
