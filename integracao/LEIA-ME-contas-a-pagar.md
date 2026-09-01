# Contas a Pagar — implantação e operação

Módulo do portal Renova (`dash.renovatruck.com.br`). Frontend no `index.html`,
backend em Apps Script sobre Google Sheets, e dois scripts Node para falar com
o Genesis (MySQL).

```
Planilha antiga (.xlsx) ──migrar-planilha.js──────┐
                                                  ├──► Apps Script ──► Google Sheets
Genesis (MySQL) ──extrair-contas-pagar.js─────────┘         ▲
                                                            │
                                              index.html (GitHub Pages)
```

---

## 1. Publicar o backend

1. Abra a [planilha base](https://docs.google.com/spreadsheets/d/1EftBE75ZtNOolVwpYN-Zs1OqhdvbpDNm4-DieoHuW_E/edit).
2. **Extensões → Apps Script**. Apague o `Codigo.gs` e cole
   `apps-script/contas-pagar.gs` inteiro. Salve.
3. Rode a função **`instalar()`** uma vez (menu de execução). Ela cria as abas
   `Titulos`, `PlanoContas`, `Fornecedores`, `Log`, `Config`, `SyncStaging` e
   semeia o plano de contas com as 4 macro-naturezas + o ramo "A Classificar".
   Autorize quando pedir.
4. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
5. Copie a URL que termina em `/exec`.

## 2. Republicar o Manual da Empresa

O `contas-pagar.gs` valida sessões perguntando ao backend do Manual, que é quem
emite os tokens. Foi acrescentada a ação `sessao_validar` no
`apps-script/manual-empresa.gs`.

Cole a versão nova no projeto do Manual e use
**Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão**.
Sem isso o Contas a Pagar recusa todo mundo com "Sessão inválida".

> A URL do Manual está fixa em `API_MANUAL`, no topo do `contas-pagar.gs`. Se
> ela mudar, atualize nos dois lugares.

## 3. Ligar o frontend

No `index.html`, procure `CP.API` e troque o texto pela URL `/exec` do passo 1:

```js
const CP = {
  API: 'https://script.google.com/macros/s/AKfy.../exec',
```

Commite e dê push. O GitHub Pages publica sozinho.

## 4. Migrar a planilha antiga

```bash
node integracao/migrar-planilha.js "C:/caminho/RENOVA - Contas a pagar 2026.xlsx"
```

Roda em modo simulação: gera `integracao/migracao-contas-pagar.json` e mostra o
relatório. **Confira antes de enviar** — em especial a lista de naturezas que
caíram em `9.99 A Classificar`.

Para gravar de verdade:

```bash
node integracao/migrar-planilha.js "<arquivo.xlsx>" --enviar --api <url/exec> --token <token>
```

O token sai do console do navegador com o portal aberto e logado: digite `RV.token`.

Opções:

| Opção | O que faz |
|---|---|
| `--desde Agosto` | Primeiro mês a migrar (padrão: Agosto) |
| `--baixa-vencimento` | Força data da baixa = vencimento, ignorando "PAGO EM dd/mm" |

## 5. Sincronizar as notas de entrada do Genesis

Precisa rodar numa máquina com acesso ao banco (rede do escritório ou VPN).

```bash
node integracao/extrair-contas-pagar.js --desde 2026-06-01 --enviar --api <url/exec> --token <token>
```

As notas vão para a aba `SyncStaging`. No portal: **Contas a Pagar → Sincronizar
Notas de Entrada**, confira e aprove. Nada vira título sem aprovação.

Sem `--enviar` o script só grava `integracao/contas-pagar-sync.json` para você
conferir.

> O botão do portal **não** consulta o Genesis — ele só lê a aba `SyncStaging`.
> Enquanto o extrator não roda, o portal mostra a fila da última execução.

### 5.1 Automatizar (cron na VPS)

O extrator roda sozinho na VPS Locaweb (`200.234.212.214`), a mesma que já roda
o `exportar-dados.js` por cron e alcança o MySQL do Genesis.

**Chave de serviço** — o `--token` de sessão do navegador expira; o cron usa uma
chave fixa no lugar:

1. Apps Script do Contas a Pagar → ⚙ *Configurações do projeto* → *Propriedades
   do script* → adicionar `CHAVE_SERVICO` = uma string longa e aleatória.
2. Colar o `contas-pagar.gs` atualizado e *Implantar → Gerenciar implantações →
   Nova versão* (o `validarToken()` passou a aceitar essa chave, e o `doPost()`
   a restringe às ações `sync_*`).

**Na VPS**, em `/root/renovatruck_portal`:

1. `git pull`
2. Criar `integracao/config.local.json` (cópia da raiz + a chave e a URL):
   ```json
   {"host":"192.91.254.14","port":3311,"user":"root","password":"...","database":"sas0003",
    "api":"https://script.google.com/macros/s/AKfyc.../exec",
    "syncToken":"<a mesma CHAVE_SERVICO>"}
   ```
   Com `api` e `syncToken` no config, o comando dispensa `--api`/`--token`.
3. Testar: `node integracao/extrair-contas-pagar.js --enviar`
4. `crontab -e` — uma vez por dia, de manhã:
   ```
   30 6 * * * cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-contas-pagar.js --enviar >> /root/cron-contas-pagar.log 2>&1
   ```

Janela padrão = 1º dia de dois meses atrás. Nota antiga lançada com atraso além
disso: rode uma vez na mão com `--desde AAAA-MM-DD`.

---

## Decisões que valem conhecer

**As notas de entrada vêm de duas views, não de uma.** `vw_contas_a_pagar` é a
fonte primária: já vem uma linha por parcela, com `codigo_fornecedor`,
vencimento e valor certos. `vw_notas_fiscais` entra como enriquecimento
(emissão, natureza da operação, vínculo com a OS). Nas notas de entrada o
Genesis grava o fornecedor no campo `codigo_cliente` — é por aí que as duas se
encontram. O particionamento por `numero_parcelas` + `Venc01..Venc12` existe
como plano B, para as notas que ainda não viraram título.

**`fornecedor.Codigo` não serve como chave.** Está `NULL` em 297 dos 299
cadastros. A chave é `IdFornecedor`, que é o que aparece como
`codigo_fornecedor` na `vw_contas_a_pagar`.

**As colunas `Venc` têm datas-lixo.** O Genesis preenche as parcelas não usadas
com sentinelas antigas (`2002-04-05` aparece em centenas de notas). O extrator
descarta qualquer vencimento anterior a 2015.

**"atraso" não é um status guardado.** Um título vencido continua `ABERTO`; o
atraso é calculado comparando vencimento com hoje. Guardar "atraso" faria o
título continuar atrasado para sempre depois de pago.

**A planilha antiga não diz qual parcela é cada linha** — o controle ficava no
número do boleto (`6662-3`, `22622/005`). O migrador agrupa por fornecedor + NF,
ordena por vencimento e numera. Sem isso as três parcelas da FIX IMPLEMENTOS
8034 virariam a mesma chave e duas seriam descartadas como duplicata.

**Trava anti-duplicidade em duas camadas.** A exata (`NF|numero|cod_forn|parcela`)
bloqueia. A solta (mesma NF, valor parecido, qualquer parcela e qualquer
fornecedor) só avisa — porque a planilha antiga não guardava código de
fornecedor nem número de parcela, e bloquear geraria falso positivo.

**Nada de dado financeiro no git.** O repositório do portal é público — é o que
faz o GitHub Pages servir o site. Por isso as notas do Genesis trafegam pela API
autenticada e param na aba `SyncStaging`, em vez de virarem um JSON commitado.
O `.gitignore` cobre `contas-pagar-sync.json`, `migracao-contas-pagar.json` e
`config.local.json`.

**O Genesis nunca preenche `data_baixa`** (0 de 232 títulos em 2026). Toda nota
importada chega como `ABERTO` e a baixa é dada no portal.

---

## Estrutura da aba `Titulos`

A ordem das colunas é contrato entre os três componentes. **Só acrescente no
fim, nunca reordene.**

`id`, `origem`, `chave_origem`, `empresa`, `data_emissao`, `data_vencimento`,
`fornecedor`, `fornecedor_cod`, `numero_nf`, `numero_boleto`, `tipo_docto`,
`descricao`, `natureza_codigo`, `natureza`, `observacao_1`, `observacao_2`,
`forma_pagamento`, `valor_total`, `valor_pago`, `status`, `data_baixa`,
`parcela`, `total_parcelas`, `competencia`, `criado_em`, `criado_por`,
`atualizado_em`, `atualizado_por`

`competencia` (YYYY-MM) e `natureza_codigo` são os eixos do DRE futuro;
`data_vencimento` + `data_baixa` + `valor_pago` sustentam o Fluxo de Caixa.

## Cuidados ao mexer no código

- `chaveNatural()` e `nfBase()` existem **idênticas** em `contas-pagar.gs`,
  `extrair-contas-pagar.js` e `migrar-planilha.js`. Mudou numa, mude nas três —
  é o que mantém a trava consistente.
- A planilha está em pt-BR: nunca grave número como texto ("1,2" vira 1.2).
  Todos os valores passam por `numero()` / `valor()` antes de entrar.
- Escrita no Sheets é sempre em bloco (`setValues`), nunca linha a linha — ler
  ou gravar em laço estoura os 6 minutos do Apps Script.
- Lotes de importação: máximo 500 por chamada (o frontend manda 200).
