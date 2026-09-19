/**
 * Módulo: Manual da Empresa
 * Institucional, organograma editável, cargos, processo, regras e usuários do portal.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

// MANUAL DA EMPRESA
// ══════════════════════════════════════════════════════════════

// Substituído pelo conteúdo da planilha quando ela responde (ver mnCarregarCargosDaNuvem).
let MN_CARGOS = [
  { key:'porteiro', cargo:'Porteiro', area:'Operacional', reportaA:'Gerente Operacional', subordinados:'Nenhum',
    objetivo:'Controlar o acesso de veículos e pessoas às dependências da empresa, garantindo o registro formal de entrada e saída de equipamentos, e atuar como ponto de contato inicial no recebimento de veículos para manutenção.',
    responsabilidades:['Controle de entrada e saída de veículos, equipamentos e visitantes','Registro de entrada do equipamento no sistema de portaria (placa, motorista, horário)','Liberação de equipamentos após conclusão da manutenção e autorização da Gerência Operacional','Direcionamento do motorista ao balcão administrativo para abertura da OS'],
    atividades:['Ao chegar um equipamento, registrar a entrada no sistema de portaria (placa, motorista opcional, horário de entrada)','Direcionar o motorista ao balcão administrativo para relatar o motivo da visita','Ao final da manutenção, e mediante confirmação da Gerência Operacional de que o equipamento está liberado, autorizar e registrar a saída do veículo','Em caso de dúvida sobre a liberação, contatar diretamente a Gerência Operacional antes de autorizar a saída'],
    interfaces:['Motorista/cliente (recepção inicial)','Administrativo (encaminhamento para abertura de OS)','Gerente Operacional (autorização de saída)','Sistema de Portaria (portal.renovatruck.com.br)'],
    documentos:['Registro de entrada (sistema de portaria): placa, horário, motorista','Registro de saída (sistema de portaria): horário de liberação'],
    indicadores:'A definir — ex: tempo médio entre chegada e direcionamento ao balcão.' },

  { key:'gerente-operacional', cargo:'Gerente Operacional', area:'Operacional', reportaA:'Diretor Comercial/Operacional', subordinados:'Administrativo, Almoxarife, Porteiro, Líder Operacional (Implementos), Líder Operacional (Mecânica Diesel)',
    objetivo:'Coordenar toda a operação de manutenção da empresa, do recebimento do equipamento até a entrega ao cliente, garantindo que as ordens de serviço fluam sem gargalos entre as etapas de orçamento, execução, evidenciamento e faturamento, gerenciando a alocação de recursos (equipe, vagas de execução) e atuando como responsável pelo relacionamento operacional com o cliente.',
    responsabilidades:['Gestão do fluxo de OSs no kanban operacional (aguardando vaga → em execução → finalizado)','Decisão de prioridade de execução: definir e autorizar qualquer alteração da ordem FIFO padrão nos organizadores físicos, com base na necessidade/urgência do cliente (decisão exclusiva do cargo — os líderes operacionais podem sinalizar uma necessidade, mas não decidem a repriorização)','Autorização final de liberação de equipamentos junto à Portaria','Gestão e desenvolvimento da equipe administrativa, almoxarife, porteiro e líderes operacionais','Garantir que o padrão de evidências fotográficas seja seguido em toda OS finalizada','Relacionamento operacional com o cliente: ser o ponto focal para tratar e resolver problemas operacionais reportados pelo cliente (atrasos, divergências de serviço, reclamações), e reportá-los à diretoria','Melhoria contínua: propor melhorias nos processos operacionais, identificar necessidades da área (equipe, ferramentas, capacidade) e levar essas propostas à diretoria','Servir de ponte entre a operação e a diretoria/comercial em questões de capacidade e prazo'],
    atividades:['Acompanhar diariamente o kanban operacional e identificar OSs paradas ou em risco de atraso','Quando o Líder Operacional sinalizar uma necessidade de priorização por urgência de cliente, avaliar e decidir a reordenação do organizador físico correspondente (Implementos ou Mecânica Diesel)','Autorizar, via contato direto com o cargo de Porteiro, a liberação de equipamentos após confirmação de que a manutenção e o processo de evidências foram concluídos','Supervisionar a distribuição de tarefas entre a equipe administrativa, o almoxarife e os líderes operacionais','Atuar como ponto de escalonamento para problemas operacionais que os líderes ou o administrativo não conseguem resolver sozinhos','Ser o ponto de contato direto do cliente para questões operacionais (prazos, problemas na execução, divergências), buscando solução e formalizando o retorno','Reportar à diretoria sobre capacidade, gargalos, problemas de relacionamento com clientes e necessidade de recursos','Identificar e propor à diretoria melhorias de processo, ferramentas ou estrutura de equipe'],
    interfaces:['Administrativo (fluxo de OS, evidências)','Almoxarife (disponibilidade de material, gargalos de compra)','Porteiro (liberação de equipamentos)','Líderes Operacionais (priorização, capacidade, briefings)','Diretor Comercial/Operacional (reporte direto)','Cliente (relacionamento operacional direto)'],
    documentos:['Kanban operacional (registro de movimentação das OSs)','Registro de decisões de repriorização','Registro de ocorrências/reclamações de clientes e respectiva resolução','Propostas de melhoria operacional (registro simples, para histórico)'],
    indicadores:'A definir — sugestões: tempo médio de ciclo por OS, % de OS com evidências completas, número de repriorizações por urgência/mês, tempo médio de resolução de ocorrências de cliente.' },

  { key:'administrativo', cargo:'Administrativo', area:'Operacional', reportaA:'Gerente Operacional', subordinados:'Nenhum',
    objetivo:'Executar e acompanhar o ciclo completo da Ordem de Serviço, desde a abertura até a etapa imediatamente anterior ao faturamento, garantindo que as informações no sistema estejam corretas, que a documentação de evidências seja produzida, que as tratativas com plataformas de clientes sejam concluídas, e que as compras de peças e insumos necessárias à operação sejam realizadas — sendo o elo entre o cliente, a operação e o financeiro.',
    responsabilidades:['Atendimento inicial ao motorista/cliente no balcão, coletando o motivo da visita','Abertura da OS no sistema com a pré-configuração adequada conforme o relato do serviço','Envio do orçamento ao cliente e acompanhamento da aprovação','Impressão da OS (sem valor) e organização física no organizador correto (Implementos ou Mecânica Diesel), respeitando a ordem definida','Recebimento do papel da OS ao final da execução e registro fotográfico das evidências, junto com o Líder Operacional','Atualização do status da OS em cada etapa do processo (EM ORÇAMENTO, AGUARDANDO VAGA, EM EXECUÇÃO, FINALIZADO, AGUARDANDO PEDIDO)','Gestão das plataformas de clientes (ex: JSL, Fadel, Ritmo, entre outras): tratativa de finalização, descrição dos serviços executados e upload de evidências','Compras de peças e insumos necessários à operação','Acompanhamento da OS do início ao fim dentro de sua responsabilidade (mesma pessoa que abre normalmente segue até a etapa anterior ao faturamento)'],
    atividades:['Atender o motorista no balcão e registrar o motivo da visita/manutenção relatada','Abrir a OS no sistema com status EM ORÇAMENTO, usando pré-configuração baseada no relato','Elaborar e enviar o orçamento ao cliente, com a devida ressalva de que o valor pode ser alterado após abertura do equipamento','Encaminhar casos de negociação de valores ao Comercial/Diretoria quando envolver alteração da tabela base de preços','Após aprovação do cliente: imprimir a OS sem valor e posicioná-la no organizador físico correspondente ao tipo de equipamento, respeitando FIFO (ou ordem definida pela Gerência Operacional em caso de urgência)','Ao receber o papel da OS de volta ao final da execução, dirigir-se ao equipamento junto com o Líder Operacional para registrar as fotos/evidências do serviço realizado','Atualizar o status da OS para FINALIZADO','Para clientes com plataforma própria: acessar a plataforma, descrever os serviços realizados e fazer upload das evidências, atualizando o status da OS para AGUARDANDO PEDIDO','Para clientes sem plataforma própria: sinalizar a OS como pronta para faturamento direto pela Analista Financeira','Realizar cotação e compra de peças e insumos necessários à operação, conforme demanda identificada'],
    interfaces:['Cliente/motorista (atendimento inicial)','Gerente Operacional (reporte, dúvidas de priorização)','Líder Operacional (recebimento do papel da OS, registro conjunto de evidências)','Almoxarife (necessidade de peças e insumos, recebimento do material comprado)','Analista Financeira (encaminhamento de OS finalizadas para faturamento)','Comercial/Diretoria (negociações que exigem alteração de tabela de preços)','Plataformas de clientes (JSL, Fadel, Ritmo, outras)','Fornecedores (compras)','Sistema de gestão de OS'],
    documentos:['OS aberta no sistema, com histórico de status','Orçamento enviado ao cliente','Registro fotográfico/evidências de serviço','Tratativas de finalização em plataformas de clientes','Registros de cotação e compra de peças/insumos'],
    indicadores:'A definir — sugestões: tempo médio entre abertura da OS e envio do orçamento, % de OS com evidências completas registradas no mesmo dia da finalização, tempo médio de tratativa em plataforma de cliente, tempo médio de cotação/compra.',
    nota:'Hoje a equipe é composta por 3 posições. Pode haver divisão informal de foco entre os membros (ex: uma pessoa mais dedicada a compras, outra a atendimento/plataformas), mas isso é uma distribuição operacional interna — não uma diferença de cargo. Todos os ocupantes da posição compartilham a mesma descrição e são, em princípio, aptos a cobrir qualquer uma das atividades.' },

  { key:'almoxarife', cargo:'Almoxarife', area:'Operacional', reportaA:'Gerente Operacional', subordinados:'Nenhum',
    objetivo:'Garantir a gestão física e documental do almoxarifado, assegurando o recebimento correto de peças e insumos, o controle de inventário, e o fornecimento adequado de materiais para a execução dos serviços — incluindo o ajuste da Ordem de Serviço quando houver consumo de itens não previstos originalmente.',
    responsabilidades:['Recebimento físico de peças e insumos comprados pela equipe Administrativa','Lançamento das notas fiscais de compra no sistema','Controle de inventário do almoxarifado (entradas, saídas, contagens periódicas)','Atendimento às solicitações de material feitas pelos mecânicos durante a execução dos serviços','Inclusão, na Ordem de Serviço, de qualquer material utilizado que não estava previsto originalmente, na quantidade efetivamente entregue'],
    atividades:['Receber fisicamente as peças e insumos entregues por fornecedores, conferindo quantidade e qualidade','Lançar a nota fiscal de compra correspondente no sistema','Organizar e armazenar os itens recebidos no almoxarifado','Realizar contagens de inventário (periodicidade a definir) e reportar divergências','Atender a solicitação de material feita pelo mecânico durante a execução de uma OS, entregando o item da lista prevista','Quando o mecânico solicitar um material que não conste na lista original da OS, incluir esse item na OS na quantidade efetivamente entregue','Sinalizar à equipe Administrativa/Gerência Operacional quando houver ruptura de estoque ou necessidade de reposição'],
    interfaces:['Administrativo (compras realizadas, necessidade de reposição)','Mecânicos (solicitação de material durante execução)','Gerente Operacional (reporte de inventário e gargalos)','Fornecedores (recebimento de mercadorias)','Sistema de gestão de OS / estoque'],
    documentos:['Lançamento de notas fiscais de compra','Registro de inventário (entradas, saídas, contagens)','Atualização da OS com itens extras utilizados'],
    indicadores:'A definir — sugestões: acuracidade de inventário, tempo médio de atendimento a solicitação de material, número de itens incluídos fora da lista original por mês.',
    nota:'Pendência: rotina de contagem de inventário (periodicidade, por categoria de item, etc.) ainda não formalizada — a definir com o cliente.' },

  { key:'lider-operacional', cargo:'Líder Operacional', area:'Operacional', reportaA:'Gerente Operacional', subordinados:'Mecânico Oficial e Mecânico 1/2 Oficial da respectiva especialidade', especialidades:['Implementos Rodoviários','Mecânica Diesel'],
    objetivo:'Liderar a execução técnica dos serviços de manutenção dentro de sua especialidade, organizando a equipe de mecânicos, garantindo a qualidade e o correto entendimento do que deve ser executado em cada Ordem de Serviço, e assegurando que o processo de finalização (entrega do papel da OS e registro de evidências) ocorra corretamente.',
    responsabilidades:['Retirada da próxima OS do organizador físico correspondente à sua especialidade, respeitando a ordem estabelecida (FIFO, salvo repriorização da Gerência Operacional)','Realização de briefing com a equipe antes do início de cada serviço, garantindo entendimento do escopo','Fixação do papel da OS no equipamento a ser trabalhado','Supervisão técnica da execução do serviço pelos mecânicos','Sinalização à Gerência Operacional de necessidades de priorização por urgência do cliente','Entrega do papel da OS à equipe Administrativa ao final da execução','Acompanhamento da equipe Administrativa ao equipamento para registro das evidências fotográficas','Gestão da equipe de mecânicos sob sua liderança (organização, distribuição de tarefas, qualidade técnica)'],
    atividades:['Ao haver disponibilidade de vaga, retirar o próximo papel de OS do organizador físico da sua especialidade','Reunir a equipe de mecânicos para um briefing rápido, explicando o serviço a ser executado','Fixar o papel da OS no equipamento com durex, identificando-o para a equipe','Acompanhar e orientar tecnicamente a execução do serviço pelos mecânicos','Caso identifique necessidade de priorizar outra OS por urgência sinalizada pelo cliente, comunicar à Gerência Operacional para decisão','Ao término da execução, recolher o papel da OS e entregá-lo à equipe Administrativa','Acompanhar o Administrativo até o equipamento para o registro fotográfico das evidências do serviço concluído','Zelar pela qualidade técnica do serviço executado por sua equipe'],
    interfaces:['Gerente Operacional (retirada de vaga, sinalização de urgências, reporte)','Administrativo (entrega do papel da OS, registro conjunto de evidências)','Mecânico Oficial e Mecânico 1/2 Oficial (liderança direta, briefing, supervisão técnica)','Almoxarife (indiretamente, via necessidade de material da equipe)'],
    documentos:'Nenhum registro formal direto no sistema (a atualização de status é feita pelo Administrativo) — o principal "registro" físico é o papel da OS fixado no equipamento durante a execução.',
    indicadores:'A definir — sugestões: tempo médio de execução por tipo de serviço, número de retrabalhos por equipe, aderência ao briefing.' },

  { key:'mecanico-oficial', cargo:'Mecânico Oficial', area:'Operacional', reportaA:'Líder Operacional da respectiva especialidade', subordinados:'Nenhum (pode orientar tecnicamente o Mecânico 1/2 Oficial durante a execução conjunta de um serviço, sem relação hierárquica formal)', especialidades:['Implementos Rodoviários','Mecânica Diesel'],
    objetivo:'Executar com autonomia técnica os serviços de manutenção da sua especialidade, aplicando o conhecimento necessário para diagnosticar, reparar e concluir o serviço conforme o escopo definido na Ordem de Serviço, e apoiar o desenvolvimento técnico do Mecânico 1/2 Oficial quando atuarem juntos.',
    responsabilidades:['Execução técnica completa do serviço de manutenção conforme o escopo da OS','Diagnóstico de problemas adicionais não previstos originalmente no orçamento','Solicitação de material necessário à execução junto ao Almoxarifado','Orientação técnica ao Mecânico 1/2 Oficial durante execução conjunta','Zelo pela qualidade e segurança na execução do serviço'],
    atividades:['Participar do briefing conduzido pelo Líder Operacional antes do início do serviço','Executar o serviço de manutenção descrito na OS fixada no equipamento','Identificar e comunicar ao Líder Operacional qualquer necessidade de serviço adicional não prevista no orçamento original','Solicitar ao Almoxarifado os materiais necessários à execução, conforme lista da OS','Quando necessário material fora da lista original, solicitar ao Almoxarifado, que fará a inclusão na OS','Orientar tecnicamente o Mecânico 1/2 Oficial quando atuarem juntos no mesmo serviço','Comunicar ao Líder Operacional o término da execução do serviço','Zelar pelo uso correto de ferramentas, equipamentos de proteção e procedimentos de segurança'],
    interfaces:['Líder Operacional (recebimento de escopo, comunicação de término)','Mecânico 1/2 Oficial (apoio técnico durante execução conjunta)','Almoxarife (solicitação de material)'],
    documentos:'Nenhum registro formal direto no sistema — comunicação de status feita via Líder Operacional/Administrativo.',
    indicadores:'A definir — sugestões: tempo médio de execução por tipo de serviço, taxa de retrabalho, número de serviços adicionais identificados corretamente.' },

  { key:'mecanico-12-oficial', cargo:'Mecânico 1/2 Oficial', area:'Operacional', reportaA:'Líder Operacional da respectiva especialidade', subordinados:'Nenhum', especialidades:['Implementos Rodoviários','Mecânica Diesel'],
    objetivo:'Apoiar a execução dos serviços de manutenção sob orientação do Mecânico Oficial e/ou do Líder Operacional, desenvolvendo progressivamente autonomia técnica na especialidade, e auxiliando nas tarefas operacionais do serviço.',
    responsabilidades:['Apoio direto à execução do serviço sob supervisão do Mecânico Oficial ou Líder Operacional','Execução de tarefas de menor complexidade técnica dentro do escopo da OS','Solicitação de material necessário à execução junto ao Almoxarifado, quando direcionado','Desenvolvimento técnico contínuo na especialidade'],
    atividades:['Participar do briefing conduzido pelo Líder Operacional antes do início do serviço','Auxiliar o Mecânico Oficial ou o Líder Operacional na execução do serviço, conforme orientação','Executar tarefas de menor complexidade técnica de forma mais autônoma, conforme nível de experiência','Solicitar ao Almoxarifado materiais necessários à execução, quando direcionado','Comunicar ao Mecânico Oficial ou Líder Operacional qualquer dificuldade técnica encontrada','Buscar desenvolvimento técnico progressivo na especialidade, visando evolução no cargo'],
    interfaces:['Líder Operacional (recebimento de escopo/orientação)','Mecânico Oficial (apoio técnico direto)','Almoxarife (solicitação de material, quando direcionado)'],
    documentos:'Nenhum registro formal direto no sistema.',
    indicadores:'A definir — sugestões: evolução técnica/tempo de curva de aprendizado, participação em serviços concluídos sem retrabalho.' },

  { key:'analista-financeira', cargo:'Analista Financeira', area:'Financeiro', reportaA:'Diretor Financeiro/Comercial', subordinados:'Nenhum',
    objetivo:'Gerenciar o ciclo financeiro da empresa relacionado ao faturamento das Ordens de Serviço, contas a pagar e a receber, e antecipação de recebíveis, garantindo que os serviços finalizados sejam corretamente faturados e que a liberação junto aos clientes com plataforma própria seja acompanhada até a conclusão.',
    responsabilidades:['Emissão de notas fiscais referentes aos serviços executados','Gestão de contas a pagar','Gestão de contas a receber','Antecipação de recebíveis junto às operações financeiras contratadas (ex: FIDC Atrio, FIDC Trust, entre outras)','Faturamento direto de OSs de clientes sem plataforma própria','Cobrança da liberação/pedido de compra junto a clientes com plataforma própria, para OSs com status AGUARDANDO PEDIDO'],
    atividades:['Monitorar as OSs com status FINALIZADO para identificar quais estão prontas para faturamento','Para clientes sem plataforma própria: emitir a nota fiscal e realizar a cobrança conforme a forma de pagamento acordada (boleto, pix ou cartão), atualizando o status da OS para FATURADO','Para clientes com plataforma própria: acompanhar as OSs com status AGUARDANDO PEDIDO e realizar a cobrança da liberação/pedido de compra junto ao cliente na respectiva plataforma','Após a liberação do cliente, emitir a nota fiscal e atualizar o status da OS para FATURADO','Realizar a gestão de contas a pagar da empresa (fornecedores, despesas operacionais)','Realizar a gestão de contas a receber, incluindo o acompanhamento de inadimplência','Processar antecipação de recebíveis conforme necessidade de fluxo de caixa, junto às operações financeiras contratadas','Reportar ao Diretor Financeiro/Comercial sobre o status do fluxo de caixa e eventuais pendências relevantes'],
    interfaces:['Administrativo (recebimento de OSs finalizadas e prontas para faturamento)','Clientes (cobrança, emissão de nota fiscal, tratativas de liberação)','Diretor Financeiro/Comercial (reporte direto)','Instituições financeiras/operações de antecipação de recebíveis (ex: FIDC Atrio, FIDC Trust, JSL, Ticket-Log, J.Bank)','Fornecedores (contas a pagar)'],
    documentos:['Notas fiscais emitidas','Registros de contas a pagar e a receber','Registros de operações de antecipação de recebíveis','Atualização de status da OS (FATURADO)'],
    indicadores:'A definir — sugestões: tempo médio entre FINALIZADO e FATURADO, taxa de inadimplência, custo médio de antecipação de recebíveis.' },

  { key:'gestor-rh', cargo:'Gestor(a) de RH', area:'Administrativo', reportaA:'Diretor Financeiro/Comercial', subordinados:'Nenhum',
    objetivo:'Gerenciar os processos de recursos humanos da empresa — recrutamento, admissão/demissão, gestão da folha de pagamento (em interface com o DP terceirizado), treinamentos e, futuramente, a gestão de segurança do trabalho via serviço terceirizado — apoiando a estrutura operacional e administrativa no dimensionamento, desenvolvimento e retenção de equipe.',
    responsabilidades:['Recrutamento e seleção de novos colaboradores','Processos admissionais e demissionais','Gestão da folha de pagamento: coleta e organização das marcações de ponto (relógio), correção de inconsistências, e envio das informações ao DP terceirizado para geração dos holerites','Condução direta de treinamentos','Relações trabalhistas e conformidade com legislação','Clima organizacional','Gestão do serviço terceirizado de segurança do trabalho (NRs, EPIs, laudos), quando contratado'],
    atividades:['Conduzir processos de recrutamento e seleção conforme necessidade de vaga sinalizada pelas áreas','Realizar os processos admissionais (documentação, integração) e demissionais (documentação, homologação)','Coletar as marcações do relógio de ponto dos colaboradores periodicamente','Organizar e corrigir inconsistências nas marcações antes do fechamento da folha','Enviar as informações consolidadas ao DP terceirizado para geração dos holerites','Planejar e conduzir treinamentos internos junto às equipes','Acompanhar questões de relações trabalhistas e conformidade com a legislação vigente','Monitorar e atuar sobre o clima organizacional da empresa','Quando aplicável, gerenciar a relação com o serviço terceirizado responsável por segurança do trabalho (NRs, EPIs, laudos, treinamentos obrigatórios)','Reportar ao Diretor Financeiro/Comercial sobre indicadores de pessoal, turnover e pendências relevantes'],
    interfaces:['Todas as áreas da empresa (recrutamento, treinamento, questões trabalhistas)','DP terceirizado (envio de dados para folha de pagamento)','Serviço terceirizado de segurança do trabalho (quando contratado)','Diretor Financeiro/Comercial (reporte direto)'],
    documentos:['Documentação admissional e demissional','Consolidação de ponto para folha de pagamento','Registros de treinamentos realizados','Registros de relações trabalhistas (advertências, ocorrências, quando aplicável)'],
    indicadores:'A definir — sugestões: turnover, tempo médio de preenchimento de vaga, número de treinamentos realizados/mês, % de correções de ponto por período.' },

  { key:'marketing-digital', cargo:'Marketing Digital', area:'Comercial/Marketing', reportaA:'Diretor Financeiro/Comercial', subordinados:'Nenhum',
    objetivo:'Gerenciar toda a presença digital da empresa (redes sociais, site, campanhas pagas), produzindo ou coordenando a produção de conteúdo e artes — incluindo comunicações institucionais como avisos de feriados, datas comemorativas e recados internos — e direcionando ao Comercial qualquer contato direto recebido por canais digitais.',
    responsabilidades:['Gestão das redes sociais (ex: Instagram), site institucional e campanhas de anúncios (ads)','Confecção de artes e conteúdo visual, incluindo comunicações institucionais (feriados, aniversários, avisos internos e externos)','Produção de conteúdo próprio ou gestão de terceiros contratados para produção (fotos, vídeos, artes)','Direcionamento ao Comercial de mensagens diretas recebidas pelos canais digitais da empresa'],
    atividades:['Planejar e executar o calendário de postagens nas redes sociais da empresa','Criar ou coordenar (via terceiros, sob sua gestão) a produção de artes e conteúdo visual/audiovisual','Gerenciar e atualizar o site institucional da empresa','Planejar, configurar e acompanhar campanhas de anúncios pagos (ads)','Produzir ou solicitar a produção de artes para datas comemorativas, feriados, aniversários e comunicados internos','Monitorar as caixas de mensagem dos canais digitais (ex: Instagram) e direcionar contatos comerciais recebidos ao setor Comercial','Quando a produção de conteúdo for terceirizada, gerenciar o fornecedor (briefing, prazos, qualidade), mantendo a responsabilidade final pelo resultado','Reportar ao Diretor Financeiro/Comercial sobre desempenho de campanhas e engajamento digital'],
    interfaces:['Comercial (encaminhamento de leads/contatos recebidos)','Diretor Financeiro/Comercial (reporte direto, aprovação de campanhas)','Fornecedores/terceiros de produção de conteúdo (quando aplicável)','Demais áreas da empresa (solicitação de informações para comunicados internos, ex: aniversários)'],
    documentos:['Calendário/planejamento de postagens','Registros de campanhas de anúncios (investimento, período, resultado)','Contatos direcionados ao Comercial'],
    indicadores:'A definir — sugestões: engajamento nas redes, número de leads gerados/direcionados ao Comercial, custo por lead em campanhas pagas.' },

  { key:'comercial', cargo:'Comercial', area:'Comercial', reportaA:'Diretoria (Diretor Comercial/Operacional e Diretor Financeiro/Comercial)', subordinados:'Nenhum', vaga:true,
    objetivo:'Conduzir a negociação comercial com clientes quando o orçamento inicial não for aprovado de imediato, gerenciar contatos comerciais recebidos via marketing digital, e atuar na captação e relacionamento comercial com clientes, respeitando a alçada de alteração de preços definida pela diretoria.',
    responsabilidades:['Negociação de valores e condições comerciais com clientes, quando o orçamento inicial (elaborado pelo Administrativo) não for aprovado','Atendimento aos contatos comerciais direcionados pelo Marketing Digital','Prospecção e relacionamento comercial com clientes atuais e potenciais','Encaminhamento à Diretoria de qualquer negociação que exija alteração da tabela base de preços'],
    atividades:['Receber da equipe Administrativa os casos em que o orçamento enviado ao cliente não foi aprovado','Negociar valores e condições comerciais diretamente com o cliente','Verificar se a negociação está dentro da alçada padrão; caso exija alteração da tabela base de preços, submeter à aprovação da Diretoria antes de fechar','Atender aos contatos comerciais recebidos e direcionados pelo Marketing Digital','Atualizar a OS/orçamento após negociação concluída, comunicando o resultado ao Administrativo','Atuar na prospecção de novos clientes e manutenção do relacionamento com a carteira atual'],
    interfaces:['Administrativo (recebimento de orçamentos não aprovados, atualização pós-negociação)','Marketing Digital (recebimento de contatos/leads)','Diretoria (aprovação de alterações de tabela de preços, reporte direto)','Clientes (negociação comercial direta)'],
    documentos:['Registro de negociações realizadas (condições finais acordadas)','Solicitações de aprovação de alteração de tabela enviadas à Diretoria'],
    indicadores:'A definir — sugestões: taxa de conversão de orçamentos negociados, tempo médio de negociação, número de novos clientes captados/mês.',
    nota:'Cargo atualmente vago.' },

  { key:'planejamento-estrategico', cargo:'Planejamento Estratégico e Resultados', area:'Staff / Consultoria Externa', reportaA:'Diretoria', subordinados:'Nenhum',
    objetivo:'Atuar como parceiro de transformação de gestão da empresa, estruturando a visibilidade do negócio através de business intelligence, consolidando o conhecimento organizacional em um repositório vivo de suporte contínuo, e conduzindo a evolução e padronização dos processos administrativos e operacionais — com foco em resultado e maturidade de gestão, não em suporte operacional do dia a dia.',
    responsabilidades:['Estruturação de dashboards e relatórios gerenciais (financeiro, operacional, comercial) que deem aos donos visibilidade clara e atualizada do negócio','Identificação de KPIs relevantes ao setor de manutenção de frotas/caminhões','Organização e interpretação das bases de dados existentes, tradução de dados em insights acionáveis','Manutenção de um repositório vivo de informações da empresa: toda demanda pontual resolvida deixa rastro documentado (análises, decisões, comunicações)','Elaboração de comunicações, propostas comerciais e relatórios sob demanda da Diretoria','Mapeamento de processos administrativos e operacionais (fluxo, responsáveis, frequência, volume)','Identificação de gargalos, retrabalho e oportunidades de melhoria de eficiência, propondo e priorizando soluções por impacto e viabilidade (podendo envolver automações, novos sistemas ou ajustes de processo, conforme o caso mais adequado)','Documentação da estrutura organizacional da empresa (organograma, descrições de cargo) como base para padronização de processos e eventual adequação a normas de gestão (ex: ISO 9001)'],
    atividades:['Levantar, estruturar e manter atualizados os dashboards gerenciais da empresa (financeiro, operacional, comercial)','Consolidar dados de diferentes fontes (ERP, planilhas, plataformas de clientes) em uma base coerente para análise','Responder a demandas pontuais da Diretoria e das áreas (dúvidas administrativas/operacionais, análise de documentos, rascunho de comunicações), registrando o resultado no espaço do projeto para consulta futura','Documentar o organograma da empresa e as descrições detalhadas de cada função/cargo','Mapear os processos operacionais e administrativos existentes, incluindo fluxogramas e regras de negócio','Identificar oportunidades de melhoria de processo e eficiência, propondo soluções (automações, novos sistemas ou ajustes de processo, conforme o mais adequado) e avaliando impacto e viabilidade antes de priorizar','Reportar periodicamente à Diretoria o andamento das iniciativas, resultados obtidos e próximos passos recomendados','Sinalizar proativamente quando faltar informação relevante para completar uma análise ou entrega'],
    interfaces:['Diretoria (reporte direto, validação de prioridades e decisões estratégicas)','Gerente Operacional (levantamento de processos operacionais, dados de campo)','Analista Financeira (dados financeiros para dashboards e relatórios)','Demais áreas da empresa, conforme demanda pontual de suporte ou mapeamento de processo','Fornecedores de tecnologia, quando envolver estruturação de dados e sistemas'],
    documentos:['Dashboards e relatórios gerenciais','Manual da empresa (organograma, descrições de cargo, procedimentos)','Análises, propostas e comunicações produzidas sob demanda','Mapeamentos de processo e propostas de melhoria'],
    indicadores:'A definir — sugestões: número de dashboards/módulos entregues, tempo médio de resposta a demandas pontuais, número de melhorias de processo implementadas.' },
];

const MN_ORG = { label:'DIRETORIA', dir:true, static:true, children:[
  { label:'Diretor Comercial/Operacional', static:true, children:[
    { label:'Gerente Operacional', key:'gerente-operacional', children:[
      { label:'Administrativo', sub:'3 posições', key:'administrativo' },
      { label:'Almoxarife', key:'almoxarife' },
      { label:'Porteiro', key:'porteiro' },
      { label:'Líder Operacional', sub:'Implementos Rodoviários', key:'lider-operacional', children:[
        { label:'Mecânico Oficial', sub:'Implementos', key:'mecanico-oficial' },
        { label:'Mecânico 1/2 Oficial', sub:'Implementos', key:'mecanico-12-oficial' }
      ]},
      { label:'Líder Operacional', sub:'Mecânica Diesel', key:'lider-operacional', children:[
        { label:'Mecânico Oficial', sub:'Mecânica Diesel', key:'mecanico-oficial' },
        { label:'Mecânico 1/2 Oficial', sub:'Mecânica Diesel', key:'mecanico-12-oficial' }
      ]}
    ]}
  ]},
  { label:'Diretor Financeiro/Comercial', static:true, children:[
    { label:'Analista Financeira', key:'analista-financeira' },
    { label:'Gestor(a) de RH', key:'gestor-rh' },
    { label:'Marketing Digital', key:'marketing-digital' },
    { label:'Comercial', sub:'vaga', key:'comercial' }
  ]},
  { label:'Planejamento Estratégico e Resultados', sub:'reporta a ambos os diretores', staff:true, key:'planejamento-estrategico' }
]};

// Status da OS → cor, para o mesmo status ser reconhecível em todo o fluxo.
const MN_CORES_STATUS = {
  'PORTARIA':          {bg:'#e0f2fe', cor:'#0369a1'},
  'EM ORÇAMENTO':      {bg:'#fef3c7', cor:'#b45309'},
  'AGUARDANDO VAGA':   {bg:'#ffedd5', cor:'#c2410c'},
  'EM EXECUÇÃO':       {bg:'#ede9fe', cor:'#6d28d9'},
  'FINALIZADO':        {bg:'#dcfce7', cor:'#15803d'},
  'AGUARDANDO PEDIDO': {bg:'#fce7f3', cor:'#be185d'},
  'FATURADO':          {bg:'#d1fae5', cor:'#047857'}
};

const MN_FASES = [
  { nome:'Recepção', desc:'O equipamento chega e a OS nasce', cor:'#0284c7', etapas:[
    {etapa:'Entrada do equipamento e registro na portaria', resp:'Porteiro', key:'porteiro', status:'PORTARIA', marco:true,
     nota:'Registra placa, motorista e horário de entrada no sistema de portaria.'},
    {etapa:'Atendimento no balcão e coleta do motivo da visita', resp:'Administrativo', key:'administrativo'},
    {etapa:'Abertura da OS no sistema, com pré-configuração conforme o relato', resp:'Administrativo', key:'administrativo', status:'EM ORÇAMENTO', marco:true}
  ]},
  { nome:'Orçamento e aprovação', desc:'Negociação até o cliente autorizar', cor:'#d97706', etapas:[
    {etapa:'Envio do orçamento ao cliente', resp:'Administrativo', key:'administrativo', status:'EM ORÇAMENTO',
     nota:'Sempre com a ressalva de que o valor pode mudar após a abertura do equipamento.'},
    {etapa:'Negociação, quando o orçamento não é aprovado de imediato', resp:'Comercial', key:'comercial', status:'EM ORÇAMENTO',
     nota:'Alteração da tabela base de preços exige aprovação da Diretoria.'},
    {etapa:'Aprovado: impressão da OS sem valor e organização no organizador físico', resp:'Administrativo', key:'administrativo', status:'AGUARDANDO VAGA', marco:true,
     nota:'Organizador definido pelo tipo de equipamento (Implementos ou Mecânica Diesel), em ordem FIFO. Só a Gerência Operacional pode repriorizar.'}
  ]},
  { nome:'Execução', desc:'A manutenção acontece no pátio', cor:'#7c3aed', etapas:[
    {etapa:'Líder retira a próxima OS, faz o briefing com a equipe e fixa o papel no equipamento', resp:'Líder Operacional', key:'lider-operacional', status:'EM EXECUÇÃO', marco:true},
    {etapa:'Execução da manutenção e solicitação de material ao almoxarifado', resp:'Mecânicos', key:'mecanico-oficial', status:'EM EXECUÇÃO',
     nota:'Material fora da lista original é incluído na OS pelo Almoxarife, na quantidade efetivamente entregue.'},
    {etapa:'Fim da execução: o papel da OS volta para o Administrativo responsável', resp:'Líder Operacional', key:'lider-operacional'}
  ]},
  { nome:'Evidências', desc:'A prova de que o serviço foi feito', cor:'#16a34a', etapas:[
    {etapa:'Registro fotográfico do serviço, no equipamento', resp:'Administrativo', key:'administrativo', status:'FINALIZADO', marco:true,
     alerta:'Etapa crítica: sem as evidências o cliente pode negar o serviço. O Administrativo vai até o equipamento junto com o Líder Operacional.'}
  ]}
];

const MN_BIFURCACAO = {
  titulo:'A partir daqui o caminho depende do cliente',
  caminhos:[
    { titulo:'Cliente com plataforma própria', icone:'fa-laptop', quando:'Ex: JSL, Fadel, Ritmo', etapas:[
      {etapa:'Tratativa de finalização e upload das evidências no portal do cliente', resp:'Administrativo', key:'administrativo', status:'AGUARDANDO PEDIDO', marco:true},
      {etapa:'Cobrança da liberação/pedido de compra junto ao cliente', resp:'Analista Financeira', key:'analista-financeira', status:'AGUARDANDO PEDIDO',
       nota:'AGUARDANDO PEDIDO é exclusivamente serviço pronto esperando liberação do cliente — não usar para espera de peça.'},
      {etapa:'Liberado pelo cliente: emissão da nota fiscal', resp:'Analista Financeira', key:'analista-financeira', status:'FATURADO', marco:true}
    ]},
    { titulo:'Cliente sem plataforma própria', icone:'fa-file-invoice-dollar', quando:'Faturamento direto', etapas:[
      {etapa:'Emissão da nota fiscal e cobrança conforme o combinado', resp:'Analista Financeira', key:'analista-financeira', status:'FATURADO', marco:true,
       nota:'Boleto, pix ou cartão, conforme a forma de pagamento acordada.'}
    ]}
  ]
};

const MN_PROCESSO_FINAL = {
  etapa:'Liberação do equipamento e registro da saída',
  resp:'Porteiro', key:'porteiro', marco:true,
  nota:'Somente após a Gerência Operacional confirmar que a manutenção e as evidências foram concluídas.'
};

const MN_REGRAS = [
  { grupo:'Regras de Conduta', itens:[
    { id:'respeito', num:6, titulo:'Respeito e Convivência', body:[
      {p:'Na Renova acreditamos que um ambiente de trabalho saudável depende do respeito entre todas as pessoas.'},
      {label:'Espera-se de todos:', ul:['tratar colegas, clientes e fornecedores com educação','agir com profissionalismo','respeitar diferenças','colaborar com a equipe','manter postura ética']},
      {label:'Não será permitido:', ul:['agressões físicas ou verbais','ameaças','assédio moral ou sexual','discriminação de qualquer natureza','brincadeiras ofensivas']}
    ]},
    { id:'seguranca', num:7, titulo:'Segurança do Trabalho', body:[
      {p:'A segurança é responsabilidade de todos.'},
      {label:'É obrigatório:', ul:['utilizar corretamente os EPIs fornecidos','seguir os procedimentos de segurança','participar dos treinamentos obrigatórios','comunicar acidentes imediatamente','comunicar situações de risco']},
      {note:'Todo colaborador ou prestador de serviços deverá interromper imediatamente qualquer atividade que represente risco grave à integridade física das pessoas, comunicando o fato ao gestor responsável.'},
      {label:'É proibido:', ul:['retirar proteções de máquinas','executar atividades inseguras','utilizar ferramentas danificadas sem comunicar']},
      {note:'A prevenção de acidentes é um compromisso coletivo.'}
    ]},
    { id:'organizacao', num:8, titulo:'Organização e Limpeza', body:[
      {p:'Cada profissional deve cuidar do ambiente de trabalho como se fosse seu, preservando ferramentas, equipamentos e instalações para garantir segurança, eficiência e respeito aos colegas.'},
      {label:'Ao final das atividades:', ul:['guardar ferramentas','limpar a bancada','organizar materiais','descartar resíduos corretamente','manter corredores livres','conservar a limpeza das áreas comuns']},
      {note:'Um ambiente organizado reduz acidentes e melhora a produtividade.'}
    ]},
    { id:'uniforme', num:9, titulo:'Uniforme e Apresentação', body:[
      {label:'Durante a permanência nas dependências da empresa é obrigatório:', ul:['utilizar uniforme fornecido pela empresa','utilizar os EPIs obrigatórios','manter boa higiene pessoal']},
      {note:'Não é permitido trabalhar sem identificação quando esta for exigida.'}
    ]},
    { id:'epis', num:10, titulo:'Equipamentos de Proteção Individual (EPIs)', body:[
      {label:'Responsabilidades de cada colaborador ou prestador de serviços:', ul:['cuidar dos EPIs','comunicar perdas','devolver os EPIs quando solicitado pela empresa','solicitar substituição quando necessário']}
    ]},
    { id:'ferramentas', num:11, titulo:'Ferramentas e Patrimônio', body:[
      {label:'É dever de cada profissional:', ul:['utilizar corretamente equipamentos e ferramentas','guardar ferramentas após o uso','comunicar perdas, danos ou defeitos','evitar desperdícios de materiais','manter os equipamentos limpos e organizados','devolver ferramentas ao local correto após sua utilização']},
      {label:'É proibido:', ul:['retirar ferramentas ou materiais sem autorização','utilizar equipamentos para fins particulares','danificar, alterar ou inutilizar equipamentos da empresa']},
      {note:'Todos são responsáveis pela conservação do patrimônio da Renova Manutenções. Ferramentas perdidas ou danificadas devem ser comunicadas imediatamente ao gestor.'}
    ]},
    { id:'qualidade', num:12, titulo:'Qualidade dos Serviços', body:[
      {p:'Os serviços devem ser executados conforme os padrões de qualidade da Renova. Caso seja identificada alguma falha, o responsável deverá realizar as correções necessárias dentro do prazo estabelecido.'},
      {p:'O compromisso com a qualidade fortalece a confiança dos clientes e a imagem da empresa.'},
      {p:'Esse padrão está alinhado às obrigações contratuais de execução conforme o escopo e padrões de qualidade.'}
    ]},
    { id:'comunicacao', num:13, titulo:'Comunicação', body:[
      {label:'O colaborador ou prestador de serviços deverá comunicar imediatamente ao gestor qualquer situação que possa comprometer:', ul:['a segurança','a qualidade dos serviços','os prazos','o patrimônio','os clientes','a imagem da empresa','quase acidentes','reclamações de clientes','perdas de ferramentas','danos ao patrimônio']}
    ]},
    { id:'cliente', num:14, titulo:'Relacionamento com o Cliente', body:[
      {p:'Todo colaborador ou prestador de serviços representa a imagem da Renova perante seus clientes.'},
      {label:'É esperado que todos:', ul:['tratem o cliente com educação e respeito','utilizem linguagem profissional','preservem o patrimônio do cliente','comuniquem imediatamente qualquer ocorrência envolvendo veículos ou equipamentos','preservem a imagem da empresa durante todo o atendimento, mantendo uma postura ética']}
    ]},
    { id:'celular', num:15, titulo:'Uso de Celular', body:[
      {p:'O uso do celular deve ocorrer com bom senso.'},
      {label:'É proibido utilizá-lo:', ul:['durante operações que ofereçam risco','enquanto estiver operando máquinas','durante atendimento ao cliente, salvo necessidade do serviço','com fones de ouvido durante atividades operacionais','para assistir vídeos ou utilizar redes sociais durante o expediente, salvo quando autorizado','para chamadas pessoais, exceto em situações necessárias','enquanto estiver conduzindo veículo da empresa']}
    ]}
  ]},
  { grupo:'Proteção da Empresa', itens:[
    { id:'sigilo', num:16, titulo:'Sigilo e Confidencialidade', body:[
      {p:'Todas as informações da empresa são confidenciais.'},
      {label:'Incluem-se:', ul:['clientes e fornecedores','valores dos serviços oferecidos','contratos','documentos e dados internos','processos e projetos','fotografias','sistemas']},
      {note:'As informações obtidas durante a prestação dos serviços não poderão ser utilizadas para benefício próprio ou de terceiros. A obrigação de confidencialidade permanece mesmo após o encerramento da relação contratual.'}
    ]},
    { id:'lgpd', num:17, titulo:'Proteção de Dados (LGPD)', body:[
      {p:'Dados pessoais e da empresa devem ser tratados com responsabilidade.'},
      {label:'É proibido:', ul:['compartilhar documentos de clientes','divulgar dados pessoais','fotografar documentos sem autorização','utilizar informações para fins particulares','armazenar documentos sem autorização']},
      {note:'Em caso de incidente envolvendo dados pessoais, a empresa deverá ser comunicada imediatamente, conforme previsto contratualmente.'}
    ]},
    { id:'marca', num:18, titulo:'Uso da Marca Renova', body:[
      {label:'Não é permitido:', ul:['utilizar o nome da empresa para interesses particulares','utilizar o logotipo sem autorização','negociar em nome da empresa sem autorização','publicar informações internas em redes sociais']},
      {note:'Essa regra acompanha a vedação contratual ao uso indevido da marca e da imagem da Renova.'}
    ]},
    { id:'propriedade', num:19, titulo:'Propriedade da Empresa', body:[
      {p:'Tudo que for desenvolvido exclusivamente para a Renova durante a prestação dos serviços pertence à empresa.'},
      {label:'Exemplos:', ul:['relatórios','planilhas','procedimentos','desenhos técnicos','projetos','formulários','manuais','documentos técnicos']}
    ]},
    { id:'anticorrupcao', num:20, titulo:'Política Anticorrupção', body:[
      {label:'É proibido:', ul:['receber vantagens indevidas','oferecer propina','praticar fraude','oferecer, solicitar ou aceitar brindes, presentes ou vantagens que possam influenciar decisões comerciais','utilizar recursos da empresa para fins ilícitos']}
    ]},
    { id:'documental', num:21, titulo:'Regularidade Documental', body:[
      {p:'Sempre que solicitado pela empresa, o prestador de serviços deverá apresentar a documentação necessária para comprovação de sua regularidade.'}
    ]}
  ]},
  { grupo:'Normas Disciplinares', itens:[
    { id:'alcool-drogas', num:22, titulo:'Álcool e Drogas', body:[
      {label:'É proibido:', ul:['trabalhar sob efeito de álcool','trabalhar sob efeito de drogas ilícitas','consumir bebidas alcoólicas durante o expediente','portar drogas ilícitas nas dependências da empresa']},
      {note:'A segurança de todos depende da responsabilidade individual.'}
    ]},
    { id:'condutas-proibidas', num:23, titulo:'Condutas Proibidas', body:[
      {label:'São proibidas as seguintes condutas:', ul:['fraude','furto ou roubo','corrupção','falsificação de documentos','uso indevido da marca da empresa','dano intencional ao patrimônio','violação de informações confidenciais','desrespeitar clientes, colegas ou fornecedores','omitir acidentes ou situações de risco','utilizar equipamentos da empresa para fins particulares sem autorização','descumprimento das normas de segurança','qualquer prática ilícita','descumprimento deliberado das normas deste Manual']},
      {note:'Essas condutas podem resultar em rescisão imediata do contrato ou demissão por justa causa, conforme previsto na cláusula de integridade e nas hipóteses de rescisão contratual e, para os colaboradores CLT, demissão por justa causa, conforme art. 482 da CLT.'}
    ]},
    { id:'medidas', num:24, titulo:'Medidas Disciplinares', body:[
      {label:'O descumprimento das normas deste Manual poderá resultar, conforme a gravidade da ocorrência, em:', ul:['orientação verbal','advertência escrita','suspensão, quando aplicável','encerramento do contrato de prestação de serviços','demissão por justa causa, quando aplicável aos empregados regidos pela CLT','comunicação às autoridades competentes, quando houver indícios de prática ilícita']},
      {p:'A medida disciplinar será aplicada considerando a natureza da ocorrência, seus impactos e a legislação vigente.'}
    ]},
    { id:'desligamento', num:25, titulo:'Desligamento', body:[
      {label:'No encerramento do vínculo deverão ser devolvidos:', ul:['uniforme e EPIs','ferramentas','documentos','equipamentos','materiais e demais bens pertencentes à empresa']},
      {note:'No encerramento do vínculo, todos os acessos físicos e eletrônicos deverão ser devolvidos ou cancelados, bem como qualquer informação, documento ou material pertencente à empresa.'}
    ]}
  ]},
  { grupo:'Encerramento', itens:[
    { id:'mensagem-final', num:26, titulo:'Mensagem Final', body:[
      {p:'A Renova Manutenções acredita que a qualidade dos serviços, a segurança das pessoas e a confiança dos clientes são construídas diariamente por meio das atitudes de cada profissional.'},
      {p:'Esperamos que este Manual seja utilizado como um guia para o desenvolvimento de um ambiente de trabalho organizado, seguro, respeitoso e comprometido com a excelência.'},
      {p:'Contamos com você para fortalecer nossa equipe e representar a Renova Manutenções com ética, responsabilidade e profissionalismo.'},
      {p:'Disposições finais: este Manual poderá ser atualizado sempre que necessário, visando atender alterações na legislação, nos procedimentos internos ou nas necessidades da Renova Manutenções. Todos deverão observar a versão vigente disponibilizada pela empresa. Casos não previstos serão analisados pela Diretoria, observando a legislação aplicável e as normas internas.'}
    ]},
    { id:'termo-ciencia', num:27, titulo:'Termo de Ciência', body:[
      {p:'"Declaro que recebi, li e compreendi o Manual de Regras e Conduta da Renova Manutenções. Comprometo-me a cumprir todas as normas aqui estabelecidas, zelando pela segurança, qualidade dos serviços, respeito às pessoas e preservação do patrimônio da empresa."'},
      {note:'Este é o texto de referência do termo assinado no processo admissional (nome, CPF, função, local, data e assinatura) — exibido aqui apenas como consulta, não é um formulário preenchível.'}
    ]}
  ]}
];

// ── Backend do organograma (Apps Script da planilha do Manual) ──
// Publicação: ver apps-script/manual-empresa.gs no repositório.
// Enquanto a URL não for preenchida o módulo funciona em rascunho local.
const MN_API = { URL: API_MANUAL, salvando: false, pendente: false };
function mnNuvemAtiva(){ return MN_API.URL.indexOf('COLE_A_URL') === -1; }

/** POST autenticado ao Apps Script, no formato que evita preflight CORS. */
async function mnPost(payload){
  const r = await fetch(MN_API.URL, {
    method:'POST', mode:'cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({token: RV.token}, payload))
  });
  const d = await r.json();
  if(!d.success) throw new Error(d.error || 'resposta inválida');
  return d;
}

