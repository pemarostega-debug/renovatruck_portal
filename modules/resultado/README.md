# Módulo: Resultado Semanal

Fechamento semanal para a reunião de segunda da diretoria: OSs finalizadas × valores, custo de peças, margem, curva ABC, evolução, PDF e Excel.

- **Acesso:** **somente admin**. O router barra antes de baixar qualquer arquivo (`soAdmin` em `js/router.js`), e o card da home só aparece com `body.rv-admin`
- **Entrada:** `initResultado()`
- **Dados:** planilha de OSs finalizadas (`CONFIG.SHEET_FINALIZADAS_ID`) + `apps-script/resultado-semanal.gs` (`CONFIG.RESULTADO_SEMANAL_API`). Guia: `integracao/LEIA-ME-resultado-semanal.md`. Custo de peça é sigiloso e nunca vai para o repositório (que é público).
- **Bibliotecas:** Chart.js, xlsx, PapaParse

## Arquivos
- `template.html` (abre com o comentário que documenta a barra de qualidade do módulo), `index.js`, `style.css` (escopado, carrega sob demanda)
