# Módulo: Histórico de Entrada/Saída

Consulta da movimentação da portaria por período e placa.

- **Acesso:** todos os usuários logados · Home → Módulo Operacional
- **Entrada:** `initHistorico()`
- **Dados:** o mesmo Apps Script da portaria usado pelo Kanban (ação `historico_range`). Se o Kanban já estiver carregado, reaproveita `KB.APPS_SCRIPT_URL`; se não, usa a mesma URL escrita no próprio módulo.

## Arquivos
- `template.html`, `index.js`, `style.css` (escopado em `#screen-historico`, carrega sob demanda)