// ── Estado editável (nuvem quando configurada; rascunho local como reserva) ──
const MN_STORE_KEY = 'renova_manual_org_v1';
let MN_TREE = null;          // árvore viva do organograma
let mnEditMode = false;
let mnMostrarFotos = true;
let mnEdAtual = null;        // nó em edição
let mnFotoTmp = null;        // foto em edição (data-url ou url)

function mnNovoUid(){
  return 'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function mnCloneOrg(node, parent){
  const n = {
    uid: node.uid || mnNovoUid(),
    label: node.label, sub: node.sub||'', key: node.key||null,
    dir: !!node.dir, staff: !!node.staff, vaga: !!node.vaga,
    nome: node.nome||'', foto: node.foto||'',
    collapsed: !!node.collapsed,
    _parent: parent||null, children: []
  };
  (node.children||[]).forEach(c => n.children.push(mnCloneOrg(c, n)));
  return n;
}
function mnRelink(node, parent){
  node._parent = parent||null;
  (node.children||[]).forEach(c=>mnRelink(c,node));
}
function mnSerialize(node){
  return { uid:node.uid, label:node.label, sub:node.sub, key:node.key, dir:node.dir, staff:node.staff,
           vaga:node.vaga, nome:node.nome, foto:node.foto, collapsed:node.collapsed,
           children:(node.children||[]).map(mnSerialize) };
}
function mnSalvarEstado(){
  try{ localStorage.setItem(MN_STORE_KEY, JSON.stringify(mnSerialize(MN_TREE))); }catch(e){ console.warn('Manual: não foi possível salvar o rascunho', e); }
  mnAtualizarStatusCfg();
  if(mnNuvemAtiva()) mnAgendarSalvarNuvem();
}

