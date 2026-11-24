# Módulo: DRE Gerencial

Demonstração do resultado mensal por **regime de competência (data de emissão)**: receita das NFs emitidas, custos e despesas do Contas a Pagar, orçado × executado, gráfico de 12 meses, cenários e Excel.

- **Acesso:** **somente admin**. O router barra antes de baixar qualquer arquivo (`soAdmin` em `js/router.js`) e o `dre.gs` confere o papel de novo no backend.
- **Entrada:** `initDre()`
- **Dados:** `apps-script/dre.gs` (`CONFIG.DRE_API` em `js/core.js`). Implantação e operação: `integracao/LEIA-ME-dre.md`. Nada financeiro vive neste módulo nem no repositório (que é público).
- **Bibliotecas:** xlsx (export). O gráfico é SVG puro.
- **Sem `DRE_API`:** a tela mostra uma faixa amarela e **dados de exemplo inventados**; o XLSX sai marcado como EXEMPLO.

## Arquivos
- `template.html`, `index.js`, `style.css` (escopado, carrega sob demanda)
- Teste: `node ferramentas/testar-dre.js` (cálculo, backend inteiro num simulador e a lógica da tela). Rodar sempre que mexer no `dre.gs` ou no `index.js`.

## O que a tela tem
1. **DRE** — meses em colunas + Total. Período padrão 12 meses, máximo 24. Avisos por mês (ícone no cabeçalho + faixa no topo).
2. **Drill-down** — clicar numa célula de receita (R.1–R.3) ou de conta (N.NN) lista as NFs/títulos que a compõem. Mostra o total real mesmo quando a lista é cortada em 500 itens.
3. **Últimos 12 meses** — barras de receita e linhas de resultado operacional e do período.
4. **NFs com valor estimado** — ver "NF parcelada" abaixo.
5. **Contratos do mês** — marcar quais NFs do mês são de contrato.
6. **Orçado × Executado** — meta por conta e por mês; variação em R$ e %.
7. **Cenário** — simulação local por percentual de grupo. Não grava nada, não vai à rede; o drill-down fica desligado enquanto houver cenário.
8. **Exportar XLSX** — gerado no navegador (aba "DRE" ou "Cenario").

## Estrutura do resultado

```
Receita bruta (R.1 Contratos · R.2 Spot Serviços · R.3 Spot Peças)
− Custos operacionais (1.xx)                  = Margem de Contribuição
− Despesas fixas (2.xx)                       = Resultado Operacional
− Financeiras (3.01, 3.03, 3.04, 3.05, 3.07)  = Resultado do Período
Fora do resultado (informativo): 3.02 Empréstimos, 3.06 Sócios/Aportes, CAPEX (4.xx) e 9.99 A Classificar
```

## Decisões que valem conhecer

**Competência = data de emissão.** Vale para NF e para título. O vencimento não serve de eixo (a coluna `competencia` do Contas a Pagar deriva dele). Cancelado nunca entra; aberto, parcial e pago entram.

**Custo conta pelo código da natureza.** Título com código 1.01 e nome "A Classificar" soma em 1.01. Código sem conta no plano, ou vazio, cai em 9.99. O plano de contas é lido da planilha (aba `PlanoContas`), não fixado no código: conta nova aparece sozinha.

**Data digitada errada.** Título com ano impossível (`02/10/0202`, `20261-10-13`) vai para o mês da `competencia` e entra na contagem do aviso `emissao_corrigida`. Vale conferir esses títulos no Contas a Pagar.

**Contrato é lista manual (provisório).** Ainda não existe regra automática. Hoje são 4 NFs por mês (Imediato). A aba `DreContratos` guarda as NFs marcadas; **NF que não está na lista é Spot** (R.2 se serviço, R.3 se peça). Todo mês é preciso marcar as 4 novas no card "Contratos do mês"; mês sem NF de contrato marcada mostra aviso. Marca com cliente vazio vale para qualquer cliente daquele número. Quando houver regra, isso vira atualização.

**NF parcelada incompleta vale o total.** Se faltam parcelas no Contas a Receber, o `dre.gs` estima as que faltam pela média das parcelas ativas × `total_parcelas`, e a NF aparece em "NFs com valor estimado". Parcela cancelada não conta como faltante. A NF é identificada por `numero_nf + tipo_nf + data_emissao + cliente_cod`, porque a numeração repete entre séries e tipos (peça e serviço com o mesmo número são duas NFs).

**Linhas de receita sem `numero_nf`** ficam fora e viram aviso (`sem_nf`), com o valor.

**Meta (budget) é por conta.** Grupos e totais (Margem, Res. Operacional, Resultado) são somados na tela e só contam as contas que têm meta. Verde = favorável (receita acima, custo abaixo); vermelho = desfavorável. Digitar recalcula na hora; só grava no botão "Salvar metas". Valor vazio remove a meta. Aceita `1234,5` ou `1234.5`; milhar com ponto (`1.234,50`) é recusado de propósito.

## Cache
A base de todos os meses fica 10 minutos no cache do Apps Script (a tela abre em poucos segundos). **Atualizar** ignora o cache. Marcar contrato limpa o cache sozinho; lançamento novo no Contas a Pagar/Receber aparece em até 10 min ou no "Atualizar". Drill-down, contratos do mês e orçado leem a planilha na hora.

## Conferência feita (outubro/2026)
Contra o gabarito `DRE-Renova-Outubro-2026.xlsx` (feito à mão em 05/11): R.1 e R.3 batem ao centavo; todas as diferenças restantes são de **dado** (NF 480 cancelada depois, títulos lançados ou editados depois de 05/11, 3 títulos com ano digitado errado), não de lógica. A estimativa de NF parcelada só foi provada pelo teste, não por dado real — a primeira NF parcelada incompleta que aparecer merece conferência manual.

## Mobile
Único breakpoint `max-width:700px` (o mesmo do `resultado`): tabelas com rolagem horizontal e primeira coluna fixa, campos com fonte de 16 px (evita zoom no iOS), alvos de toque de pelo menos 38 px.

## Versão
Bumpar `VERSAO_PORTAL` a cada deploy de `modules/`.
