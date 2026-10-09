# Resultado Semanal — implantação e operação

Módulo da reunião de segunda com a diretoria. Só administradores enxergam.

```
Genesis (MySQL)                           Google (privado)                     Portal (GitHub Pages)
vw_os_produto_serviço ──extrair-resultado-semanal.js──► Apps Script ──► Planilha ──► index.html (só papel admin)
        (cron na VPS)          chave de serviço          resultado-semanal.gs          sessão do usuário
Planilha do gerente "Serviços Finalizados" ─────────────────────────────────────────► lista de OSs finalizadas
```

**Por que assim:** custo de peça, margem e folha não podem ir para o repositório,
que é público. O extrator grava numa planilha privada e o portal só lê de lá com a
sessão de um admin — o Apps Script confere o papel no backend do Manual. A chave de
serviço do cron só consegue *gravar* itens; não lê nada.

Enquanto o backend não estiver publicado, o módulo funciona do mesmo jeito com o
arquivo "OSs detalhe" arrastado para a tela.

---

## 1. Criar a planilha e publicar o backend

1. No Google Drive da empresa, crie uma planilha nova chamada **Resultado Semanal**.
   Não compartilhe com ninguém além de quem administra o sistema.
2. Na planilha: **Extensões → Apps Script**. Apague o `Código.gs` e cole
   `apps-script/resultado-semanal.gs` inteiro. Salve.
3. Selecione a função **`instalar`** e clique em **Executar**. Autorize quando pedir.
   Ela cria as abas `Itens`, `Parametros`, `Fechamentos` e `Log`.
4. **⚙ Configurações do projeto → Propriedades do script → Adicionar**:
   `CHAVE_SERVICO` = uma chave **hexadecimal** longa. Gere com:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   (hexadecimal: sem `&`, que quebra o shell, e sem `l`/`1`/`O`/`0` confundíveis).
5. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa** (quem protege é o token, não o Google)
6. Copie a URL que termina em `/exec`.

> Teste rápido no navegador: `<url>/exec?action=ping` deve responder `{"success":true,"versao":1}`.
> Qualquer outra ação por GET é recusada de propósito.

## 2. Ligar o portal

No `index.html`, procure `RESULTADO_SEMANAL_API` dentro do bloco `CONFIG` (perto do
topo, junto das outras URLs e IDs de planilha) e cole a URL do passo 1.6. Commit +
push — o GitHub Pages publica sozinho.

**Enquanto esse campo estiver vazio**, o módulo só enxerga a planilha do gerente:
ele sabe *quais* OSs fecharam na semana, mas não *o que* tem dentro delas. Sem as
linhas da `vw_os_produto_serviço` não há peça, serviço, custo nem margem — e toda
OS aparece como "sem itens no detalhe". É o passo que liga o módulo de verdade.

## 3. Extrator na VPS

Na VPS Locaweb (`/root/renovatruck_portal`), que alcança o MySQL do Genesis:

1. `git pull` e `npm install` (o extrator usa `dotenv` e `mysql2`).
2. Acrescente ao `.env`:
   ```
   RS_API_URL=https://script.google.com/macros/s/AKfy.../exec
   RS_SYNC_TOKEN=<a mesma CHAVE_SERVICO>
   ```
3. Teste sem enviar (grava `integracao/resultado-semanal-sync.json`, fora do git):
   ```
   node integracao/extrair-resultado-semanal.js
   ```
   Confira no log: quantas linhas/OSs, e se apareceu "colunas ausentes". As obrigatórias
   são `numero_os`, `codigo_produto` e `PrecoCusto`.
4. Envie: `node integracao/extrair-resultado-semanal.js --enviar`
5. `crontab -e` — todo dia cedo, e de novo na segunda antes da reunião:
   ```
   50 6 * * * cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-resultado-semanal.js --enviar >> /root/cron-resultado-semanal.log 2>&1
   30 7 * * 1 cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-resultado-semanal.js --enviar >> /root/cron-resultado-semanal.log 2>&1
   ```

Opções úteis:

| Opção | Para quê |
|---|---|
| `--desde AAAA-MM-DD` | janela maior (padrão: 1º dia de 8 meses atrás, pela data de geração da OS) |
| `--view <nome>` | se a view mudar de nome (o script já tenta achar `vw_os_produto_servi%` sozinho) |
| `--de-arquivo integracao/resultado-semanal-sync.json` | reenviar a última extração sem consultar o banco |
| `--amostra <nº da OS>` | mostra as linhas cruas daquela OS e marca as colunas que vêm iguais em todas (valor de cabeçalho repetido) — não envia nada |

## 4. Primeiro uso no portal

1. Entre como admin → **Resultado Semanal**.
2. O cartão "Peças e serviços — banco do Genesis" deve mostrar as linhas e a hora da extração.
3. Informe a **folha mensal dos produtivos** no painel de parâmetros. A base passa a
   valer para todos os admins (fica na aba `Parametros`, não no código).
