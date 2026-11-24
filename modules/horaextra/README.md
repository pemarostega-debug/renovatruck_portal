# Módulo: Hora Extra PJ

Horas extras e socorros dos prestadores PJ, com aprovação pelo RH e o fechamento do mês (pagamento no dia 10 do mês seguinte, junto com a nota fiscal).

- **Acesso:** **somente admin**. O router barra antes de baixar qualquer arquivo (`soAdmin` em `js/router.js`) e o backend confere a sessão de novo.
- **Entrada:** `initHoraExtra()`
- **Dados:** `ColaboradoresPJ.gs`, que vive no repositório **portaria-renova** (`CONFIG.PJ_API` em `js/core.js`). Nada de pessoa ou dinheiro real vive neste módulo nem neste repositório (que é público).
- **Bibliotecas:** xlsx (fechamento gerado no navegador, nada sai para a rede).
- **Sem `PJ_API`:** a tela mostra uma faixa amarela de "módulo ainda não ligado" e nenhum dado.

## O que a tela tem
1. **Cartões:** total a pagar (hora extra aprovada + socorros), hora extra aprovada, socorros e o que aguarda aprovação (esse não entra no total).
2. **Por colaborador:** dias, hora extra, valor, pendente, socorros e total. Clicar na linha abre o detalhe.
3. **Detalhe do colaborador:** dia a dia, com os registros de entrada e saída, o trabalhado, a extra calculada, a situação e o valor. Ações: **Aprovar**, **Ajustar** (minutos, com explicação), **Recusar**, **Reabrir**, aprovar todos os pendentes, e corrigir, cancelar ou lançar um registro (sempre com motivo, que vai para a auditoria). Lista os socorros do mês, com **Cancelar**.
4. **Fechamento (XLSX):** uma linha por colaborador com movimento. Avisa se há dias sem aprovação (eles não entram).
5. **Regras em vigor** e **quem fica fora da portaria** (somente leitura: valores, tolerância e horário da unidade mudam na aba Config da planilha de controle da portaria).

## Regras que a tela mostra (as contas são do servidor)
- Hora extra: R$ 25/h de segunda a sábado e R$ 35/h em domingo e feriado, com tolerância de 10 minutos.
- Socorro é atividade extra paga por atendimento (faixa pela hora do **fim**): R$ 100 até 22h, R$ 120 depois das 22h e R$ 120 em domingo e feriado.
- **Socorro não soma com hora extra**: durante o atendimento só vale o socorro. A hora extra fora do atendimento continua.
- Aprovação: o número aprovado sai sempre do cálculo do servidor (ou do ajuste digitado com explicação). Se um registro mudar depois de aprovado, a tela avisa e pede para reabrir.

## Arquivos
- `template.html`, `index.js`, `style.css` (escopado, carrega sob demanda)
- Teste: `node ferramentas/testar-horaextra.js` roda as funções puras e depois a tela num navegador contra o backend real no Google simulado (precisa do repositório portaria-renova ao lado e do `puppeteer-core`; se faltar, a parte 2 é pulada com aviso). Rodar sempre que mexer neste módulo.

## Pendências conhecidas
- As correções de registro e os ajustes usam janelas simples do navegador (`prompt`). Funciona, mas pode ganhar um formulário próprio.
- Incluir ou excluir pessoa à mão e mudar regras ainda são feitos na planilha (o backend tem `rh_pessoa` e `rh_config_set`, que a tela não usa).
