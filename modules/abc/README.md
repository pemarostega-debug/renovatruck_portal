# Módulo: Curva ABC

Clientes classificados em A/B/C por faturamento (OSs faturadas/pagas), com ranking, gráfico e exportação para PDF (janela de impressão).

- **Acesso:** todos os usuários logados · Home → Módulo Financeiro
- **Entrada:** `loadABC()`
- **Dados:** ordens de serviço via `fetchDados()` (`js/core.js`, Apps Script `ordens-servico.gs`)
- **Bibliotecas:** Chart.js

## Arquivos
- `template.html`, `index.js`. Não tem CSS próprio: `#abc-loading` fica em `css/base.css` e o resto usa classes globais e Tailwind.
