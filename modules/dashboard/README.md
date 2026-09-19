# Módulo: Dashboard Gerencial

OSs em aberto (a faturar, aguardando pedido…) e faturamento por cliente, com gráficos de OSs finalizadas por dia e por mês e exportação para Excel.

- **Acesso:** todos os usuários logados · Home → Módulo Operacional
- **Entrada:** `fetchData()` (roda toda vez que a tela abre)
- **Dados:** `dados.json` (via `fetchDados()` do `js/core.js`, gerado pelo `exportar-dados.js`) + planilha de OSs finalizadas (`CONFIG.SHEET_FINALIZADAS_ID`, CSV público do Google Sheets)
- **Bibliotecas:** Chart.js, xlsx, PapaParse (baixadas pelo router)

## Arquivos
- `template.html`: a tela
- `index.js`: lógica; `dashPrepararTela()` roda uma vez, quando o módulo carrega
- `style.css`: **global, sem escopo**. Vai no `<head>` do `index.html` e carrega sempre, antes do CSS da Precificação. A ordem entre os dois define o visual atual (`.card`, `.card-title`…), por isso não carrega sob demanda.
