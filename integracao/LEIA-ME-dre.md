# DRE Gerencial — implantação e operação

Módulo de resultado mensal por competência. Só administradores enxergam.

```
Planilha financeira (Titulos + RecTitulos + PlanoContas)      Planilha própria do DRE
        só LEITURA  ──────────────►  dre.gs  ◄──────────────  DreContratos · DreBudget · Log
                                       │
                          sessão do usuário (papel admin, validada no backend do Manual)
                                       ▼
                         Portal (GitHub Pages) → módulo "DRE Gerencial"
```

**Por que assim:** o repositório é público, então nenhum número financeiro mora no código. O `dre.gs` lê a planilha financeira sem nunca gravar nela; o que é só do DRE (lista de NFs de contrato, metas, log) fica numa planilha separada. Não há cron nem chave de serviço: o DRE só lê o que o Contas a Pagar e o Contas a Receber já alimentam.

---

## 1. Criar a planilha do DRE e publicar o backend

1. No Google Drive da empresa, crie uma planilha nova chamada **DRE Gerencial**. Não compartilhe com ninguém além de quem administra o sistema.
2. Na planilha: **Extensões → Apps Script**. Apague o `Código.gs` e cole `apps-script/dre.gs` inteiro. Salve.
   Tem que ser **a partir da planilha** (script vinculado): o código usa `getActiveSpreadsheet()` e recusa rodar solto.
3. Selecione a função **`instalar`** e clique em **Executar**. Autorize quando pedir (planilhas e acesso externo). Ela cria as abas `DreContratos`, `DreBudget` e `Log`, abre a planilha financeira e testa a conexão com o login do Manual.
   - Se der erro de acesso à planilha financeira, a conta que roda o script precisa de pelo menos **leitura** nela (a mesma planilha do Contas a Pagar e a Receber; o ID está na constante `DRE_FONTE_ID` do `dre.gs`).
4. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa** (quem protege é o token da sessão, não o Google)
5. Copie a URL que termina em `/exec`.

> Teste rápido no navegador: `<url>/exec?action=ping` deve responder `{"success":true,"versao":1}`. Qualquer outra ação por GET é recusada de propósito (token em URL vaza em log).

Um projeto Apps Script só aceita um `doGet/doPost`: este `.gs` precisa de **projeto próprio**, não cole dentro de outro backend.

## 2. Semear os contratos de outubro

Na aba `DreContratos` da planilha do DRE, escreva (as colunas já vêm como texto):

| competencia | numero_nf | tipo_nf | cliente_cod |
|---|---|---|---|
| 2026-10 | 539 | SERVICO | 10 |
| 2026-10 | 540 | SERVICO | 10 |
| 2026-10 | 541 | SERVICO | 10 |
| 2026-10 | 542 | SERVICO | 10 |

> Confira o `tipo_nf` dessas quatro no `RecTitulos` antes de digitar (PECA ou SERVICO). Em dúvida, deixe para marcar pela tela, no card "Contratos do mês" — é o caminho normal dos meses seguintes e já grava no formato certo.

## 3. Ligar o portal

1. Em `js/core.js`, preencha `DRE_API` (hoje `''`) com a URL do passo 1.5.
2. Bumpar `VERSAO_PORTAL` (regra de qualquer deploy de `modules/` ou `js/`).
3. Commit + push; o GitHub Pages publica sozinho. Conferir que o `.nojekyll` continua na raiz.

**Enquanto `DRE_API` estiver vazio**, a tela abre com faixa amarela e dados de exemplo inventados — serve para ver o layout, nunca para decidir nada.

> A URL do Apps Script não é segredo (o token protege), mas **nunca** commitar dado financeiro, export do DRE nem prints com valores reais.

## 4. Primeiro uso e conferência

1. Entre como **admin** → card "DRE Gerencial" na home. Perfil Consulta recebe "restrito a administradores".
2. Escolha out/2026 e compare R.1, R.2 e R.3 com o relatório de faturamento do mês. Diferenças contra o gabarito manual de 05/11 são de dado (NF cancelada, títulos lançados depois), explicadas em `.prumo/dre-guia-retomada.md` (passo 9, fora do repositório).
3. Clique em células para o drill-down: o total do detalhe tem que igualar o valor da célula.
4. Veja os avisos do topo (`emissao_corrigida`, `sem_nf`, mês sem contrato marcado) e trate no Contas a Pagar/Receber.
5. Cadastre metas no card "Orçado × Executado" e confira a variação.

## 5. Rotina mensal
- Marcar as 4 NFs de contrato do mês novo (card "Contratos do mês"). Sem isso, o mês mostra aviso e a receita de contrato vai para Spot.
- Classificar o que está em 9.99 "A Classificar" (fica fora do resultado até alguém classificar).
- Apertar **Atualizar** depois de lançar algo, se não quiser esperar os 10 min do cache.

## Atualizar o código depois
Colar o `dre.gs` novo na mesma planilha e **Implantar → Gerenciar implantações → editar → Nova versão** (a URL não muda). Criar "Nova implantação" gera outra URL e quebra o portal. Antes: `node ferramentas/testar-dre.js`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "restrito a administradores" | usuário com perfil Consulta — ajuste em Manual → Configurações |
| "Sessão expirada" logo ao abrir | login do portal caiu; sair e entrar de novo |
| "Este script precisa ser criado a partir da planilha do DRE" | script criado solto em script.google.com; recriar via Extensões → Apps Script |
| Erro de coluna ausente no `resultado` | alguém renomeou cabeçalho em `Titulos`/`RecTitulos`/`PlanoContas`; o `dre.gs` acha coluna pelo **nome** |
| Número mudou e ninguém lançou nada | cache de 10 min vencendo; ou título editado à mão (data virou outra) — ver aviso `emissao_corrigida` |
| Receita de contrato aparece como Spot | NF do mês ainda não marcada em "Contratos do mês" |
| Portal sem resposta após colar código | colou dentro de outro projeto (dois `doPost`); usar projeto próprio |
| Faixa amarela "dados de exemplo" | `CONFIG.DRE_API` vazio ou deploy do portal ainda não propagou |