// ══ Sincronização com a planilha ══
// A árvore vira linhas (uma por posição) e volta. Sempre gravamos a árvore
// inteira: é mais simples que atualização parcial e não deixa estado meio-gravado.
function mnAchatar(){
  const linhas = [];
  (function walk(n, pai, ordem){
    linhas.push({
      uid:n.uid, parent_uid: pai?pai.uid:'', ordem:ordem,
      cargo:n.label||'', especialidade:n.sub||'', cargo_key:n.key||'',
      nome:n.nome||'', foto_url:n.foto||'',
      tipo: n.dir?'diretoria':(n.staff?'assessoria':'cargo'),
      recolhido: n.collapsed?'1':''
    });
    (n.children||[]).forEach((c,i)=>walk(c,n,i));
  })(MN_TREE, null, 0);
  return linhas;
}
function mnMontarArvore(linhas){
  if(!linhas || !linhas.length) return null;
  const mapa = {};
  linhas.forEach(l=>{
    const uid = String(l.uid||'').trim();
    if(!uid) return;
    mapa[uid] = { uid, label:String(l.cargo||'').trim(), sub:String(l.especialidade||'').trim(),
      key:String(l.cargo_key||'').trim()||null,
      dir:l.tipo==='diretoria', staff:l.tipo==='assessoria',
      nome:String(l.nome||'').trim(), foto:String(l.foto_url||'').trim(),
      collapsed:String(l.recolhido)==='1', children:[], _ordem:Number(l.ordem)||0 };
  });
  let raiz = null;
  const orfaos = [];
  linhas.forEach(l=>{
    const n = mapa[String(l.uid||'').trim()];
    if(!n) return;
    const idPai = String(l.parent_uid||'').trim();
    const pai = mapa[idPai];
    if(pai){ pai.children.push(n); return; }
    if(!idPai && !raiz){ raiz = n; return; }
    // Pai inexistente ou segunda raiz: pendura na raiz em vez de descartar.
    // Sumir com uma posição seria perder gente do organograma em silêncio.
    orfaos.push(n);
  });
  if(!raiz) raiz = orfaos.shift() || null;
  if(!raiz) return null;
  if(orfaos.length){
    console.warn('Manual: '+orfaos.length+' posição(ões) sem pai válido, anexadas à raiz:',
      orfaos.map(o=>o.label+(o.nome?' ('+o.nome+')':'')).join(', '));
    orfaos.forEach(o=>raiz.children.push(o));
  }
  (function ord(n){ n.children.sort((a,b)=>a._ordem-b._ordem); n.children.forEach(ord); })(raiz);
  return raiz;
}
async function mnCarregarDaNuvem(){
  if(!mnNuvemAtiva()) return false;
  try{
    const r = await fetch(MN_API.URL+'?action=organograma_get&t='+Date.now());
    const d = await r.json();
    if(!d.success) throw new Error(d.error||'resposta inválida');
    if(!d.data || !d.data.length) return false;   // planilha ainda vazia → mantém o padrão
    const arvore = mnMontarArvore(d.data);
    if(!arvore) return false;
    MN_TREE = mnCloneOrg(arvore, null); mnRelink(MN_TREE, null);
    return true;
  }catch(e){
    console.warn('Manual: falha ao ler da planilha, usando cópia local', e);
    MN_API.erroLeitura = true;
    mnStatusNuvem('erro', e.message);
    return false;
  }
}
let mnTimerNuvem = null;
function mnAgendarSalvarNuvem(){
  clearTimeout(mnTimerNuvem);
  mnStatusNuvem('pendente');
  mnTimerNuvem = setTimeout(mnSalvarNaNuvem, 900);
}
async function mnSalvarNaNuvem(){
  if(!mnNuvemAtiva()) return;
  if(!rvPodeEditar()) return;   // consulta não grava
  if(MN_API.salvando){ MN_API.pendente = true; return; }
  MN_API.salvando = true;
  mnStatusNuvem('salvando');
  try{
    await mnPost({action:'organograma_set', linhas: mnAchatar()});
    mnStatusNuvem('ok');
  }catch(e){
    console.warn('Manual: falha ao salvar na planilha', e);
    mnStatusNuvem('erro', e.message);
  }finally{
    MN_API.salvando = false;
    if(MN_API.pendente){ MN_API.pendente = false; mnAgendarSalvarNuvem(); }
  }
}
function mnStatusNuvem(estado, detalhe){
  const el = document.getElementById('mn-cfg-nuvem');
  if(!el) return;
  const mapa = {
    pendente:['rascunho','<i class="fa-solid fa-clock"></i> Alterações pendentes…'],
    salvando:['rascunho','<i class="fa-solid fa-arrows-rotate"></i> Salvando na planilha…'],
    ok:['limpo','<i class="fa-solid fa-cloud-arrow-up"></i> Salvo na planilha — visível para toda a equipe'],
    erro:['erro','<i class="fa-solid fa-triangle-exclamation"></i> Falha ao salvar'+(detalhe?': '+kbEsc(detalhe):'')+' — guardado neste navegador'],
    off:['rascunho','<i class="fa-solid fa-plug-circle-xmark"></i> Planilha não conectada — alterações só neste navegador']
  };
  const [cls, html] = mapa[estado] || mapa.off;
  el.className = 'mn-cfg-status ' + cls;
  el.innerHTML = html;
}
function mnCarregarEstado(){
  let base = null;
  try{
    const raw = localStorage.getItem(MN_STORE_KEY);
    if(raw) base = JSON.parse(raw);
  }catch(e){ console.warn('Manual: rascunho inválido, usando padrão', e); }
  MN_TREE = mnCloneOrg(base || MN_ORG, null);
  mnRelink(MN_TREE, null);
}
function mnTemRascunho(){ try{ return !!localStorage.getItem(MN_STORE_KEY); }catch(e){ return false; } }
function mnAtualizarStatusCfg(){
  const el = document.getElementById('mn-cfg-status');
  if(!el) return;
  const tem = mnTemRascunho();
  el.className = 'mn-cfg-status ' + (tem?'rascunho':'limpo');
  el.innerHTML = tem
    ? '<i class="fa-solid fa-pen"></i> Rascunho local salvo neste navegador'
    : '<i class="fa-solid fa-check"></i> Sem alterações locais';
}
function mnIniciais(nome){
  if(!nome) return '';
  const p = nome.trim().split(/\s+/);
  return ((p[0]||'')[0]||'').toUpperCase() + ((p.length>1?p[p.length-1]:'')[0]||'').toUpperCase();
}
function mnAvatarHTML(node, cls){
  const ini = mnIniciais(node.nome);
  if(mnMostrarFotos && node.foto) return '<img class="'+cls+'" src="'+kbEsc(node.foto)+'" alt="'+kbEsc(node.nome)+'">';
  return '<div class="'+cls+'">'+(ini || '<i class="fa-solid fa-user"></i>')+'</div>';
}

