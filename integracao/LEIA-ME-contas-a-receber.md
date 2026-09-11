# Contas a Receber & Operações Financeiras — implantação e operação

Módulo do portal Renova (`dash.renovatruck.com.br`). Frontend no `index.html`,
backend em Apps Script sobre a **mesma planilha** do Contas a Pagar, e um script
Node para falar com o Genesis (MySQL).

```
Genesis (MySQL) ──extrair-contas-receber.js──► Apps Script (contas-receber.gs)
                                                       │        ▲
                                                       │        │
                                      Google Sheets ◄──┘        │
                                    (abas Rec*)                 │
                                                                │
                        index.html (GitHub Pages) ──────────────┘
                                    │
                                    └── na liquidação: chama a API do
                                        Contas a Pagar e lança o deságio
                                        em 3.07, já baixado
```

---

## Por que o módulo é um só

Antecipação não é um relatório sobre o contas a receber: é uma **mudança de dono
do título**. Depois de antecipado, o dinheiro do vencimento não entra mais no
caixa da Renova — mas a cobrança continua sendo dela, porque a coobrigação não
vai embora junto com o título.

Duas telas separadas produziriam dois números de "a receber" que nunca fecham
entre si. Aqui existe um número só, e a coluna `antecipado` diz de quem ele é. A
home tem dois cartões porque é assim que a Diretoria pensa neles, mas os dois
abrem a mesma tela.

---

## 1. Publicar o backend