4. Na reunião: escolha a semana no seletor, clique **Salvar fechamento** e gere o **PDF**.

### De onde vem cada número

| O quê | Fonte |
|---|---|
| Quais OSs fecharam na semana | Planilha do gerente (`SHEET_FINALIZADAS_ID`, aba "Serviços Finalizados") — a mesma do gráfico de OSs finalizadas por dia do Dashboard |
| O que tem dentro de cada OS | `vw_os_produto_serviço`, via extrator da VPS → Apps Script |

As duas se cruzam pelo **número da OS**. O seletor de semanas cobre todas as
semanas com OS lançada na planilha, da primeira em diante — semana antiga abre
com a análise completa, desde que a janela do extrator (`--desde`) alcance a data
de geração daquelas OSs.

---

## Decisões que valem conhecer

- **Semana ou mês.** A pílula "Semana · Mês" no topo troca o passo do mesmo
  estudo: placar, rentabilidade, ABC, OSs, evolução, PDF e Excel seguem juntos.
  Mês = dia 1º ao último. O fechamento salvo do mês não briga com o da semana.
- **Semana = segunda a domingo.** Os dias trabalhados para a mão de obra contam
  segunda a sábado e podem ser corrigidos na tela (feriado, sábado meio período:
  o campo aceita 0,5). **No mês o padrão é a base de rateio** (`Dias de trabalho
  no mês`), não o calendário: a folha mensal já é o custo do mês, e 26 dias
  úteis contra uma base de 24 inflariam o custo em 8% todo mês.
- **Desconto sai do valor, não do total.** Desconto de peça abate as peças (pode
  deixar a peça negativa: na OS 4782, R$ 400 sobre R$ 381,50 de peças dão
  −R$ 18,50 e total de R$ 781,50); desconto de item de serviço abate o serviço.
- **Desconto repetido por linha.** Se a origem repetir o desconto do cabeçalho
  da OS em cada linha do detalhe, o portal conta uma vez por OS e avisa na tela
  — somar linha a linha daria 17× numa OS com 17 peças. Para ver o que a view
  entrega de verdade numa OS:
  `node integracao/extrair-resultado-semanal.js --amostra 4782`
  (não envia nada; marca as colunas que vêm iguais em todas as linhas).
- **Curva ABC sem DIV.** Sucata e recondicionada não se recompram: as peças DIV
  saem da curva e têm tabela própria, uma linha por peça (OS, descrição, qtd, valor).
- **`valor_pecas`: unitário ou já total, depende da origem.** O relatório "OSs
  detalhe" do Genesis traz `valor_total` pronto. A `vw_os_produto_serviço` ao
  vivo não tem essa coluna, e nela `valor_pecas` **já é o total da linha**, não
  preço unitário — foi isso (multiplicar de novo por quantidade) que inflou o
  faturamento da semana de R$ 36.767 para R$ 239 mil em 09/10/2026. O portal
  detecta pelo conjunto (`nivelValorPeca`, compara a margem sobre o custo nas
  duas leituras possíveis) e avisa na tela quando usa o modo "total". Se um
  faturamento parecer alto demais, é o primeiro lugar pra olhar — confira com
  `--amostra <OS>` se os valores de peça batem com o relatório oficial.
- **OS finalizada** vem da planilha do gerente. OS repetida conta uma vez; OS relançada
  numa semana depois de já ter aparecido antes não é contada de novo (a tela avisa).
- **Código com "DIV"** = peça sem custo de inventário. A análise sai com e sem DIV.
- **Evolução semanal** recalcula todas as semanas com os parâmetros base *atuais*, para
  serem comparáveis. O que foi apresentado na época fica no fechamento (e a tela oferece
  "ver com os parâmetros da época").
- **Cobertura** < 95% numa semana = OSs finalizadas sem linha na view (ou fora da
  janela do extrator). A margem dessa semana é parcial.
- **Tudo em texto na planilha.** Planilha pt-BR converte `2026-09-01` em data e
  `148.72` em número errado; o backend força formato texto antes de gravar. Não edite a
  aba `Itens` à mão.
- **Arquivo arrastado vale mais que o banco** nas OSs que ele trouxer — útil para
  conferir uma correção antes de o cron rodar de novo.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Sessão inválida" no extrator | `RS_SYNC_TOKEN` diferente da `CHAVE_SERVICO` (erro de digitação) |
| "restrito a administradores" no portal | usuário com perfil Consulta — ajuste em Manual → Configurações |
| "Extração com mais de um dia" | cron não rodou: `tail /root/cron-resultado-semanal.log` |
| Cobertura baixa numa semana antiga | rodar uma vez com `--desde` mais antigo |
| Portal parou de responder após colar código | um projeto Apps Script só aceita um `doGet/doPost` — este `.gs` precisa de projeto próprio |