// ══ Descrições de cargo: planilha ↔ formato usado na tela ══
// MN_CARGOS nasce embutido no código e é substituído pelo conteúdo da planilha
// assim que ela responde. Serve de reserva se a planilha estiver fora do ar.
function mnCargoDaPlanilha(r){
  return {
    key: String(r.cargo_key||'').trim(),
    cargo: r.cargo||'', area: r.area||'', reportaA: r.reporta_a||'',
    subordinados: r.subordinados||'',
    especialidades: (r.especialidades||[]).length ? r.especialidades : null,
    objetivo: r.objetivo||'',
    responsabilidades: r.responsabilidades||[],
    atividades: r.atividades||[],
    interfaces: r.interfaces||[],
    documentos: r.documentos||[],
    indicadores: r.indicadores||'',
    nota: r.nota||'',
    ordem: Number(r.ordem)||0
  };
}
function mnCargoParaPlanilha(c, i){
  return {
    cargo_key: c.key, cargo: c.cargo, area: c.area, reporta_a: c.reportaA,
    subordinados: c.subordinados, especialidades: c.especialidades||[],
    objetivo: c.objetivo, responsabilidades: c.responsabilidades,
    atividades: c.atividades, interfaces: c.interfaces,
    documentos: Array.isArray(c.documentos) ? c.documentos : [c.documentos],
    indicadores: c.indicadores, nota: c.nota||'', ordem: i
  };
}
async function mnCarregarCargosDaNuvem(){
  if(!mnNuvemAtiva()) return false;
  try{
    const r = await fetch(MN_API.URL+'?action=cargos_get&t='+Date.now());
    const d = await r.json();
    if(!d.success) throw new Error(d.error||'resposta inválida');
    if(!d.data || !d.data.length) return false;   // planilha vazia → mantém o embutido
    MN_CARGOS = d.data.map(mnCargoDaPlanilha);
    return true;
  }catch(e){
    console.warn('Manual: falha ao ler os cargos da planilha, usando cópia do código', e);
    return false;
  }
}
async function mnSalvarCargosNaNuvem(){
  if(!mnNuvemAtiva() || !rvPodeEditar()) return;
  mnStatusNuvem('salvando');
  try{
    await mnPost({action:'cargos_set', cargos: MN_CARGOS.map(mnCargoParaPlanilha)});
    mnStatusNuvem('ok');
  }catch(e){
    console.warn('Manual: falha ao salvar os cargos', e);
    mnStatusNuvem('erro', e.message);
    alert('Não consegui salvar na planilha: '+e.message);
  }
}