1. Crie um projeto **novo** em [script.google.com](https://script.google.com).
   Não reaproveite o do Contas a Pagar: cada projeto Apps Script só admite um
   `doGet`/`doPost`.
2. Apague o `Codigo.gs` e cole `apps-script/contas-receber.gs` inteiro. Salve.
3. Rode a função **`instalar()`** uma vez. Ela cria, **na planilha do Contas a
   Pagar**, as abas `RecTitulos`, `RecParceiros`, `RecPoliticas`, `RecOperacoes`,
   `RecOperacaoItens`, `RecAntecipOS`, `RecSyncStaging` e `RecLog`. Autorize.
4. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
5. Copie a URL `/exec`.

## 2. Ligar o frontend

No `index.html`, procure `CR.API` e troque o texto pela URL do passo 1:

```js
const CR = {
  API: 'https://script.google.com/macros/s/AKfy.../exec',
```

Commite e dê push. O GitHub Pages publica sozinho.

> **Não esqueça do `.nojekyll`.** Sem ele o build do Pages estoura o timeout de
> 10 minutos e o site congela na versão antiga.

## 3. Republicar o Contas a Pagar — obrigatório

O deságio das operações é lançado na conta **3.07 Juros de Operações
Financeiras**, que não existia no plano semeado. Duas coisas mudaram no
`apps-script/contas-pagar.gs`:

- `PLANO_INICIAL` ganhou a linha do 3.07;
- entrou a função **`garantirContasNovas()`**, que acrescenta ao plano as contas
  que ainda não existem — porque `semearPlano()` só age em planilha vazia e
  nunca chegaria a uma base em produção.

Faça, no projeto do Contas a Pagar:

1. Cole a versão nova do `contas-pagar.gs`.
2. Rode **`garantirContasNovas()`** uma vez, na mão. O log diz o que entrou.
3. **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão.**

Sem o passo 2 a liquidação de operação falha na hora de lançar a despesa. (Não é
perda de dado: o crédito fica gravado e o botão *relançar despesa* resolve
depois — ver "Liquidação", abaixo.)

## 4. Sincronizar as notas de saída do Genesis

Precisa rodar numa máquina com acesso ao banco (rede do escritório, VPN ou a VPS).

```bash
node integracao/extrair-contas-receber.js --desde 2026-06-01 --enviar --api <url/exec> --token <token>
```

As notas vão para a aba `RecSyncStaging`. No portal: **Contas a Receber →
Sincronizar Notas de Saída**, confira e aprove. Nada vira título sem aprovação.

Sem `--enviar` o script só grava `integracao/contas-receber-sync.json` para
conferência. O token sai do console do navegador com o portal aberto e logado:
digite `RV.token`.

### 4.1 Automatizar (cron na VPS)

Mesma VPS Locaweb (`200.234.212.214`) que já roda o `exportar-dados.js` e o
extrator do contas a pagar.

1. Apps Script do Contas a **Receber** → ⚙ *Configurações do projeto* →
   *Propriedades do script* → adicionar `CHAVE_SERVICO` = uma string longa e
   aleatória (pode ser a mesma do contas a pagar ou outra; são projetos
   diferentes, com propriedades diferentes).
2. Em `/root/renovatruck_portal`, acrescente ao `integracao/config.local.json`:
   ```json
   {"host":"192.91.254.14","port":3311,"user":"root","password":"...","database":"sas0003",
    "api":"<url/exec do contas a PAGAR>",
    "syncToken":"<CHAVE_SERVICO do contas a pagar>",
    "apiReceber":"<url/exec do contas a RECEBER>",
    "syncTokenReceber":"<CHAVE_SERVICO do contas a receber>"}
   ```
   Com `apiReceber` e `syncTokenReceber` no config, o comando dispensa
   `--api`/`--token`.
3. Testar: `node integracao/extrair-contas-receber.js --enviar`
4. `crontab -e`:
   ```
   40 6 * * * cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-contas-receber.js --enviar >> /root/cron-contas-receber.log 2>&1
   ```

Janela padrão = 1º dia de **três** meses atrás (maior que a do contas a pagar,
porque prazo de recebível é mais longo: 30/60/90 é comum).

---

## Como o módulo funciona no dia a dia

### O ciclo de uma antecipação

1. **Antecipar** → escolha duplicatas e/ou OSs em `AGUARDANDO PEDIDO`, o parceiro
   e confira a simulação de deságio.
2. **Pré-borderô** em PDF ou Excel → envia ao fundo.
3. **Registrar operação** → nasce como `RASCUNHO`. Os títulos já ficam
   **reservados** neste momento: é o que impede a mesma duplicata de entrar em
   dois borderôs enquanto um está em análise. Cancelar a operação devolve todos.
4. `ENVIADA` → `APROVADA` conforme a negociação anda.
5. **Informar crédito recebido** → grava o líquido e a data (entrada do Fluxo de
   Caixa) e lança o custo no Contas a Pagar em **3.07, já baixado**.

### Liquidação: a ordem importa

`liquidarOperacao()` grava a liquidação **antes** de tentar o lançamento da
despesa. Se o Contas a Pagar estiver fora do ar, o crédito recebido não pode se
perder — o título faltante é recuperável pelo botão *relançar despesa*, que
aparece sozinho na linha da operação com o aviso "despesa não lançada".

O relançamento recusa operação que já tem `titulo_despesa_id`: lançar duas vezes
criaria despesa em dobro.

### O elo OS → nota fiscal

É o coração do módulo. Uma OS antecipada em `AGUARDANDO PEDIDO` é uma promessa:
não existe duplicata ainda. Quando o cliente libera e a OS é faturada, a
`vw_notas_fiscais` grava o número da OS em `num_pedido` — e é por aí que os
títulos recém-nascidos descobrem que já foram vendidos ao fundo.

`reconciliarAntecipacoesOS()` roda **sozinha** depois de cada aprovação de
sincronização, e também no botão *Reconciliar OS → NF* (para o caso de a nota ter
entrado antes de alguém registrar a antecipação).

Sem isso o título entraria como livre e poderia ser antecipado de novo: a mesma
receita vendida duas vezes, que é o erro caro deste tipo de operação.

**Quando o faturado difere do antecipado**, os dois números ficam guardados
(`valor_antecipado` e `valor_faturado` em `RecAntecipOS`) e todos os títulos da
OS são marcados como antecipados. É o que acontece na prática: a duplicata
inteira é cedida ao fundo, mesmo quando o adiantamento foi de 80%.

### Baixa é sempre manual

Inclusive no antecipado, e principalmente nele. Se o cliente não paga, a
responsabilidade volta para a empresa por causa da coobrigação — um sistema que
baixasse sozinho no vencimento esconderia exatamente o risco que a tela existe
para mostrar.

Três situações diferentes, três ações diferentes:

| O que aconteceu | O que fazer | O que o sistema faz |
|---|---|---|
| Cliente pagou o parceiro | **Dar baixa** | Título vira `RECEBIDO`, situação vai a `LIQUIDADO`, sai do risco |
| Cliente não pagou e a empresa devolveu o dinheiro ao parceiro | **Marcar recompra** | Situação vira `RECOMPRADO`; o título **continua em aberto** contra o cliente e sai da exposição do parceiro |
| Cliente não pagou e ninguém fez nada ainda | nada | O título aparece sozinho como **Em risco**, em vermelho, com contador na aba Operações |

### Política de antecipação por cliente

Quatro regras por cliente, todas opcionais:

- **Elegibilidade** — pode ou não antecipar OS sem pedido;
- **% máximo antecipável** da OS;
- **Dias até faturar + prazo de vencimento** — projetam o vencimento da OS, que
  é o número que o fundo usa para calcular o deságio de um recebível que ainda
  não existe;
- **Teto de exposição** em R$.

Cliente sem política cadastrada cai no **padrão da casa: pode antecipar
duplicata emitida, mas não OS sem pedido** — antecipar recebível que ainda não
existe depende de conhecer o comportamento do cliente.

O botão *Sugerir pelo histórico* preenche "dias até faturar" com a **mediana** do
histórico real do cliente no `dados.json` (não a média: uma OS que ficou seis
meses parada distorce a média e não representa o comportamento normal). O prazo
de vencimento continua manual — vem da negociação comercial, não do sistema.

Os tetos **avisam, não bloqueiam**: é regra de gestão, e existe caso legítimo de
estourar com aprovação da diretoria. Bloquear em silêncio faria o usuário
procurar o motivo no lugar errado.

---

## Decisões que valem conhecer

**A fonte primária é a nota fiscal, e não a `vw_contas_a_receber` — o inverso do
contas a pagar.** Lá a `vw_contas_a_pagar` cobre 216 das 217 compras do ano. Aqui
a `vw_contas_a_receber` tem 164 linhas e cobre pouco mais da metade das notas de
venda: agosto/2026 tem **77 notas emitidas e 8 títulos na view**. O módulo de
contas a receber do Genesis não é alimentado com disciplina, e confiar nele
deixaria metade do faturamento invisível — que é o buraco que este módulo existe
para fechar. Então toda nota de venda vira parcelas por `numero_parcelas` +
`Venc01..Venc12`, e a view entra como **conferência**: quando ela tem o título,
o vencimento e o valor dela mandam.

Conferido: das 380 notas de saída de 2026, a partição bate **centavo a centavo**
com o total da nota em 379. A única divergência é a NF 349, onde a view diz
R$ 230,26 e a nota diz R$ 246,12 — divergência real do Genesis, e a regra "a view
manda" a preserva de propósito.

**O lixo nas colunas `Venc` é diferente do contas a pagar.** Nas notas de entrada
o Genesis preenche as parcelas não usadas com a sentinela `2002-04-05`. Nas notas
de **saída** ele preenche com a **data de emissão**. Por isso o extrator lê só as
primeiras `numero_parcelas` colunas e descarta vencimento que não seja posterior
à emissão — exceto em nota de parcela única, que é venda à vista de verdade.

**A data de emissão faz parte da chave natural.** O Genesis reaproveita numeração
de NF entre séries: existem hoje **7 pares** de notas diferentes com o mesmo
`num_nf` para o mesmo cliente. A NF 301 da JSL IN LOADER é R$ 281,46 da OS 4463
em 15/07 **e também** R$ 1.610,00 da OS 4267 em 04/08. Sem a emissão na chave,
uma das duas seria barrada como duplicata e a empresa perderia o recebível
calada. Pelo mesmo motivo a conferência contra a `vw_contas_a_receber` casa
**pela OS primeiro** — é ela que desempata as notas homônimas.

**`numero_nf` é guardado puro ("369"), nunca "369/02".** A parcela já é campo
próprio e a tela remonta o rótulo na hora de exibir. `nfBaseRec()` existe só para
o cadastro manual, de quem copia o número do boleto por hábito.

**A despesa financeira passa pela API do Contas a Pagar, não pela planilha.** As
duas abas vivem no mesmo arquivo, e a primeira versão escrevia direto. Não é
seguro: `LockService.getScriptLock()` é **por projeto**, e dois projetos
diferentes usando `getLastRow()+1` na mesma aba podem gravar na mesma linha e
perder um título. Passando pela API, quem grava é sempre o mesmo script, sob o
mesmo lock, com o mesmo gerador de id e a mesma proteção de formato de texto.

**"Risco" não é status guardado.** É calculado: antecipado + vencido + não
recebido. Guardar faria o título continuar em risco para sempre depois de pago —
o mesmo raciocínio que o "atraso" do contas a pagar.

**Recomprado sai da exposição, mas não da carteira.** O título voltou para a
empresa, e somá-lo como exposição inflaria o risco de coobrigação com dívida que
já foi paga ao fundo. Mas continua em aberto contra o cliente, porque a dívida
dele não sumiu.

**O PDF sai pela janela de impressão, não por biblioteca.** O portal já carrega
Chart.js, PapaParse e SheetJS; somar um gerador de PDF por causa de um documento
de uma página pesaria em toda visita. "Salvar como PDF" existe em todo navegador
e no celular, e o resultado sai com as fontes do sistema — que é o que um fundo
espera de um borderô.

**O prazo médio é ponderado pelo valor, não pela quantidade.** Um título de
R$ 50 mil a 60 dias custa muito mais que dez de R$ 500 a 15 dias, e a média
simples esconderia isso. É a mesma conta que o fundo faz — o número aqui serve
para conferir o borderô que volta, não para enfeitar a tela. A fórmula está
duplicada de propósito no `contas-receber.gs` e no `index.html`; **se divergir, o
número da tela mente sobre o que vai ser gravado.**

**As OSs vêm do `dados.json`, não da planilha.** É o mesmo export público que o
Kanban já usa, com `numero_os`, `razao_cliente` e `valor_total`. Duplicar isso na
planilha criaria uma segunda verdade sobre a OS. A tela mostra a data do último
export, para ninguém antecipar em cima de lista velha achando que é de hoje.

**Nada de dado financeiro no git.** O repositório do portal é público — é o que
faz o GitHub Pages servir o site. Por isso as notas trafegam pela API autenticada
e param na aba `RecSyncStaging`, em vez de virarem um JSON commitado. O
`.gitignore` cobre `contas-receber-sync.json`.

---

## Estrutura das abas

A ordem das colunas é contrato entre os componentes. **Só acrescente no fim,
nunca reordene.**

**`RecTitulos`** — grão: uma parcela de uma nota.
`id`, `origem`, `chave_origem`, `empresa`, `data_emissao`, `data_vencimento`,
`cliente`, `cliente_cod`, `cliente_cnpj`, `numero_nf`, `num_os`,
`natureza_operacao`, `descricao`, `forma_pagamento`, `valor_total`,
`valor_recebido`, `status`, `data_recebimento`, `parcela`, `total_parcelas`,
`competencia`, `antecipado`, `operacao_id`, `parceiro_id`, `situacao_antec`,
`recompra_em`, `observacao`, `criado_em`, `criado_por`, `atualizado_em`,
`atualizado_por`

**`RecParceiros`** — `id`, `nome`, `tipo`, `cnpj`, `contato`, `email`,
`telefone`, `taxa_mes`, `tarifa_titulo`, `tac`, `dias_float`, `limite`, `ativo`,
`observacao`, + auditoria

**`RecPoliticas`** — `cliente_cod`, `cliente`, `permite_os`, `pct_max_os`,
`dias_ate_faturar`, `dias_prazo_venc`, `teto_exposicao`, `ativo`, `observacao`,
+ auditoria

**`RecOperacoes`** — `id`, `numero`, `parceiro_id`, `parceiro`, `data_operacao`,
`status`, `qtd_titulos`, `qtd_os`, `valor_bruto`, `prazo_medio`, `taxa_mes`,
`tarifa_titulo`, `tac`, `desagio_estimado`, `liquido_estimado`, `valor_liquido`,
`custo_real`, `taxa_efetiva_mes`, `data_credito`, `titulo_despesa_id`,
`observacao`, + auditoria

**`RecOperacaoItens`** — `operacao_id`, `tipo`, `ref_id`, `num_os`, `numero_nf`,
`parcela`, `cliente`, `cliente_cod`, `vencimento`, `valor`, `prazo_dias`

**`RecAntecipOS`** — `id`, `num_os`, `cliente`, `cliente_cod`, `valor_os`,
`valor_antecipado`, `vencimento_estimado`, `operacao_id`, `parceiro_id`,
`status`, `nfs_geradas`, `valor_faturado`, `faturado_em`, `observacao`,
+ auditoria

`data_credito` + `valor_liquido` em `RecOperacoes` e `data_recebimento` +
`valor_recebido` em `RecTitulos` são o que o **Fluxo de Caixa** vai ler.

## Cuidados ao mexer no código

- `chaveNatural()` existe **idêntica** em `contas-receber.gs` e
  `extrair-contas-receber.js`. Mudou numa, mude na outra — é o que mantém a
  trava consistente.
- `calcularCustoOperacao()` (backend) e `crCalcular()` (frontend) calculam a
  mesma coisa. Divergir faz a tela mentir sobre o que vai ser gravado.
- A planilha está em pt-BR: nunca grave número como texto ("1,2" vira 1.2).
  Todos os valores passam por `numeroRec()` antes de entrar.
- **Nunca use `appendRow` para título.** Ele interpreta o valor antes de encostar
  na célula: `"2026-08"` vira agosto/2026 mesmo com a coluna formatada em `@`.
  Toda escrita é `forcarTextoRec()` seguido de `setValues()`. A lição veio pronta
  do contas a pagar e custou 53 naturezas perdidas lá.
- Escrita no Sheets é sempre em bloco (`setValues`), nunca linha a linha — ler ou
  gravar em laço estoura os 6 minutos do Apps Script.
- Lotes de importação: máximo 300 por chamada.
