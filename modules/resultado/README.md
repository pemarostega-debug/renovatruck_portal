# Módulo: Resultado Semanal

Fechamento para a reunião de segunda da diretoria: OSs finalizadas × valores, custo de peças, margem, curva ABC, evolução, PDF e Excel.

**Semana ou mês.** A pílula "Semana · Mês" no topo troca o passo do mesmo estudo — o cálculo é um só (`RS_CALC.PASSO`), muda o recorte. A escolha fica no `localStorage` (`rs_passo`). Fechamentos salvos são indexados por `de`/`ate`, então o fechamento do mês convive com o da semana sem conflito.

- **Acesso:** **somente admin**. O router barra antes de baixar qualquer arquivo (`soAdmin` em `js/router.js`), e o card da home só aparece com `body.rv-admin`
- **Entrada:** `initResultado()`
- **Dados:** planilha de OSs finalizadas (`CONFIG.SHEET_FINALIZADAS_ID`) + `apps-script/resultado-semanal.gs` (`CONFIG.RESULTADO_SEMANAL_API`). Guia: `integracao/LEIA-ME-resultado-semanal.md`. Custo de peça é sigiloso e nunca vai para o repositório (que é público).
- **Bibliotecas:** Chart.js, xlsx, PapaParse

## Arquivos
- `template.html` (abre com o comentário que documenta a barra de qualidade do módulo), `index.js`, `style.css` (escopado, carrega sob demanda)

## Como o desconto entra na conta

O valor de peça e serviço sai **líquido**: o desconto é rateado sobre os itens
na leitura, não subtraído no fim. Desconto de peça sai das peças (pode deixar a
peça negativa — na OS 4782, R$ 400 de desconto sobre R$ 381,50 de peças dão
−R$ 18,50 e total de R$ 781,50); desconto de item de serviço sai do serviço.

Algumas origens repetem o **desconto do cabeçalho da OS em cada linha** do
detalhe — somar linha a linha daria 17× o valor numa OS com 17 peças. A leitura
detecta isso olhando o conjunto (`nivelDoCampo`): se em praticamente toda OS com
mais de uma linha o campo repete o mesmo número, é cabeçalho e conta uma vez só.
Rateio de verdade quase nunca sai idêntico em dezenas de OSs seguidas. Quando a
detecção dispara, a tela avisa.

## Mão de obra: semana × mês

Na semana, os dias trabalhados vêm do calendário (segunda a sábado). No mês,
**não**: a folha mensal já é o custo do mês inteiro, e setembro com 26 dias de
segunda a sábado contra a base de rateio de 24 inflaria o custo em 8% todo mês.
O padrão do mês é a própria base (`diasMes`) — `RS_CALC.diasDoPeriodo`. O campo
na tela aceita meio dia (0,5) para sábado curto ou feriado emendado.