let mnIniciado = false;
function initManual(){
  if(mnIniciado) return;
  mnIniciado = true;
  // Desenha imediatamente com o que já temos (cópia local ou padrão do código)
  // e, se a planilha estiver conectada, substitui pelo conteúdo dela.
  mnCarregarEstado();
  renderOrganograma();
  renderCargos();
  renderProcesso();
  renderRegras();
  mnAtualizarStatusCfg();
  mnLigarPanZoom();
  mnAplicarLogo();
  mnStatusNuvem(mnNuvemAtiva() ? 'salvando' : 'off');
  if(mnNuvemAtiva()){
    Promise.all([mnCarregarDaNuvem(), mnCarregarCargosDaNuvem()]).then(([org, cargos])=>{
      if(org){ renderOrganograma(); setTimeout(orgFit,20); }
      if(org || cargos) renderCargos();
      if(!MN_API.erroLeitura) mnStatusNuvem('ok');
    });
  }
}

// Reaproveita o logo já embutido na home em vez de duplicar ~76 KB de base64.
function mnAplicarLogo(){
  const origem = document.querySelector('#screen-home .home-header img');
  const destino = document.getElementById('mn-hero-logo');
  if(origem && destino && origem.src) destino.src = origem.src;
  else if(destino) destino.style.display = 'none';
}

function switchManualTab(tab){
  document.querySelectorAll('#screen-manual .mn-tab').forEach(b=>b.classList.toggle('active', b.dataset.mntab===tab));
  document.querySelectorAll('#screen-manual .mn-panel').forEach(p=>p.classList.toggle('active', p.id==='mn-panel-'+tab));
  document.querySelector('#screen-manual .mn-body').scrollIntoView({block:'start'});
  if(tab==='organograma') setTimeout(orgFit, 30);
  if(tab==='config'){ mnAtualizarCartaoConta(); if(rvPodeEditar()) carregarUsuarios(); }
}

// ══ Motor de layout do organograma ══
const NW=214, NH=64, HG=26, VG=58, STACK_IND=26, STACK_VG=9;

function mnVisibleKids(n){ return n.collapsed ? [] : (n.children||[]); }
// A partir do nível 1 os subordinados "penduram" na vertical (padrão de organograma
// grande): mantém a árvore estreita e legível em vez de correr para o lado.
const MN_NIVEL_PENDURA = 1;
function mnMedir(n, depth){
  n._depth = depth;
  const kids = mnVisibleKids(n);
  if(!kids.length){ n._stack=false; n._w=NW; n._h=NH; return; }
  kids.forEach(k=>mnMedir(k, depth+1));
  n._stack = depth >= MN_NIVEL_PENDURA;
  if(n._stack){
    n._w = STACK_IND + Math.max(NW, ...kids.map(k=>k._w));
    n._h = NH + VG - 26 + kids.reduce((s,k)=>s+k._h,0) + STACK_VG*(kids.length-1);
  } else {
    n._w = Math.max(NW, kids.reduce((s,k)=>s+k._w,0) + HG*(kids.length-1));
    n._h = NH + VG + Math.max(...kids.map(k=>k._h));
  }
}
function mnPosicionar(n, left, top){
  n.y = top;
  const kids = mnVisibleKids(n);
  if(!kids.length){ n.x = left + (n._w-NW)/2; return; }
  if(n._stack){
    n.x = left;
    let cy = top + NH + VG - 26;
    kids.forEach(k=>{ mnPosicionar(k, left+STACK_IND, cy); cy += k._h + STACK_VG; });
    return;
  }
  let cx = left;
  kids.forEach(k=>{ mnPosicionar(k, cx, top+NH+VG); cx += k._w + HG; });
  n.x = (kids[0].x + kids[kids.length-1].x)/2;
}

