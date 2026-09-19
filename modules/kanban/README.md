# Módulo: Kanban Operacional

Veículos no pátio (vindos da portaria) organizados em colunas: aguardando orçamento/vaga, aguardando peça, em execução, finalizados. Cada card pode ter OSs vinculadas, observação e valor de compra de peça.

- **Acesso:** todos os usuários logados · Home → Módulo Operacional
- **Entrada:** `initKanban()`
- **Dados:** Apps Script da portaria (`KB.APPS_SCRIPT_URL`), estado do quadro com cópia em `localStorage` (`rv_kanban_estado`) e valores das OSs a partir do `dados.json`. Sem conexão, mostra dados de demonstração.
- **Compartilha:** `kbEsc()` agora mora em `js/core.js`, porque Histórico e Manual também usam

## Arquivos
- `template.html`, `index.js`, `style.css` (escopado em `#screen-kanban`, carrega sob demanda)
