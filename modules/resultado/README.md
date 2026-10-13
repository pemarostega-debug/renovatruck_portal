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

## Peças DIV entram sem custo

DIV é sucata e peça fora do inventário. O Genesis às vezes traz um `preco_custo`
marcado nessas linhas, mas ele não é confiável e **não entra na conta** — é
decisão da diretoria, para bater com a análise manual. O único custo que a DIV
pode receber é a estimativa do parâmetro "Custo estimado das peças DIV"
(% do preço de venda), que vale **0** por padrão.

O custo marcado continua nos dados e na exportação para Excel; só não entra no
resultado. Por isso a coluna da tabela de OSs se chama **Custo peças estoque**:
é o custo que de fato pesa na margem.

## valor_pecas: unitário ou já total? (`nivelValorPeca`)

O relatório "OSs detalhe" do Genesis sempre traz `valor_total` pronto (linha já
calculada). A `vw_os_produto_serviço` ao vivo **não tem essa coluna** — e nela
`valor_pecas` não é preço unitário, já é o total da linha. Mesmo nome de coluna,
semântica diferente por origem; não dá pra simplesmente escolher uma das duas.

`nivelValorPeca()` decide olhando o conjunto (mesma família do `nivelDoCampo`
do desconto): nas linhas com quantidade > 1, calcula a margem sobre o custo nas
duas leituras possíveis (unitário × qtd, ou já total) e fica com a que dá margem
plausível. Achado em produção em 09/10/2026: a OS 4826 batia R$ 1.763,47 ao
centavo contra o relatório oficial tratando `valor_pecas` como total, e
R$ 42.060,89 multiplicando por quantidade — foi essa dobra, espalhada por várias
OSs da semana, que inflou o faturamento de R$ 36.767 para R$ 239 mil no portal.
Quando a detecção acha "total", a tela avisa (`nivelValorPeca === 'total'`).

Duas OSs dessa mesma investigação (4786, 4826) pareciam ter erro de digitação
no Genesis — não tinham: era exatamente essa dobra. `marcarDominantes()` (que
avisa quando um item sozinho domina a OS) continua no código como rede de
segurança para erros de digitação de verdade, mas o comentário ali foi
corrigido para não repetir o diagnóstico errado.

## Mão de obra: semana × mês

Na semana, os dias trabalhados vêm do calendário, e **o sábado não vale um dia
inteiro**: na oficina se trabalha só até o almoço. O peso do sábado é o
parâmetro `sabado` (padrão **0,5**), então a semana cheia dá **5,5 dias**, não 6
— é assim que a folha de R$ 45.000 + 10% de HE ÷ 24 × 1,52 × 5,5 fecha os
R$ 17.242,50 da planilha manual da diretoria.

No mês, **não** se usa o calendário: a folha mensal já é o custo do mês inteiro,
e um mês de cinco sábados passaria da base de rateio de 24 e inflaria o custo
sem nada ter sido gasto a mais. O padrão do mês é a própria base (`diasMes`) —
`RS_CALC.diasDoPeriodo`. O campo na tela aceita meio dia (0,5) para feriado
emendado ou sábado que não abriu.
