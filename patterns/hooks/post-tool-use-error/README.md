---
type: hook
projects: [all]
tags: [discord, observability, post-tool-use, error, bash]
---

# Hook — `post-tool-use-error`

## Propósito

Envia uma notificação Discord quando uma chamada à ferramenta `Bash`
falha (exit code != 0) durante uma sessão Claude Code (evento
`PostToolUse`). Útil para detectar erros silenciosos em runs autônomos.

## Quando instalar

Instale em projetos onde Claude Code executa comandos Bash e você quer
alertas imediatos de falhas, especialmente em pipelines autônomos ou
de longa duração.

## Variáveis de ambiente

| Variável                   | Obrigatória | Descrição                                           |
|----------------------------|-------------|-----------------------------------------------------|
| `DISCORD_WEBHOOK_ALERTS`   | Sim         | URL do webhook Discord para o canal `#claude-alerts` |
| `DISCORD_ENABLED`          | Não         | `false` para desabilitar todos os hooks (default: `true`) |
| `CLAUDE_PROJECT_DIR`       | Não         | Path do projeto; inferido automaticamente pelo Claude Code |
| `CLAUDE_PROJECT_NAME`      | Não         | Nome do projeto; se ausente, derivado de `$CLAUDE_PROJECT_DIR` |

**Nota:** `DISCORD_WEBHOOK_ALERTS` nunca deve ser commitado. Adicione ao
`.env` (gitignored) e carregue via `direnv` ou equivalente.

## Instalação

1. Copie o conteúdo de `hook.json` e mescle na seção `"hooks"` do seu
   `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/patterns/hooks/post-tool-use-error/hook.sh"
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
chmod +x patterns/hooks/post-tool-use-error/hook.sh
```

4. Defina a variável de webhook no `.env`:
```
DISCORD_WEBHOOK_ALERTS=https://discord.com/api/webhooks/...
```

## Como testar manualmente

```bash
# Simular erro Bash (exit_code != 0):
echo '{"tool_name":"Bash","tool_response":{"exit_code":1,"stderr":"command not found: foo"}}' \
  | DISCORD_WEBHOOK_ALERTS=https://discord.com/api/webhooks/... \
    bash patterns/hooks/post-tool-use-error/hook.sh

# Sem erro (exit_code=0): nenhum curl disparado
echo '{"tool_name":"Bash","tool_response":{"exit_code":0}}' \
  | bash patterns/hooks/post-tool-use-error/hook.sh
echo "Exit: $?"

# Tool_name != Bash: nenhum curl disparado
echo '{"tool_name":"Read","tool_response":{"exit_code":1}}' \
  | bash patterns/hooks/post-tool-use-error/hook.sh
echo "Exit: $?"

# Desabilitado:
echo '{"tool_name":"Bash","tool_response":{"exit_code":1}}' \
  | DISCORD_ENABLED=false bash patterns/hooks/post-tool-use-error/hook.sh
echo "Exit: $?"

# Mockar curl para verificar payload:
curl() { echo "MOCK curl $*"; }; export -f curl
echo '{"tool_name":"Bash","tool_response":{"exit_code":2,"stderr":"boom"}}' \
  | DISCORD_WEBHOOK_ALERTS=https://discord.com bash patterns/hooks/post-tool-use-error/hook.sh
```

## Troubleshooting

- **Nenhuma notificação para falhas:** Confirme que `tool_name` no evento
  é exatamente `"Bash"` (case-sensitive). Use `bash -x hook.sh` com input
  de teste para ver cada passo.
- **Parse falha silenciosamente:** O parse de stdin é best-effort via
  `grep -oE`. Se o schema do evento mudar, o hook falha silenciosamente
  (não quebra a sessão). Revise o format do evento em Claude Code se as
  notificações pararem de chegar inesperadamente.
- **Hook dispara para toda ferramenta:** Confirme que `"matcher": "Bash"`
  está correto no `settings.json`.

## Nota sobre frontmatter em arquivos não-Markdown

`hook.json` é JSON puro — frontmatter não aplicável. `hook.sh` inclui
o frontmatter como comentário inicial. Ver `patterns/README.md` para
a política geral.