function mnNodeHTML(n){
  const cls = ['mn-node'];
  if(n.dir) cls.push('is-dir');
  if(n.staff) cls.push('is-staff');
  if(!n.nome && !n.dir) cls.push('is-vaga');
  const kids = n.children||[];
  const temFilhos = kids.length>0;
  // Especialidade e nome dividem a segunda linha — evita truncar o nome do cargo.
  const partes = [];
  if(n.sub)  partes.push('<b style="color:#b45309;font-weight:800;">'+kbEsc(n.sub)+'</b>');
  if(n.nome) partes.push(kbEsc(n.nome));
  const pessoa = partes.length
    ? '<div class="mn-node-pessoa">'+partes.join(' &middot; ')+'</div>'
    : (n.dir ? '' : '<div class="mn-node-pessoa vazio">a definir</div>');
  const sub = '';
  const toggle = temFilhos
    ? '<div class="mn-node-toggle" onclick="event.stopPropagation();orgToggleNo(\''+n.uid+'\')" title="'+(n.collapsed?'Expandir equipe':'Recolher equipe')+'">'
      + (n.collapsed ? '<b>'+mnContarDesc(n)+'</b>' : '<i class="fa-solid fa-minus"></i>') + '</div>'
    : '';
  const edit = '<div class="mn-node-edit" onclick="event.stopPropagation();abrirEditor(\''+n.uid+'\')" title="Editar"><i class="fa-solid fa-pen"></i></div>';
  const click = n.key ? ' onclick="abrirCargoDoManual(\''+n.key+'\')"' : ' onclick="abrirEditor(\''+n.uid+'\')"';
  return '<div class="'+cls.join(' ')+'" style="left:'+n.x+'px;top:'+n.y+'px;width:'+NW+'px;height:'+NH+'px;"'+click+'>'
    + mnAvatarHTML(n,'mn-node-av')
    + '<div class="mn-node-txt"><div class="mn-node-cargo">'+kbEsc(n.label)+sub+'</div>'+pessoa+'</div>'
    + toggle + edit + '</div>';
}
function mnContarDesc(n){
  let c=0; (n.children||[]).forEach(k=>{ c += 1 + mnContarDesc(k); }); return c;
}

function mnLinksSVG(n, acc){
  const kids = mnVisibleKids(n);
  if(!kids.length) return acc;
  const px = n.x + NW/2, pb = n.y + NH;
  if(n._stack){
    const spineX = n.x + 16;
    const last = kids[kids.length-1];
    acc.push('<path d="M '+spineX+' '+pb+' V '+(last.y+NH/2)+'" />');
    kids.forEach(k=>{ acc.push('<path d="M '+spineX+' '+(k.y+NH/2)+' H '+k.x+'" />'); });
  } else {
    const midY = n.y + NH + VG/2;
    acc.push('<path d="M '+px+' '+pb+' V '+midY+'" />');
    kids.forEach(k=>{
      const cx = k.x + NW/2;
      acc.push('<path d="M '+px+' '+midY+' H '+cx+' V '+k.y+'" />');
    });
  }
  kids.forEach(k=>mnLinksSVG(k, acc));
  return acc;
}

function mnFlat(n, acc){ acc.push(n); mnVisibleKids(n).forEach(k=>mnFlat(k,acc)); return acc; }

function renderOrganograma(){
  if(!MN_TREE) mnCarregarEstado();
  mnMedir(MN_TREE, 0);
  mnPosicionar(MN_TREE, 40, 30);
  const nodes = mnFlat(MN_TREE, []);
  const maxX = Math.max(...nodes.map(n=>n.x)) + NW + 60;
  const maxY = Math.max(...nodes.map(n=>n.y)) + NH + 60;
  document.getElementById('mn-org-nodes').innerHTML = nodes.map(mnNodeHTML).join('');
  const svg = document.getElementById('mn-org-links');
  svg.setAttribute('width', maxX); svg.setAttribute('height', maxY);
  svg.innerHTML = '<g fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-linejoin="round">'+mnLinksSVG(MN_TREE, []).join('')+'</g>';
  const canvas = document.getElementById('mn-org-canvas');
  canvas.style.width = maxX+'px'; canvas.style.height = maxY+'px';
  canvas._w = maxX; canvas._h = maxY;
}

// ══ Zoom / pan ══
let orgZ = 1, orgTx = 0, orgTy = 0;
function orgAplicar(){
  const c = document.getElementById('mn-org-canvas');
  c.style.transform = 'translate('+orgTx+'px,'+orgTy+'px) scale('+orgZ+')';
  const lbl = document.getElementById('mn-zoom-label');
  if(lbl) lbl.textContent = Math.round(orgZ*100)+'%';
}
function orgZoom(dir){
  orgZ = Math.min(2, Math.max(0.3, orgZ + dir*0.12));
  orgAplicar();
}
function orgFit(){
  const vp = document.getElementById('mn-org-viewport');
  const c = document.getElementById('mn-org-canvas');
  if(!vp || !c || !c._w) return;
  const pad = 28;
  // Ajusta pela largura (a altura navega arrastando) — mantém os cards legíveis
  // em vez de encolher tudo para caber a árvore inteira na vertical.
  const zLargura = (vp.clientWidth - pad) / c._w;
  const zAltura  = (vp.clientHeight - pad) / c._h;
  orgZ = Math.max(0.4, Math.min(zLargura, Math.max(zAltura, 0.72), 1.1));
  orgTx = Math.max(0, (vp.clientWidth - c._w*orgZ)/2);
  orgTy = 12;
  orgAplicar();
}
function orgToggleNo(uid){
  const n = mnFlat(MN_TREE,[]).find(x=>x.uid===uid) || mnBuscarUid(MN_TREE, uid);
  if(!n) return;
  n.collapsed = !n.collapsed;
  renderOrganograma(); mnSalvarEstado();
}
function mnBuscarUid(n, uid){
  if(n.uid===uid) return n;
  for(const k of (n.children||[])){ const r = mnBuscarUid(k, uid); if(r) return r; }
  return null;
}
function orgExpandAll(abrir){
  (function walk(n){ n.collapsed = !abrir && n!==MN_TREE; (n.children||[]).forEach(walk); })(MN_TREE);
  renderOrganograma(); setTimeout(orgFit,10); mnSalvarEstado();
}
function orgToggleFotos(){
  mnMostrarFotos = !mnMostrarFotos;
  document.getElementById('mn-btn-fotos').classList.toggle('on', mnMostrarFotos);
  renderOrganograma();
}
function orgToggleEdit(){
  mnEditMode = !mnEditMode;
  document.getElementById('screen-manual').classList.toggle('edit-mode', mnEditMode);
  document.getElementById('mn-btn-edit').classList.toggle('on', mnEditMode);
}
function mnLigarPanZoom(){
  const vp = document.getElementById('mn-org-viewport');
  if(!vp || vp._ligado) return;
  vp._ligado = true;
  let arrastando=false, sx=0, sy=0, ox=0, oy=0, moveu=false;
  vp.addEventListener('mousedown', e=>{
    if(e.target.closest('.mn-node')) return;
    arrastando=true; moveu=false; sx=e.clientX; sy=e.clientY; ox=orgTx; oy=orgTy;
    vp.classList.add('dragging');
  });
  window.addEventListener('mousemove', e=>{
    if(!arrastando) return;
    orgTx = ox + (e.clientX-sx); orgTy = oy + (e.clientY-sy); moveu=true; orgAplicar();
  });
  window.addEventListener('mouseup', ()=>{ arrastando=false; vp.classList.remove('dragging'); });
  vp.addEventListener('wheel', e=>{
    if(!e.ctrlKey) return;
    e.preventDefault();
    orgZoom(e.deltaY>0 ? -1 : 1);
  }, {passive:false});
  window.addEventListener('resize', ()=>{ if(document.getElementById('mn-panel-organograma').classList.contains('active')) orgFit(); });
}

