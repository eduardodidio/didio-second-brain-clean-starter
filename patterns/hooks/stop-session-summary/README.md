---
type: hook
projects: [all]
tags: [discord, observability, stop, session]
---

# Hook — `stop-session-summary`

## Propósito

Envia uma notificação Discord quando uma sessão Claude Code termina
(evento `Stop`). Útil para saber quando uma sessão longa concluiu,
especialmente ao rodar agentes autônomos.

## Quando instalar

Instale este hook em qualquer projeto do ecossistema didio onde você
quer visibilidade sobre o fim de sessões Claude Code. Especialmente
recomendado para projetos com runs longos ou não supervisionados.

## Variáveis de ambiente

| Variável                | Obrigatória | Descrição                                         |
|-------------------------|-------------|---------------------------------------------------|
| `DISCORD_WEBHOOK_DONE`  | Sim         | URL do webhook Discord para o canal `#claude-done` |
| `DISCORD_ENABLED`       | Não         | `false` para desabilitar todos os hooks (default: `true`) |
| `CLAUDE_PROJECT_DIR`    | Não         | Path do projeto; inferido automaticamente pelo Claude Code |
| `CLAUDE_PROJECT_NAME`   | Não         | Nome do projeto; se ausente, derivado de `$CLAUDE_PROJECT_DIR` |

**Nota:** `DISCORD_WEBHOOK_DONE` nunca deve ser commitado. Adicione ao
`.env` (gitignored) e carregue via `direnv` ou equivalente. Ver
`.env.example` na raiz do projeto.

## Instalação

1. Copie o conteúdo de `hook.json` e mescle na seção `"hooks"` do seu
   `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/patterns/hooks/stop-session-summary/hook.sh"
          }
        ]
      }
    ]
  }
}
```

2. Se `$CLAUDE_PROJECT_DIR` não estiver disponível no seu ambiente,
   substitua por `{{PROJECT_ROOT}}` ou o path absoluto do projeto.

3. Torne o script executável:
```bash
chmod +x patterns/hooks/stop-session-summary/hook.sh
```

4. Defina a variável de webhook no `.env`:
```
DISCORD_WEBHOOK_DONE=https://discord.com/api/webhooks/...
```

## Como testar manualmente

```bash
# Com webhook real:
DISCORD_WEBHOOK_DONE=https://discord.com/api/webhooks/... \
  bash patterns/hooks/stop-session-summary/hook.sh

# Desabilitado (sem curl, exit 0):
DISCORD_ENABLED=false bash patterns/hooks/stop-session-summary/hook.sh
echo "Exit: $?"

# Webhook ausente (silent skip, exit 0):
bash patterns/hooks/stop-session-summary/hook.sh
echo "Exit: $?"

# Mockar curl para verificar payload:
curl() { echo "MOCK curl $*"; }; export -f curl
DISCORD_WEBHOOK_DONE=https://discord.com bash patterns/hooks/stop-session-summary/hook.sh
```

## Troubleshooting

- **Nenhuma notificação chega:** Verifique se `DISCORD_WEBHOOK_DONE` está
  definido no ambiente onde Claude Code executa (não apenas no shell
  interativo).
- **Hook não dispara:** Confirme que `Stop` está na chave correta em
  `settings.json` e que o path para `hook.sh` está correto.
- **Parse falha silenciosamente:** Este hook não lê stdin — falhas de
  parse não se aplicam.

## Nota sobre frontmatter em arquivos não-Markdown

`hook.json` é JSON puro e não aceita comentários — o frontmatter YAML
não está presente nele. O frontmatter relevante está apenas neste README.
`hook.sh` inclui o frontmatter como comentário inicial (`# type: hook`).
