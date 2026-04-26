---
type: snippet
tags: [vite, react, tanstack-query, tailwind, shadcn, setup, bootstrap]
updated: 2026-01-01
---

# Vite + React + TanStack Query + shadcn Setup

Stack de frontend moderna com Vite, React, TanStack Query, Tailwind CSS e shadcn/ui.

## Uso

Execute os comandos abaixo em sequência para criar um novo projeto com a
stack completa. Depois copie os arquivos de configuração listados.

```sh
# 1. Criar projeto Vite + React + TypeScript
bun create vite@latest my-app -- --template react-ts
cd my-app

# 2. Instalar dependências
bun install
bun add @tanstack/react-query
bun add -d tailwindcss postcss autoprefixer
bunx tailwindcss init -p

# 3. Inicializar shadcn
bunx shadcn@latest init
```

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minuto
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn() é o helper padrão shadcn para composição de classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```sh
# Instalar dependências do helper cn()
bun add clsx tailwind-merge
```

## Notas de configuração

- **`staleTime: 1000 * 60`** — queries ficam frescas por 1 minuto; ajuste
  por query com `useQuery({ staleTime: ... })` quando necessário.
- **shadcn `init`** — responda `yes` para Tailwind CSS e escolha o alias
  `@/` para imports. O `cn()` em `@/lib/utils.ts` é gerado automaticamente.
- **Tailwind** — configure `content` em `tailwind.config.js` para incluir
  `./src/**/*.{ts,tsx}`.