// ══ Editor ══
function abrirEditor(uid){
  if(!rvPodeEditar()) return;   // consulta não abre o editor
  const n = mnBuscarUid(MN_TREE, uid);
  if(!n) return;
  mnEdAtual = n; mnFotoTmp = n.foto||'';
  document.getElementById('mn-ed-title').textContent = 'Editar: '+n.label;
  document.getElementById('mn-ed-cargo').value = n.label||'';
  document.getElementById('mn-ed-sub').value = n.sub||'';
  document.getElementById('mn-ed-nome').value = n.nome||'';
  document.getElementById('mn-ed-foto-url').value = (n.foto && !n.foto.startsWith('data:')) ? n.foto : '';
  document.getElementById('mn-ed-note').innerHTML = n.key
    ? 'Este cargo está ligado à descrição <b>'+kbEsc(n.label)+'</b> na aba Descrições de Cargo.'
    : 'Posição criada por você — ainda sem descrição de cargo vinculada.';
  mnPreviewAvatar();
  document.getElementById('mn-modal-edit').classList.add('open');
}
function fecharEditor(){ document.getElementById('mn-modal-edit').classList.remove('open'); mnEdAtual=null; }
function mnPreviewAvatar(){
  const prev = document.getElementById('mn-ed-prev');
  const url = document.getElementById('mn-ed-foto-url').value.trim();
  const foto = url || mnFotoTmp;
  const nome = document.getElementById('mn-ed-nome').value;
  if(foto) prev.outerHTML = '<img class="mn-ed-prev" id="mn-ed-prev" src="'+kbEsc(foto)+'" alt="">';
  else prev.outerHTML = '<div class="mn-ed-prev" id="mn-ed-prev">'+(mnIniciais(nome)||'<i class="fa-solid fa-user"></i>')+'</div>';
}
function mnUploadFoto(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = new Image();
    img.onload = ()=>{
      const S=160, cv=document.createElement('canvas'); cv.width=S; cv.height=S;
      const ctx=cv.getContext('2d');
      const lado=Math.min(img.width,img.height);
      ctx.drawImage(img,(img.width-lado)/2,(img.height-lado)/2,lado,lado,0,0,S,S);
      mnFotoTmp = cv.toDataURL('image/jpeg',0.82);
      document.getElementById('mn-ed-foto-url').value='';
      mnPreviewAvatar();
      // Com a planilha conectada a foto vai para o Drive e guardamos só o link:
      // base64 numa célula estoura o limite de 50 mil caracteres do Sheets.
      if(mnNuvemAtiva()) mnEnviarFotoDrive(mnFotoTmp);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
  input.value='';
}
async function mnEnviarFotoDrive(dataUrl){
  const nota = document.getElementById('mn-ed-note');
  const textoAnterior = nota ? nota.innerHTML : '';
  if(nota) nota.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Enviando a foto para o Drive…';
  try{
    const d = await mnPost({
      action:'organograma_foto',
      nome: (document.getElementById('mn-ed-nome').value||'foto').trim(),
      base64: dataUrl, mime:'image/jpeg'
    });
    if(!d.url) throw new Error('o servidor não devolveu o link da foto');
    mnFotoTmp = d.url;
    mnPreviewAvatar();
    if(nota) nota.innerHTML = '<i class="fa-solid fa-check" style="color:#16a34a"></i> Foto enviada. Clique em Salvar para aplicar.';
  }catch(e){
    console.warn('Manual: falha ao enviar foto', e);
    if(nota) nota.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#b45309"></i> Não consegui enviar a foto ao Drive ('+kbEsc(e.message)+'). Ela ficará salva só neste navegador.';
    setTimeout(()=>{ if(nota) nota.innerHTML = textoAnterior; }, 6000);
  }
}
function mnRemoverFoto(){ mnFotoTmp=''; document.getElementById('mn-ed-foto-url').value=''; mnPreviewAvatar(); }
function salvarEditor(){
  if(!mnEdAtual) return;
  const url = document.getElementById('mn-ed-foto-url').value.trim();
  mnEdAtual.label = document.getElementById('mn-ed-cargo').value.trim() || mnEdAtual.label;
  mnEdAtual.sub   = document.getElementById('mn-ed-sub').value.trim();
  mnEdAtual.nome  = document.getElementById('mn-ed-nome').value.trim();
  mnEdAtual.foto  = url || mnFotoTmp || '';
  fecharEditor(); renderOrganograma(); renderCargos(); mnSalvarEstado();
}
function mnAddFilho(){
  if(!mnEdAtual) return;
  const novo = mnCloneOrg({label:'Nova posição', sub:'', nome:''}, mnEdAtual);
  mnEdAtual.children.push(novo);
  mnEdAtual.collapsed = false;
  fecharEditor(); renderOrganograma(); mnSalvarEstado();
  setTimeout(()=>abrirEditor(novo.uid), 120);
}
function mnMover(dir){
  const n = mnEdAtual; if(!n || !n._parent) return;
  const irmaos = n._parent.children;
  const i = irmaos.indexOf(n), j = i+dir;
  if(j<0 || j>=irmaos.length) return;
  irmaos[i]=irmaos[j]; irmaos[j]=n;
  renderOrganograma(); mnSalvarEstado();
}
function mnRemoverNo(){
  const n = mnEdAtual; if(!n) return;
  if(!n._parent){ alert('A raiz do organograma não pode ser removida.'); return; }
  const qtd = mnContarDesc(n);
  const msg = qtd ? 'Remover "'+n.label+'" e as '+qtd+' posições subordinadas?' : 'Remover a posição "'+n.label+'"?';
  if(!confirm(msg)) return;
  const irmaos = n._parent.children;
  irmaos.splice(irmaos.indexOf(n),1);
  fecharEditor(); renderOrganograma(); renderCargos(); mnSalvarEstado();
}

// ══ Backup / sincronização ══
function mnPessoasLista(){
  const out=[];
  (function walk(n){ if(n.nome||n.foto) out.push({cargo:n.label, sub:n.sub||'', nome:n.nome||'', foto:n.foto||''}); (n.children||[]).forEach(walk); })(MN_TREE);
  return out;
}
function mnBaixarJSON(){
  const blob = new Blob([JSON.stringify(mnSerialize(MN_TREE),null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'organograma-renova-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function mnImportarJSON(input){
  const f = input.files && input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = e=>{
    try{
      const dados = JSON.parse(e.target.result);
      if(!dados || !dados.label) throw new Error('formato inesperado');
      MN_TREE = mnCloneOrg(dados,null); mnRelink(MN_TREE,null);
      renderOrganograma(); renderCargos(); mnSalvarEstado(); setTimeout(orgFit,20);
      alert('Backup restaurado com sucesso.');
    }catch(err){ alert('Não foi possível ler este arquivo: '+err.message); }
  };
  r.readAsText(f); input.value='';
}
function mnCopiarTSV(){
  const linhas = mnPessoasLista();
  if(!linhas.length){ alert('Nenhum nome preenchido ainda. Ative o modo Editar na aba Organograma para incluir as pessoas.'); return; }
  const tsv = 'cargo\tespecialidade\tnome\tfoto_url\n' + linhas.map(l=>{
    const foto = l.foto.startsWith('data:') ? '(foto enviada do computador — publicar via backup JSON)' : l.foto;
    return [l.cargo,l.sub,l.nome,foto].join('\t');
  }).join('\n');
  navigator.clipboard.writeText(tsv).then(
    ()=>alert('Copiado! Cole na aba "Pessoas" da planilha de referência ('+linhas.length+' linhas).'),
    ()=>alert('Não foi possível copiar automaticamente. Use o botão "Baixar backup (JSON)".')
  );
}
// ══ Acessos ══
function mnAtualizarCartaoConta(){
  const n=document.getElementById('cfg-eu-nome'), l=document.getElementById('cfg-eu-login'), p=document.getElementById('cfg-eu-papel');
  if(n) n.textContent = RV.nome || '—';
  if(l) l.textContent = RV.usuario || '—';
  if(p) p.textContent = rvPodeEditar() ? 'Administrador' : 'Consulta';
}

async function carregarUsuarios(){
  const alvo = document.getElementById('cfg-usuarios');
  if(!alvo || !rvPodeEditar()) return;
  alvo.innerHTML = '<p class="mn-ed-note">Carregando…</p>';
  try{
    const d = await mnPost({action:'usuarios_get'});
    const lista = d.data || [];
    alvo.innerHTML = lista.map(u=>{
      const inativo = String(u.ativo).toLowerCase() !== 'sim';
      const eu = u.login === RV.usuario;
      return '<div class="cfg-user'+(inativo?' inativo':'')+'">'
        +'<div class="ini">'+(mnIniciais(u.nome)||u.login.slice(0,2).toUpperCase())+'</div>'
        +'<div class="dados"><b>'+kbEsc(u.nome||u.login)+(eu?' <span style="font-size:.66rem;color:#4f46e5;">(você)</span>':'')+'</b>'
        +'<small>'+kbEsc(u.login)+' · '+(u.papel==='admin'?'Administrador':'Consulta')+(inativo?' · desativado':'')+'</small></div>'
        +'<div class="acoes">'
          +'<button class="cfg-mini" onclick=\'abrirUsuario('+JSON.stringify(u).replace(/'/g,"&#39;")+')\'>Editar</button>'
          +(eu?'':'<button class="cfg-mini danger" onclick="removerUsuarioPortal(\''+kbEsc(u.login)+'\')">Remover</button>')
        +'</div></div>';
    }).join('') || '<p class="mn-ed-note">Nenhum acesso cadastrado.</p>';
  }catch(e){
    alvo.innerHTML = '<p class="mn-ed-note" style="color:var(--danger)">Não consegui carregar os acessos: '+kbEsc(e.message)+'</p>';
  }
}

function abrirUsuario(u){
  const novo = !u;
  document.getElementById('mn-us-titulo').textContent = novo ? 'Novo acesso' : 'Editar acesso';
  document.getElementById('mn-us-erro').style.display='none';
  document.getElementById('mn-us-login').value = novo ? '' : u.login;
  document.getElementById('mn-us-login').disabled = !novo;
  document.getElementById('mn-us-nome').value = novo ? '' : (u.nome||'');
  document.getElementById('mn-us-papel').value = novo ? 'comum' : (u.papel==='admin'?'admin':'comum');
  document.getElementById('mn-us-ativo').value = novo ? 'sim' : (String(u.ativo).toLowerCase()==='sim'?'sim':'nao');
  document.getElementById('mn-us-senha').value = '';
  document.getElementById('mn-us-lbl-senha').textContent = novo ? 'Senha' : 'Nova senha (opcional)';
  document.getElementById('mn-us-dica-senha').textContent = novo
    ? 'Combine a senha com a pessoa. Ela pode trocá-la depois em Configurações.'
    : 'Deixe em branco para manter a senha atual.';
  document.getElementById('mn-modal-usuario').classList.add('open');
}

async function salvarUsuarioPortal(){
  const erro = document.getElementById('mn-us-erro');
  const dados = {
    login: document.getElementById('mn-us-login').value.trim(),
    nome:  document.getElementById('mn-us-nome').value.trim(),
    papel: document.getElementById('mn-us-papel').value,
    ativo: document.getElementById('mn-us-ativo').value === 'sim',
    senha: document.getElementById('mn-us-senha').value
  };
  const mostrarErro = m => { erro.textContent = m; erro.style.display='block'; };
  if(!dados.login){ mostrarErro('Informe o login.'); return; }
  if(dados.senha && dados.senha.length < 6){ mostrarErro('A senha precisa ter ao menos 6 caracteres.'); return; }
  try{
    await mnPost({action:'usuario_salvar', usuario:dados});
    document.getElementById('mn-modal-usuario').classList.remove('open');
    carregarUsuarios();
  }catch(e){ mostrarErro(e.message); }
}

async function removerUsuarioPortal(login){
  if(!confirm('Remover o acesso de "'+login+'"? A pessoa deixa de conseguir entrar no sistema.')) return;
  try{
    await mnPost({action:'usuario_remover', login});
    carregarUsuarios();
  }catch(e){ alert('Não foi possível remover: '+e.message); }
}

function abrirTrocarSenha(inicial){
  document.getElementById('mn-sn-erro').style.display='none';
  document.getElementById('mn-sn-ok').style.display='none';
  document.getElementById('mn-sn-aviso').style.display = inicial ? 'block' : 'none';
  ['mn-sn-atual','mn-sn-nova','mn-sn-nova2'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mn-modal-senha').classList.add('open');
}

async function salvarNovaSenha(){
  const erro=document.getElementById('mn-sn-erro'), ok=document.getElementById('mn-sn-ok');
  const atual=document.getElementById('mn-sn-atual').value;
  const nova =document.getElementById('mn-sn-nova').value;
  const nova2=document.getElementById('mn-sn-nova2').value;
  const falhar = m => { erro.textContent=m; erro.style.display='block'; ok.style.display='none'; };
  if(nova.length < 6){ falhar('A nova senha precisa ter ao menos 6 caracteres.'); return; }
  if(nova !== nova2){ falhar('A confirmação não confere com a nova senha.'); return; }
  try{
    await mnPost({action:'trocar_senha', senhaAtual:atual, senhaNova:nova});
    erro.style.display='none';
    ok.textContent='Senha alterada com sucesso.'; ok.style.display='block';
    setTimeout(()=>document.getElementById('mn-modal-senha').classList.remove('open'), 1300);
  }catch(e){ falhar(e.message); }
}

function mnResetarEdicoes(){
  if(!confirm('Descartar todas as alterações locais e voltar ao organograma original?')) return;
  try{ localStorage.removeItem(MN_STORE_KEY); }catch(e){}
  MN_TREE = mnCloneOrg(MN_ORG,null); mnRelink(MN_TREE,null);
  renderOrganograma(); renderCargos(); mnAtualizarStatusCfg(); setTimeout(orgFit,20);
}

function mnOcupantes(key){
  const out=[];
  if(!MN_TREE) return out;
  (function walk(n){ if(n.key===key && (n.nome||n.foto)) out.push(n); (n.children||[]).forEach(walk); })(MN_TREE);
  return out;
}
function mnCargoCardHTML(c){
  const semGente = mnOcupantes(c.key).length === 0;
  const badges = (c.especialidades ? '<span class="mn-cargo-esp">'+c.especialidades.length+' especialidades</span>' : '')
    + (semGente ? '<span class="mn-cargo-esp" style="background:#fee2e2;color:#dc2626;">sem ocupante</span>' : '');
  const documentosHtml = Array.isArray(c.documentos) ? '<ul>'+c.documentos.map(d=>'<li>'+kbEsc(d)+'</li>').join('')+'</ul>' : '<p>'+kbEsc(c.documentos)+'</p>';
  const notaHtml = c.nota ? '<div class="mn-cargo-sec"><h4>Observação</h4><p>'+kbEsc(c.nota)+'</p></div>' : '';
  const espHtml = c.especialidades ? '<div class="mn-cargo-sec"><h4>Especialidades</h4><p>Este cargo existe em duas especialidades — <b>'+c.especialidades.join('</b> e <b>')+'</b> — com a mesma descrição-base; a diferença é a área técnica de atuação e a equipe subordinada.</p></div>' : '';
  const gente = mnOcupantes(c.key);
  const avatares = gente.length
    ? '<div class="mn-cargo-pessoas">'+gente.slice(0,4).map(p=>mnAvatarHTML(p,'mn-av-mini')).join('')
      +(gente.length>4 ? '<div class="mn-av-mini">+'+(gente.length-4)+'</div>' : '')+'</div>'
    : '';
  const equipeHtml = gente.length
    ? '<div class="mn-cargo-sec"><h4>Quem ocupa esta função</h4><div class="mn-equipe-grid">'
      + gente.map(p=>'<span class="mn-equipe-chip">'
          + (mnMostrarFotos && p.foto ? '<img src="'+kbEsc(p.foto)+'" alt="">' : '<span class="ini">'+(mnIniciais(p.nome)||'?')+'</span>')
          + kbEsc(p.nome || 'sem nome') + (p.sub?' <span style="color:var(--muted);font-weight:600;">· '+kbEsc(p.sub)+'</span>':'')
        +'</span>').join('')
      +'</div></div>'
    : '';
  const nomesBusca = gente.map(p=>kbEsc(p.nome).toLowerCase()).join(' ');
  return '<div class="mn-cargo-card" id="mn-cargo-'+c.key+'" data-nome="'+kbEsc(c.cargo).toLowerCase()+' '+kbEsc(c.area).toLowerCase()+' '+nomesBusca+'">'
    +'<div class="mn-cargo-head" onclick="toggleCargoCard(\''+c.key+'\')">'
      +'<div class="mn-cargo-ico"><i class="fa-solid fa-id-badge"></i></div>'
      +'<div class="mn-cargo-titles"><div class="nome">'+kbEsc(c.cargo)+badges+'</div><div class="meta">'+kbEsc(c.area)+' &middot; Reporta a: '+kbEsc(c.reportaA)+'</div></div>'
      +avatares
      +'<i class="fa-solid fa-chevron-down mn-cargo-chevron"></i>'
    +'</div>'
    +'<div class="mn-cargo-body">'
      +equipeHtml
      +espHtml
      +'<div class="mn-cargo-sec"><h4>Objetivo do cargo</h4><p>'+kbEsc(c.objetivo)+'</p></div>'
      +'<div class="mn-cargo-sec"><h4>Subordinados diretos</h4><p>'+kbEsc(c.subordinados)+'</p></div>'
      +'<div class="mn-cargo-sec"><h4>Responsabilidades principais</h4><ul>'+c.responsabilidades.map(r=>'<li>'+kbEsc(r)+'</li>').join('')+'</ul></div>'
      +'<div class="mn-cargo-sec"><h4>Atividades detalhadas</h4><ol>'+c.atividades.map(a=>'<li>'+kbEsc(a)+'</li>').join('')+'</ol></div>'
      +'<div class="mn-cargo-sec"><h4>Interfaces</h4><ul>'+c.interfaces.map(i=>'<li>'+kbEsc(i)+'</li>').join('')+'</ul></div>'
      +'<div class="mn-cargo-sec"><h4>Documentos/registros gerados</h4>'+documentosHtml+'</div>'
      +'<div class="mn-cargo-sec"><h4>Indicadores</h4><p>'+kbEsc(c.indicadores)+'</p></div>'
      +notaHtml
      +'<div class="mn-cargo-sec so-admin bloco" style="border-top:1px solid var(--border);padding-top:12px;">'
        +'<button class="cfg-mini" onclick="event.stopPropagation();abrirEditorCargo(\''+c.key+'\')"><i class="fa-solid fa-pen"></i> Editar este cargo</button> '
        +'<button class="cfg-mini danger" onclick="event.stopPropagation();excluirCargo(\''+c.key+'\')"><i class="fa-solid fa-trash"></i> Excluir</button>'
      +'</div>'
    +'</div>'
  +'</div>';
}
function renderCargos(){
  document.getElementById('mn-cargo-list').innerHTML = MN_CARGOS.map(mnCargoCardHTML).join('');
  document.getElementById('mn-cargo-count').textContent = MN_CARGOS.length+' cargos';
}
// ══ CRUD das descrições de cargo ══
let mnCargoEditando = null;   // null = novo cargo

/** Gera uma chave estável a partir do nome, sem colidir com as existentes. */
function mnChaveCargo(nome){
  let base = nome.toLowerCase().normalize('NFD')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').slice(0,40);
  if(!base) base = 'cargo';
  let k = base, i = 2;
  while(MN_CARGOS.some(c=>c.key===k)) k = base+'-'+(i++);
  return k;
}
const mnLinhas = txt => String(txt||'').split('\n').map(s=>s.trim()).filter(Boolean);

function abrirEditorCargo(key){
  if(!rvPodeEditar()) return;
  const c = key ? MN_CARGOS.find(x=>x.key===key) : null;
  mnCargoEditando = c || null;
  document.getElementById('mn-cg-titulo').textContent = c ? 'Editar: '+c.cargo : 'Novo cargo';
  document.getElementById('mn-cg-erro').style.display='none';
  const p = (id,v)=>document.getElementById(id).value = v||'';
  p('mn-cg-cargo', c&&c.cargo); p('mn-cg-area', c&&c.area);
  p('mn-cg-reporta', c&&c.reportaA); p('mn-cg-subordinados', c&&c.subordinados);
  p('mn-cg-especialidades', c&&c.especialidades ? c.especialidades.join(', ') : '');
  p('mn-cg-objetivo', c&&c.objetivo);
  p('mn-cg-responsabilidades', c ? (c.responsabilidades||[]).join('\n') : '');
  p('mn-cg-atividades', c ? (c.atividades||[]).join('\n') : '');
  p('mn-cg-interfaces', c ? (c.interfaces||[]).join('\n') : '');
  p('mn-cg-documentos', c ? (Array.isArray(c.documentos)?c.documentos:[c.documentos]).filter(Boolean).join('\n') : '');
  p('mn-cg-indicadores', c&&c.indicadores); p('mn-cg-nota', c&&c.nota);
  document.getElementById('mn-modal-cargo').classList.add('open');
}

async function salvarEditorCargo(){
  const erro = document.getElementById('mn-cg-erro');
  const v = id => document.getElementById(id).value.trim();
  const nome = v('mn-cg-cargo');
  if(!nome){ erro.textContent='Informe o nome do cargo.'; erro.style.display='block'; return; }

  const esp = v('mn-cg-especialidades').split(',').map(s=>s.trim()).filter(Boolean);
  const dados = {
    cargo: nome, area: v('mn-cg-area'), reportaA: v('mn-cg-reporta'),
    subordinados: v('mn-cg-subordinados') || 'Nenhum',
    especialidades: esp.length ? esp : null,
    objetivo: v('mn-cg-objetivo'),
    responsabilidades: mnLinhas(v('mn-cg-responsabilidades')),
    atividades: mnLinhas(v('mn-cg-atividades')),
    interfaces: mnLinhas(v('mn-cg-interfaces')),
    documentos: mnLinhas(v('mn-cg-documentos')),
    indicadores: v('mn-cg-indicadores'), nota: v('mn-cg-nota')
  };

  if(mnCargoEditando){
    Object.assign(mnCargoEditando, dados);   // a chave não muda: o organograma aponta para ela
  } else {
    MN_CARGOS.push(Object.assign({key: mnChaveCargo(nome)}, dados));
  }
  document.getElementById('mn-modal-cargo').classList.remove('open');
  renderCargos();
  await mnSalvarCargosNaNuvem();
}

async function excluirCargo(key){
  if(!rvPodeEditar()) return;
  const c = MN_CARGOS.find(x=>x.key===key);
  if(!c) return;
  const usos = mnOcupantes(key).length;
  const ligados = (function(){ let n=0; (function w(x){ if(x.key===key) n++; (x.children||[]).forEach(w); })(MN_TREE||{children:[]}); return n; })();
  let msg = 'Excluir a descrição do cargo "'+c.cargo+'"?';
  if(ligados) msg += '\n\nAtenção: '+ligados+' posição(ões) do organograma apontam para este cargo'
    + (usos ? ' ('+usos+' com pessoa definida)' : '')
    + '. Elas continuam no organograma, mas ficam sem descrição vinculada.';
  if(!confirm(msg)) return;
  MN_CARGOS = MN_CARGOS.filter(x=>x.key!==key);
  renderCargos();
  await mnSalvarCargosNaNuvem();
}

function toggleCargoCard(key){
  const el = document.getElementById('mn-cargo-'+key);
  if(el) el.classList.toggle('open');
}
function filterCargos(v){
  const q = v.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('#mn-cargo-list .mn-cargo-card').forEach(el=>{
    const match = el.dataset.nome.includes(q);
    el.style.display = match ? '' : 'none';
    if(match) visible++;
  });
  document.getElementById('mn-cargo-count').textContent = visible+' de '+MN_CARGOS.length+' cargos';
}
function abrirCargoDoManual(key){
  switchManualTab('cargos');
  const search = document.getElementById('mn-cargo-search');
  search.value='';
  filterCargos('');
  document.querySelectorAll('#mn-cargo-list .mn-cargo-card').forEach(el=>el.classList.remove('open'));
  const el = document.getElementById('mn-cargo-'+key);
  if(el){
    el.classList.add('open');
    setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}), 80);
  }
}

/** Avatar de quem ocupa o cargo, quando já houver alguém definido. */
function mnQuemHTML(key, rotulo){
  const gente = key ? mnOcupantes(key) : [];
  const p = gente[0];
  const av = p
    ? (mnMostrarFotos && p.foto
        ? '<img class="av" src="'+kbEsc(p.foto)+'" alt="">'
        : '<span class="av">'+(mnIniciais(p.nome)||'?')+'</span>')
    : '<span class="av"><i class="fa-solid fa-user" style="font-size:.5rem"></i></span>';
  const extra = gente.length > 1 ? ' +'+(gente.length-1) : '';
  return '<span class="mn-quem">'+av+kbEsc(rotulo)+extra+'</span>';
}
function mnStatusHTML(status){
  if(!status) return '';
  const c = MN_CORES_STATUS[status] || {bg:'#f1f5f9', cor:'#475569'};
  return '<span class="mn-status-os" style="background:'+c.bg+';color:'+c.cor+';">'+kbEsc(status)+'</span>';
}
function mnEtapaHTML(e){
  const cls = 'mn-etapa'+(e.marco?' marco':'')+(e.key?'':' sem-link');
  const onclick = e.key ? ' onclick="abrirCargoDoManual(\''+e.key+'\')"' : '';
  const nota = e.alerta
    ? '<div class="mn-etapa-nota alerta"><i class="fa-solid fa-triangle-exclamation"></i> '+kbEsc(e.alerta)+'</div>'
    : (e.nota ? '<div class="mn-etapa-nota">'+kbEsc(e.nota)+'</div>' : '');
  return '<div class="'+cls+'" data-resp="'+kbEsc(e.key||'')+'"'+onclick+'>'
    +'<div class="mn-etapa-topo"><div class="mn-etapa-txt">'
      +'<div class="mn-etapa-titulo">'+kbEsc(e.etapa)+'</div>'
      +'<div class="mn-etapa-meta">'+mnQuemHTML(e.key, e.resp)+mnStatusHTML(e.status)+'</div>'
      +nota
    +'</div></div></div>';
}

function renderProcesso(){
  let html = '';

  // Filtros por status: ajudam a enxergar onde cada fase da OS acontece.
  html += '<div class="mn-proc-legenda">'
    + '<button class="mn-proc-filtro on" data-st="" onclick="filtrarProcesso(\'\')">Todas as etapas</button>'
    + Object.keys(MN_CORES_STATUS).map(st=>{
        const c = MN_CORES_STATUS[st];
        return '<button class="mn-proc-filtro" data-st="'+kbEsc(st)+'" onclick="filtrarProcesso(\''+kbEsc(st)+'\')">'
          +'<span class="bolinha" style="background:'+c.cor+'"></span>'+kbEsc(st)+'</button>';
      }).join('')
    + '</div>';

  MN_FASES.forEach((fase,i)=>{
    html += '<div class="mn-fase" data-fase="'+i+'">'
      +'<div class="mn-fase-cab">'
        +'<div class="mn-fase-num" style="background:'+fase.cor+'">'+(i+1)+'</div>'
        +'<div><div class="mn-fase-nome">'+kbEsc(fase.nome)+'</div>'
        +'<div class="mn-fase-desc">'+kbEsc(fase.desc)+'</div></div>'
        +'<div class="mn-fase-linha" style="background:'+fase.cor+'"></div>'
      +'</div>'
      +'<div class="mn-etapas">'+fase.etapas.map(mnEtapaHTML).join('')+'</div>'
    +'</div>';
  });

  html += '<div class="mn-bifurca">'
    +'<div class="mn-bifurca-cab"><i class="fa-solid fa-code-branch"></i> '+kbEsc(MN_BIFURCACAO.titulo)+'</div>'
    +'<div class="mn-caminhos">'
    + MN_BIFURCACAO.caminhos.map(c=>
        '<div class="mn-caminho">'
        +'<h5><i class="fa-solid '+c.icone+'" style="color:#4f46e5"></i> '+kbEsc(c.titulo)+'</h5>'
        +'<span class="quando">'+kbEsc(c.quando)+'</span>'
        +'<div class="mn-etapas">'+c.etapas.map(mnEtapaHTML).join('')+'</div>'
        +'</div>').join('')
    +'</div></div>';

  html += '<div class="mn-converge">os dois caminhos terminam no mesmo lugar</div>';
  html += '<div class="mn-etapas">'+mnEtapaHTML(MN_PROCESSO_FINAL)+'</div>';

  document.getElementById('mn-flow').innerHTML = html;
}

function filtrarProcesso(status){
  document.querySelectorAll('#mn-flow .mn-proc-filtro')
    .forEach(b=>b.classList.toggle('on', b.dataset.st===status));
  document.querySelectorAll('#mn-flow .mn-etapa').forEach(el=>{
    const badge = el.querySelector('.mn-status-os');
    const bate = !status || (badge && badge.textContent.trim()===status);
    el.style.opacity = bate ? '' : '.28';
  });
}

function mnRegraBodyHTML(blocks){
  return blocks.map(b=>{
    if(b.note) return '<div class="destaque">'+b.note+'</div>';
    if(b.ul) return (b.label?'<p><b>'+b.label+'</b></p>':'')+'<ul>'+b.ul.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
    if(b.p) return '<p>'+b.p+'</p>';
    return '';
  }).join('');
}
// A numeração é calculada na renderização, não fixada nos dados: o documento
// original começa no 6 porque os itens 1-5 são a parte institucional, que aqui
// virou aba própria. Assim também não quebra ao incluir ou remover itens.
function mnNumerarRegras(){
  let n = 0;
  MN_REGRAS.forEach(g=>g.itens.forEach(it=>{ it._n = ++n; }));
}
function renderRegras(){
  mnNumerarRegras();
  let navHtml = '';
  MN_REGRAS.forEach(group=>{
    navHtml += '<div class="mn-regras-group-label">'+kbEsc(group.grupo)+'</div>';
    group.itens.forEach(it=>{
      navHtml += '<button class="mn-regras-link" id="mn-regra-nav-'+it.id+'" onclick="selecionarRegra(\''+it.id+'\')">'+it._n+'. '+kbEsc(it.titulo)+'</button>';
    });
  });
  document.getElementById('mn-regras-nav').innerHTML = navHtml;
  selecionarRegra(MN_REGRAS[0].itens[0].id);
}
function selecionarRegra(id){
  let found=null;
  MN_REGRAS.forEach(g=>g.itens.forEach(it=>{ if(it.id===id) found=it; }));
  if(!found) return;
  document.querySelectorAll('#mn-regras-nav .mn-regras-link').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('mn-regra-nav-'+id);
  if(btn) btn.classList.add('active');
  document.getElementById('mn-regras-content').innerHTML = '<h3><span>'+(found._n||'')+'.</span> '+kbEsc(found.titulo)+'</h3>'+mnRegraBodyHTML(found.body);
}
