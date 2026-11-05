-- Acrescenta unidade e tipo de atendimento em vw_ordens_servico (05/11/2026).
-- `unidade`      <- ordem_servico.descricao8 (unidade do cliente)
-- `tipo_os`      <- ordem_servico.descricao9, digitado como letra no Genesis:
--                   C = Contrato, E = Extra-contrato, S = Sinistro, F = Funilaria.
--                   Vazio ou qualquer outra coisa vira NULL (OS ainda não classificada).
-- Parte da view já corrigida em view-ordens-placa-fix.sql (placa via descricao1).
-- As duas colunas novas entram no FIM, para não quebrar quem lê por posição
-- (apps-script/ordens-servico.gs diz: "só acrescente no fim").

CREATE OR REPLACE ALGORITHM=UNDEFINED DEFINER=`root`@`%` SQL SECURITY DEFINER VIEW `vw_ordens_servico` AS
select `os`.`id_ordem_servico` AS `id_ordem_servico`,`os`.`numero_os` AS `numero_os`,`os`.`numero_os` AS `num_os`,`os`.`id_cliente` AS `codigo_cliente`,`os`.`razao_cliente` AS `razao_cliente`,`v`.`nomevende` AS `nome_vendedor`,
 coalesce(nullif(trim(`os`.`PlacaVeiculo`),''), nullif(nullif(trim(`os`.`descricao1`),''),'000-0000')) AS `placa`,
 (select `fc`.`descricao` from (`fase_os_historico` `fh` join `fases_os_cad` `fc` on((`fc`.`Id_fase` = `fh`.`id_fase`))) where (`fh`.`id_ordem_servico` = `os`.`id_ordem_servico`) order by `fh`.`id_fase_os_historico` desc limit 1) AS `descricao_fase`,`os`.`NotaFiscal` AS `num_nf`,`os`.`NotaFiscalS` AS `NotaFiscalS`,`os`.`valor_total` AS `valor_total`,(select `fh`.`data` from `fase_os_historico` `fh` where (`fh`.`id_ordem_servico` = `os`.`id_ordem_servico`) order by `fh`.`id_fase_os_historico` desc limit 1) AS `data`,`os`.`data_geracao` AS `data_geracao`,`os`.`data_encerramento` AS `data_encerramento`,`os`.`encerrada` AS `encerrada`,`os`.`Cancelada` AS `cancelada`,
 nullif(trim(`os`.`descricao8`),'') AS `unidade`,
 (case upper(trim(`os`.`descricao9`)) when 'C' then 'Contrato' when 'E' then 'Extra-contrato' when 'S' then 'Sinistro' when 'F' then 'Funilaria' else NULL end) AS `tipo_os`
from (`ordem_servico` `os` left join `vendedores` `v` on((`v`.`CodId` = `os`.`id_vendedor`)));

-- Conferir:
-- SELECT numero_os, placa, unidade, tipo_os FROM vw_ordens_servico ORDER BY numero_os DESC LIMIT 20;
-- SELECT tipo_os, COUNT(*) FROM vw_ordens_servico GROUP BY tipo_os;   -- ver como o pessoal digita
--
-- Para desfazer: rodar view-ordens-placa-fix.sql (a versão anterior, sem as duas colunas).
