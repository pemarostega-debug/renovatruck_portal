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

**Por que assim:** o repositório é público, então nenhum número financeiro mora no código. O `dre.gs` lê a planilha financeira sem nunca gravar nela; o que é só do DRE (lista de NFs de contrato, metas, log) fica numa planilha separada. Não há cron nem chave de serviço: o DRE só lê o que o Contas a Pagar, o Contas a Receber e o Resultado Semanal já alimentam.

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

## 2. Ligar a planilha do Resultado Semanal (descrição dos serviços)

É dela que o DRE tira a palavra "contrato" da descrição do serviço, para classificar as NFs de contrato sozinho.

1. Abra a planilha **Resultado Semanal** e copie o ID dela (o trecho entre `/d/` e `/edit` na URL).
2. No projeto Apps Script do **DRE**: **⚙ Configurações do projeto → Propriedades do script → Adicionar**:
   `ITENS_PLANILHA_ID` = o ID copiado. (Fica na propriedade, não no código, porque o repositório é público.)
3. Rode `instalar` de novo e autorize o acesso ao Drive, se pedir. A conta que roda o script precisa de pelo menos **leitura** na planilha do Resultado Semanal.

O DRE só lê a aba `Itens`. As colunas são achadas pelo nome (número da OS e descrição do serviço), então não depende da ordem.

> Sem essa propriedade o DRE funciona, mas sem contrato automático: a tela mostra a faixa "Contrato automático desligado".

## 3. Ligar o portal

1. Em `js/core.js`, preencha `DRE_API` (hoje `''`) com a URL do passo 1.5.
2. Bumpar `VERSAO_PORTAL` (regra de qualquer deploy de `modules/` ou `js/`).
3. Commit + push; o GitHub Pages publica sozinho. Conferir que o `.nojekyll` continua na raiz.

**Enquanto `DRE_API` estiver vazio**, a tela abre com faixa amarela e dados de exemplo inventados — serve para ver o layout, nunca para decidir nada.

> A URL do Apps Script não é segredo (o token protege), mas **nunca** commitar dado financeiro, export do DRE nem prints com valores reais.

## 4. Primeiro uso e conferência

1. Entre como **admin** → card "DRE Gerencial" na home. Perfil Consulta recebe "restrito a administradores".
2. Escolha o mês e compare R.1, R.2 e R.3 com o relatório de faturamento. Diferenças contra o gabarito manual de 05/11 são de dado (NF cancelada, títulos lançados depois), explicadas em `.prumo/dre-guia-retomada.md` (passo 9, fora do repositório).
3. Clique em R.1: devem aparecer as NFs de contrato do mês, cada uma com a descrição do serviço (ex.: "contrato empurrada guarulhos"). Conferir que são as 4 esperadas. Clique em R.2 e use a busca para achar alguma que devesse ser contrato.
4. Clique nas demais células para o drill-down: o total do detalhe tem que igualar o valor da célula.
5. Veja os avisos do topo (`emissao_corrigida`, `sem_nf`) e trate no Contas a Pagar/Receber.
6. Cadastre metas no card "Orçado × Executado" e confira a variação.

## 5. Rotina mensal
- Nada para marcar: a NF de contrato é identificada pela descrição. Só olhe R.1 no começo do mês e corrija com os botões se alguma NF ficou na classe errada.
- Classificar o que está em 9.99 "A Classificar" (fica fora do resultado até alguém classificar).
- Apertar **Atualizar** depois de lançar algo, se não quiser esperar os 10 min do cache.
- A descrição vem do Resultado Semanal: se o extrator dele não rodou, as OSs novas não têm descrição e a NF fica Spot até o próximo extrator (ou corrija à mão).

## Atualizar o código depois
Colar o `dre.gs` novo na mesma planilha (a ação antiga de marcar contratos foi trocada por `classe_definir`, então portal e script têm que subir juntos) e **Implantar → Gerenciar implantações → editar → Nova versão** (a URL não muda). Criar "Nova implantação" gera outra URL e quebra o portal. Antes: `node ferramentas/testar-dre.js`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "restrito a administradores" | usuário com perfil Consulta — ajuste em Manual → Configurações |
| "Sessão expirada" logo ao abrir | login do portal caiu; sair e entrar de novo |
| "Este script precisa ser criado a partir da planilha do DRE" | script criado solto em script.google.com; recriar via Extensões → Apps Script |
| Erro de coluna ausente no `resultado` | alguém renomeou cabeçalho em `Titulos`/`RecTitulos`/`PlanoContas`; o `dre.gs` acha coluna pelo **nome** |
| Número mudou e ninguém lançou nada | cache de 10 min vencendo; ou título editado à mão (data virou outra) — ver aviso `emissao_corrigida` |
| Receita de contrato aparece como Spot | a OS ainda não está no Resultado Semanal (extrator atrasado), a descrição não tem a palavra "contrato" ou a NF é de peça; corrija no drill-down com "É contrato" |
| Faixa "Contrato automático desligado" | falta a propriedade `ITENS_PLANILHA_ID`, ou a conta do script não tem acesso à planilha do Resultado Semanal |
| Portal sem resposta após colar código | colou dentro de outro projeto (dois `doPost`); usar projeto próprio |
| Faixa amarela "dados de exemplo" | `CONFIG.DRE_API` vazio ou deploy do portal ainda não propagou |
