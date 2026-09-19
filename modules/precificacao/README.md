# Módulo: Calculadora de Precificação

Preço de serviço (mão de obra, deslocamento) e peças, com impostos do regime tributário, rentabilidade alvo e estudos salvos.

- **Acesso:** todos os usuários logados · Home → Módulo Operacional
- **Id no router:** `prec` (tela `#screen-prec`)
- **Entrada:** nenhuma; `precPrepararTela()` roda uma vez quando o módulo carrega
- **Dados:** só no navegador (`localStorage`: configuração `rv_prec_cfg_v1` e estudos salvos). Nada vai para servidor.

## Arquivos
- `template.html`: a tela e os modais `#modal-cfg` / `#modal-saved`
- `index.js`: cálculo, configuração e estudos
- `style.css`: **global, sem escopo**, e carrega sempre (no `<head>`). Define `header`, `.modal`, `.overlay`, `.toast`, `.btn`, que outros módulos também usam. Não mover para carregamento sob demanda sem revisar esses usos.
