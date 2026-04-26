---
type: hook
projects: [all]
tags: [discord, observability, subagent, stop, progress]
---

# Hook — `subagent-stop-progress`

## Propósito

Envia uma notificação Discord quando um subagente Claude Code termina
(evento `SubagentStop`). Útil para acompanhar o progresso de workflows
multi-agente (ex.: Architect → Developer → TechLead → QA).

## Quando instalar

Instale em projetos que usam o workflow de 4 agentes do
claude-didio-config ou qualquer pipeline com múltiplos subagentes, onde
você quer visibilidade de quais agentes concluíram.

## Variáveis de ambiente

| Variável                    | Obrigatória | Descrição                                              |
|-----------------------------|-------------|--------------------------------------------------------|
| `DISCORD_WEBHOOK_PROGRESS`  | Sim         | URL do webhook Discord para o canal `#claude-progress` |
| `DISCORD_ENABLED`           | Não         | `false` para desabilitar todos os hooks (default: `true`) |
| `CLAUDE_PROJECT_DIR`        | Não         | Path do projeto; inferido automaticamente pelo Claude Code |
| `CLAUDE_PROJECT_NAME`       | Não         | Nome do projeto; se ausente, derivado de `$CLAUDE_PROJECT_DIR` |
| `CLAUDE_SUBAGENT_ROLE`      | Não         | Role do subagente (ex.: `developer`, `qa`); se ausente, tenta ler de stdin |

**Nota:** `DISCORD_WEBHOOK_PROGRESS` nunca deve ser commitado. Adicione ao
`.env` (gitignored) e carregue via `direnv` ou equivalente.

## Instalação

1. Copie o conteúdo de `hook.json` e mescle na seção `"hooks"` do seu
   `.claude/settings.json`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/patterns/hooks/subagent-stop-progress/hook.sh"
          }
        ]
      }
    ]
  }
}
```

2. Se `$CLAUDE_PROJECT_DIR` não estiver disponível, substitua por
   `{{PROJECT_ROOT}}` ou o path absoluto do projeto.

3. Torne o script executável:
```bash
chmod +x patterns/hooks/subagent-stop-progress/hook.sh
```

4. Defina a variável de webhook no `.env`:
```
DISCORD_WEBHOOK_PROGRESS=https://discord.com/api/webhooks/...
```

## Como testar manualmente

```bash
# Com role via env var:
CLAUDE_SUBAGENT_ROLE=developer \
  DISCORD_WEBHOOK_PROGRESS=https://discord.com/api/webhooks/... \
  bash patterns/hooks/subagent-stop-progress/hook.sh

# Sem role (fallback para "unknown"):
DISCORD_WEBHOOK_PROGRESS=https://discord.com/api/webhooks/... \
  bash patterns/hooks/subagent-stop-progress/hook.sh

# Desabilitado:
DISCORD_ENABLED=false bash patterns/hooks/subagent-stop-progress/hook.sh
echo "Exit: $?"

# Webhook ausente (silent skip):
bash patterns/hooks/subagent-stop-progress/hook.sh
echo "Exit: $?"

# Mockar curl para verificar payload:
curl() { echo "MOCK curl $*"; }; export -f curl
CLAUDE_SUBAGENT_ROLE=qa \
  DISCORD_WEBHOOK_PROGRESS=https://discord.com \
  bash patterns/hooks/subagent-stop-progress/hook.sh
```

## Troubleshooting

- **Nenhuma notificação:** Confirme que `DISCORD_WEBHOOK_PROGRESS` está
  definido no ambiente de execução do Claude Code.
- **Role sempre "unknown":** Defina `CLAUDE_SUBAGENT_ROLE` no ambiente
  antes de lançar o subagente, ou confirme que o evento stdin contém o
  campo `role`.
- **Hook não dispara:** Confirme que `SubagentStop` está na chave correta
  em `settings.json`.

## Nota sobre frontmatter em arquivos não-Markdown

`hook.json` é JSON puro — frontmatter não aplicável. `hook.sh` inclui
o frontmatter como comentário inicial. Ver `patterns/README.md` para
a política geral.
