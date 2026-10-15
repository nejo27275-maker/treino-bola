# Testes: o que foi executado, resultados e limitações

Classificação usada (como pedido no projeto):

- **PASSOU** — o teste foi executado e aprovado.
- **FALHOU** — o teste foi executado e encontrou um problema.
- **NÃO EXECUTADO** — o teste não pôde ser realizado neste ambiente.
- **EXIGE DISPOSITIVO REAL** — requer validação em um celular ou câmera física.

Um teste com câmera falsa não comprova o funcionamento de uma câmera física; um build bem-sucedido
não comprova que todas as interações funcionam; e uma biblioteca simulada não comprova a qualidade
de um detector real. Por isso essas situações aparecem separadas abaixo.

## Como rodar

```bash
npm install            # só ferramentas de desenvolvimento (precisa de internet)
npm run typecheck      # TypeScript do app e dos testes
npm run lint           # ESLint (scripts JavaScript)
npm run format:check   # Prettier
npm test               # testes unitários (node --test)
npm run build          # build de produção em dist/
npm run test:e2e       # Playwright + Chromium (faz o build e sobe um servidor em 127.0.0.1:4321)
npm run check          # tudo acima, em sequência
```

No primeiro uso do Playwright fora deste ambiente: `npx playwright install chromium`.

## Ambiente da última execução

- Node 22.22, TypeScript 6.0.2, ESLint 10.1.0, Prettier 3.8.1, Playwright 1.56.1.
- Chromium headless 141 (do Playwright), tela de 360 × 740 px, idioma pt-BR, fuso
  America/Sao_Paulo, data fixada em **14/10/2026 12:00** nos testes de interface.
- O app é servido em `/treino-bola/` (como no GitHub Pages) para garantir caminhos relativos.

## Resumo

| Verificação                                                     | Resultado                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                                             | PASSOU (sem erros)                                                                        |
| `npm run lint`                                                  | PASSOU (sem avisos)                                                                       |
| `npm run format:check`                                          | PASSOU                                                                                    |
| `npm test` — 126 testes unitários                               | **126 PASSOU, 0 FALHOU**                                                                  |
| `npm run build`                                                 | PASSOU — 73 arquivos pré-armazenados (~580 KB); dois builds seguidos geram a mesma versão |
| `npx playwright test` — 65 testes de ponta a ponta (5 projetos) | **65 PASSOU, 0 FALHOU**                                                                   |

Observação honesta sobre estabilidade: em uma execução completa anterior, o teste
"cena parada: calibra, mede tentativas…" (câmera falsa) estourou o tempo uma vez com os 3
processos em paralelo; ele passou isolado e nas execuções completas seguintes. É sensível a
carga de CPU (mede tempos reais). Se acontecer no seu computador, rode
`npx playwright test --project=camera-parada`.

## Itens obrigatórios do projeto × status

| #   | Item pedido                       | Como foi verificado                                                                                                           | Status                                                              |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Verificação de tipos              | `npm run typecheck`                                                                                                           | PASSOU                                                              |
| 2   | Lint                              | `npm run lint`                                                                                                                | PASSOU                                                              |
| 3   | Motor de pontuação                | `tests/unit/engine.test.ts` (pesos, recência, inconsistência, tendência, recomendações, bem-estar, progressão)                | PASSOU                                                              |
| 4   | Estado e regras do simulador      | `tests/unit/simulators.test.ts` (6 modos) + `tests/e2e/simulators.spec.ts`                                                    | PASSOU                                                              |
| 5   | Planejador adaptativo             | `tests/unit/planner.test.ts` + `tests/e2e/profile-plan.spec.ts`                                                               | PASSOU                                                              |
| 6   | Persistência                      | `tests/unit/storage.test.ts` + `tests/e2e/data.spec.ts` (recarregar a página)                                                 | PASSOU                                                              |
| 7   | Exportação, importação e exclusão | `tests/unit/storage.test.ts`, `validation.test.ts`, `tests/e2e/data.spec.ts` (inclui arquivo hostil)                          | PASSOU                                                              |
| 8   | Registro de sessões               | `tests/unit/storage.test.ts` ("registro de sessões") + fluxos E2E                                                             | PASSOU                                                              |
| 9   | Calendário e mudanças de data     | `tests/unit/dates.test.ts` (fusos, horário de verão) + E2E abrindo em 19/10, 20/10 e 22/10                                    | PASSOU                                                              |
| 10  | Seleção e reprodução de vídeos    | `tests/e2e/video.spec.ts` (WebM sintético)                                                                                    | PASSOU · MP4/H.264 e vídeos do celular: EXIGE DISPOSITIVO REAL      |
| 11  | Permissões da câmera e erros      | `tests/e2e/camera.spec.ts` (câmera falsa, negação real pelo navegador, HTTPS ausente simulado)                                | PASSOU · câmera física: EXIGE DISPOSITIVO REAL                      |
| 12  | Estados vazios e falhas           | E2E: armazenamento indisponível, rota inexistente, vídeo inválido/corrompido, biblioteca de pose ausente, importação inválida | PASSOU                                                              |
| 13  | Build de produção                 | `npm run build`                                                                                                               | PASSOU                                                              |
| 14  | Interface e navegação             | `tests/e2e/navigation.spec.ts` (todas as telas, 360 px, sem erros/CSP) + `a11y.spec.ts`                                       | PASSOU                                                              |
| 15  | Carregamento offline              | `tests/e2e/offline.spec.ts` (service worker real, rede desligada, atualização)                                                | PASSOU                                                              |
| 16  | Integração de visão computacional | Movimento: unitários + câmera falsa + vídeo sintético (PASSOU). Pose: biblioteca **simulada** (PASSOU)                        | Detecção de pose real: NÃO EXECUTADO (biblioteca indisponível aqui) |

## NÃO EXECUTADO e EXIGE DISPOSITIVO REAL

| Item                                                                        | Status                 | Motivo / como validar                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Uso em celular Android (Chrome), toque real, desempenho em aparelho modesto | EXIGE DISPOSITIVO REAL | Publicar em HTTPS e abrir no celular; conferir fluidez dos simuladores e da câmera a 5–15 análises/s.                                        |
| Câmera física (frontal/traseira, permissões do Android, luz e fundo reais)  | EXIGE DISPOSITIVO REAL | Seguir [CAMERA_E_HTTPS.md](CAMERA_E_HTTPS.md).                                                                                               |
| Reação com movimento de uma pessoa de verdade                               | EXIGE DISPOSITIVO REAL | Testada só com quadros sintéticos (bloco piscando, cena parada, animação da câmera falsa).                                                   |
| Vídeos MP4/H.264 e HEVC gravados no celular                                 | EXIGE DISPOSITIVO REAL | O Chromium dos testes não decodifica H.264 (verificado: `canPlayType` vazio); o Chrome do Android decodifica.                                |
| Estimativa de pose com o MediaPipe real (qualidade, GPU/CPU, velocidade)    | NÃO EXECUTADO          | Sem acesso ao npm/armazenamento do modelo neste ambiente. Validar com `npm run pose:prepare` (com internet) em um aparelho.                  |
| Instalação da PWA ("Adicionar à tela inicial")                              | EXIGE DISPOSITIVO REAL | O manifesto e o service worker foram testados; o prompt de instalação depende do Chrome do aparelho.                                         |
| Leitor de tela (TalkBack)                                                   | NÃO EXECUTADO          | Verificados nomes acessíveis, foco, regiões de status e contraste de forma automatizada; a experiência com TalkBack precisa de teste manual. |
| Publicação no GitHub Pages e workflows em `.github/workflows/`              | NÃO EXECUTADO          | Os workflows estão prontos, mas não foram rodados (precisam ser habilitados no repositório).                                                 |
| Lighthouse / auditoria de PWA                                               | NÃO EXECUTADO          | Ferramenta não disponível offline neste ambiente.                                                                                            |

## O que os testes de câmera e vídeo usam (e o que isso prova)

- **Câmera falsa do Chromium** com três fontes: vídeo Y4M parado (calibração passa e nenhuma
  tentativa tem movimento), Y4M com um bloco piscando só na metade esquerda (prova que o lado
  detectado vem dos quadros e respeita o espelhamento) e a animação padrão (cena agitada é
  recusada na calibração). Prova o fluxo do app e o processamento real de quadros; **não**
  prova a qualidade com uma pessoa na frente de uma câmera física.
- **Permissão negada** pela interface falsa do navegador (`--use-fake-ui-for-media-stream=deny`):
  o `getUserMedia` real falha com `NotAllowedError`.
- **Vídeo WebM sintético** gerado no início dos testes (`tests/e2e/global-setup.ts`) com
  movimento em trechos conhecidos (≈1,5–2,5 s e ≈3,5–4,2 s): o mapa de movimento encontra picos
  nesses trechos.
- **Pose**: `tests/e2e/pose.spec.ts` substitui o pacote do MediaPipe por um módulo que imita a
  API e devolve 33 pontos conhecidos. Prova carregamento, queda de GPU para CPU, desenho,
  cálculo das métricas, marcação de confiança insuficiente, salvamento e tratamento de falhas —
  **não** a detecção real.

## Testes de ponta a ponta (65) — todos PASSOU na última execução

#### `tests/e2e/a11y.spec.ts` (9)

| Teste                                                                               | Projeto | Status |
| ----------------------------------------------------------------------------------- | ------- | ------ |
| sessão de exercício: o foco acompanha cada fase (não volta ao topo da página)       | app     | PASSOU |
| treino físico: pular um bloco mantém o foco no controle e anuncia o novo bloco      | app     | PASSOU |
| abas do histórico: setas, Home e End trocam de aba sem perder o foco                | app     | PASSOU |
| abas da câmera: ativar uma aba mantém o foco nela                                   | app     | PASSOU |
| diálogo: foco preso em todos os controles, fundo inerte, Esc fecha e devolve o foco | app     | PASSOU |
| rótulos que abrem seletores de arquivo mostram o foco do teclado                    | app     | PASSOU |
| contraste: texto dos botões principais e da aba atual nos dois temas                | app     | PASSOU |
| zoom de 200% (180 px de largura): nenhuma tela rola para o lado nem corta controles | app     | PASSOU |
| simuladores: descrição da cena em texto, sem revelar o que está escondido           | app     | PASSOU |

#### `tests/e2e/data.spec.ts` (4)

| Teste                                                                     | Projeto | Status |
| ------------------------------------------------------------------------- | ------- | ------ |
| dados persistem após recarregar; exportar, apagar e importar de volta     | app     | PASSOU |
| importar mesclando não duplica registros                                  | app     | PASSOU |
| arquivos inválidos são recusados com mensagem clara e nada é executado    | app     | PASSOU |
| armazenamento indisponível: o app avisa e continua funcionando em memória | app     | PASSOU |

#### `tests/e2e/history.spec.ts` (3)

| Teste                                                                                      | Projeto | Status |
| ------------------------------------------------------------------------------------------ | ------- | ------ |
| evolução: a legenda só lista séries com pontos; com uma série, o título a nomeia           | app     | PASSOU |
| dica do gráfico fica ao lado da mira (não cobre o ponto) e vai para baixo em tela estreita | app     | PASSOU |
| abas do histórico: todas visíveis na largura do celular (quebram linha, não somem)         | app     | PASSOU |

#### `tests/e2e/navigation.spec.ts` (6)

| Teste                                                                      | Projeto | Status |
| -------------------------------------------------------------------------- | ------- | ------ |
| todas as seções abrem, sem erros e sem rolagem horizontal em 360 px        | app     | PASSOU |
| barra de navegação inferior leva às seções principais e marca a atual      | app     | PASSOU |
| endereço inexistente mostra página de erro com caminho de volta            | app     | PASSOU |
| acessibilidade básica: rótulos, nomes acessíveis, idioma e link para pular | app     | PASSOU |
| teclado: link para pular ao conteúdo e foco no título ao trocar de tela    | app     | PASSOU |
| alvos de toque têm pelo menos 40 px de altura                              | app     | PASSOU |

#### `tests/e2e/offline.spec.ts` (2)

| Teste                                                                                                  | Projeto | Status |
| ------------------------------------------------------------------------------------------------------ | ------- | ------ |
| offline: depois da primeira visita o app abre, navega e salva sem internet                             | app     | PASSOU |
| atualização do aplicativo — nova versão publicada: aviso, atualização a pedido e cache antigo removido | app     | PASSOU |

#### `tests/e2e/pose.spec.ts` (4)

| Teste                                                                                 | Projeto | Status |
| ------------------------------------------------------------------------------------- | ------- | ------ |
| pose (biblioteca simulada): GPU→CPU, métricas com confiança, esqueleto e resumo salvo | app     | PASSOU |
| pose: biblioteca ausente ou quebrada mostra erro claro e a avaliação guiada continua  | app     | PASSOU |
| pose: sem os arquivos instalados, a tela informa e não oferece a análise              | app     | PASSOU |
| pose: guardar o detector para uso offline só confirma quando todos os arquivos vieram | app     | PASSOU |

#### `tests/e2e/profile-plan.spec.ts` (6)

| Teste                                                                        | Projeto | Status |
| ---------------------------------------------------------------------------- | ------- | ------ |
| perfil opcional: salvar, persistir após recarregar, editar e apagar          | app     | PASSOU |
| pular a configuração esconde as boas-vindas                                  | app     | PASSOU |
| plano de 14/10/2026: sete dias até o interclasse de terça, 20/10             | app     | PASSOU |
| aberto na véspera e no dia do evento, o plano se ajusta à data real          | app     | PASSOU |
| depois do evento: avisa que passou e permite configurar a próxima competição | app     | PASSOU |
| data inválida da competição é recusada com mensagem clara                    | app     | PASSOU |

#### `tests/e2e/simulators.spec.ts` (12)

| Teste                                                                                      | Projeto | Status |
| ------------------------------------------------------------------------------------------ | ------- | ------ |
| A — passe pela brecha: mirar no colega livre com a força certa é acerto                    | app     | PASSOU |
| B — domínio orientado: a melhor direção calculada é aceita pela interface                  | app     | PASSOU |
| B — sem resposta a tempo, a rodada termina como incompleta                                 | app     | PASSOU |
| C — olhe antes de receber: esconde o que está às costas e avalia a leitura                 | app     | PASSOU |
| D — decisão rápida: sessão completa de 10 rodadas, salva e sobe de nível                   | app     | PASSOU |
| E — reação à pressão: responder certo após o sinal mede o tempo; antes do sinal é repetido | app     | PASSOU |
| E — teclado: setas respondem à reação                                                      | app     | PASSOU |
| F — finalização: chute no canto livre é gol; fora da baliza é "Para fora"                  | app     | PASSOU |
| teclado: Enter ativa o botão focado (não passa a bola) e os atalhos param no fim da rodada | app     | PASSOU |
| toque: arrastar o dedo sobre a baliza (rolar a página) não chuta; tocar chuta              | app     | PASSOU |
| mesma semente reproduz exatamente o mesmo cenário; outra semente muda                      | app     | PASSOU |
| encerrar a sessão antes do fim salva as rodadas jogadas                                    | app     | PASSOU |

#### `tests/e2e/training.spec.ts` (6)

| Teste                                                                                | Projeto | Status |
| ------------------------------------------------------------------------------------ | ------- | ------ |
| teste de linha de base: contar 10 tentativas, desfazer, salvar e alimentar o motor   | app     | PASSOU |
| sair no meio de uma sessão com tentativas pede confirmação                           | app     | PASSOU |
| biblioteca filtra por fundamento e mostra os 10 itens do exercício                   | app     | PASSOU |
| treino físico guiado: checagem de segurança, parar por desconforto e plano mais leve | app     | PASSOU |
| leitura de jogo: explica todas as opções e registra o resultado                      | app     | PASSOU |
| preparação mental: rotina editável persiste e atividade é registrada                 | app     | PASSOU |

#### `tests/e2e/video.spec.ts` (4)

| Teste                                                                               | Projeto | Status |
| ----------------------------------------------------------------------------------- | ------- | ------ |
| vídeo: abrir, reproduzir, pausar, navegar quadro a quadro e pela linha do tempo     | app     | PASSOU |
| vídeo: marcar momentos, capturar quadro, mapa de movimento e avaliação guiada salva | app     | PASSOU |
| vídeo: arquivo que não é vídeo e vídeo corrompido mostram mensagens claras          | app     | PASSOU |
| vídeo: sair com avaliação não salva pede confirmação e libera o vídeo               | app     | PASSOU |

#### `tests/e2e/camera.spec.ts` (9)

| Teste                                                                                       | Projeto              | Status |
| ------------------------------------------------------------------------------------------- | -------------------- | ------ |
| @parada ligar e desligar libera todas as faixas e mostra o indicador                        | camera-parada        | PASSOU |
| @parada sair da tela com a câmera ligada encerra a câmera                                   | camera-parada        | PASSOU |
| @parada cena parada: calibra, mede tentativas sem movimento e salva a série                 | camera-parada        | PASSOU |
| @parada desligar a câmera no meio da série encerra a série: nada é salvo sozinho            | camera-parada        | PASSOU |
| @parada treino livre: a câmera é só espelho e a contagem manual é salva                     | camera-parada        | PASSOU |
| @movimento o lado do movimento vem dos quadros reais e respeita o espelhamento              | camera-movimento     | PASSOU |
| @padrao quadros reais da câmera passam pelo detector; cena agitada é recusada na calibração | camera-padrao        | PASSOU |
| @negada permissão negada mostra como liberar a câmera                                       | camera-sem-permissao | PASSOU |
| @negada sem HTTPS a tela explica o requisito (contexto inseguro simulado)                   | camera-sem-permissao | PASSOU |

## Testes unitários (126) — todos PASSOU na última execução

**biblioteca de exercícios técnicos** (7) — PASSOU

- identificadores únicos e fundamentos válidos
- cada exercício informa os 10 itens obrigatórios
- exercícios que exigem cones, parede ou parceiro oferecem alternativa
- testes de linha de base: 10 tentativas, um por fundamento técnico medido
- cobre os 12 temas pedidos, cada um com um exercício próprio
- todo fundamento técnico tem exercício e os rótulos de erro existem
- a escolha respeita materiais e espaço disponíveis

**treinos físicos** (2) — PASSOU

- todos os tipos usados pelo planejador existem
- sem esforço máximo e com orientações de recuperação

**leitura de jogo e preparação mental** (3) — PASSOU

- cada cenário tem uma única resposta certa e explicação para todas
- atividades mentais de todos os tipos
- critérios de vídeo cobrem a avaliação guiada

**datas de calendário** (8) — PASSOU

- valida datas reais e rejeita inválidas
- 14/10/2026 é quarta-feira e o interclasse (20/10/2026) é terça-feira
- aritmética atravessa meses, anos e anos bissextos
- rótulos relativos
- data local usa o fuso do aparelho, não UTC
- hora local de um instante salvo em UTC (rótulos do histórico)
- aritmética não é afetada por horário de verão
- localDate formata com zeros à esquerda

**motor adaptativo — avaliação de fundamentos** (9) — PASSOU

- sem nenhum dado o fundamento fica pendente (sem nota inventada)
- poucas tentativas = dados insuficientes
- taxa ponderada e nível a partir de dados reais
- várias sessões no mesmo dia: a tendência segue o horário, não o id
- autoavaliação sozinha não vira medição
- origem pesa: observação de vídeo vale menos que contagem manual
- resultados antigos pesam menos (meia-vida de 14 dias)
- detecta resultados inconsistentes entre sessões
- erro mais frequente é identificado

**motor adaptativo — recomendações explicáveis** (6) — PASSOU

- dificuldade recorrente no primeiro toque gera recomendação de treino com motivo
- bom desempenho sustentado sugere progredir de nível
- resultados inconsistentes pedem nova medição antes de concluir
- foco do perfil aumenta a prioridade e é explicado
- simulação boa e execução real fraca: prioriza técnica e explica a diferença
- recomendações são determinísticas

**bem-estar e fadiga** (3) — PASSOU

- desconforto forte recomenda descanso
- esforço muito alto ontem pede sessão leve
- registros antigos não geram alerta

**pontuação e dificuldade progressiva** (3) — PASSOU

- resumo ignora rodadas antecipadas
- sobe com ≥80%, desce com <40%, mantém com poucas tentativas
- nível salvo só muda na direção que a sessão comprova

**planejador até o interclasse** (18) — PASSOU

- de 14/10/2026 até 20/10/2026: 7 dias, terminando no dia do evento
- sem dados, hoje é dia de avaliação inicial com testes
- dia do evento: rotina, aquecimento e hidratação, sem treino técnico ou físico extra
- véspera leve e recuperação dois dias antes
- com pouco tempo, a véspera corta a visualização e, se preciso, indica a rotina para a noite
- atividades guiadas usam a duração real e nunca são encurtadas
- dia de avaliação não repete o mesmo teste e prioriza os focos
- não prescreve treino intenso todos os dias
- respeita o tempo disponível do perfil
- prioriza o fundamento mais fraco nos dias de desenvolvimento
- o plano não muda de fase só porque o app foi aberto outro dia
- aberto na véspera: só véspera e evento
- aberto no dia do evento: só o dia da competição
- evento já passou: datas antigas não aparecem como futuras
- competição distante: mostra duas semanas
- desconforto forte: hoje vira descanso; esforço alto: hoje fica leve
- funciona sem perfil e sem competição
- marca sessões já registradas no dia

**(teste avulso)** (1) — PASSOU

- no dia da competição o aquecimento não é encurtado pelo limite de tempo

**gerador pseudoaleatório** (4) — PASSOU

- mesma semente gera a mesma sequência
- sementes diferentes geram sequências diferentes e valores em [0,1)
- int é inclusivo e shuffle preserva os elementos
- hashSeed é estável e sensível à ordem

**geometria** (4) — PASSOU

- distância de ponto a segmento
- entrada do segmento no círculo
- adversário atrás da origem não bloqueia o corredor
- ângulos e elipse

**mira do passe** (1) — PASSOU

- pontos atrás do passador vão para o lado mais próximo

**Modo A — passe pela brecha** (6) — PASSOU

- passe pelo corredor bloqueado é interceptado
- passe pelo corredor livre com força certa é acerto
- força insuficiente, força demais e direção errada são diferenciadas
- bola que sai do campo é "fora"
- cenários gerados são determinísticos e sempre têm um corredor livre
- a partir do nível 2 há pelo menos um colega com corredor bloqueado

**Modo B — domínio orientado** (5) — PASSOU

- com pressão pela esquerda, orientar para a direita é o melhor
- sem resposta é tempo esgotado (incompleto)
- perto da lateral, a opção que sai do campo é inválida
- responder mais rápido dá mais pontos
- cenários gerados têm melhor opção clara e são reproduzíveis

**Modo C — olhe antes de receber** (5) — PASSOU

- sem adversário perto às costas, girar é o melhor
- com marcador colado e colega livre ao lado, tocar para o lado é o melhor
- com marcador colado e sem colega livre, proteger ou devolver são aceitos
- o que está às costas é escondido na fase de decisão
- cenários gerados: resposta calculada coerente com o tipo e variedade de respostas

**Modo D — decisão rápida** (2) — PASSOU

- espaço à frente → conduzir; colega livre e frente fechada → passar; pressão → proteger
- gerador produz as três respostas e uma única opção aceita

**Modo E — reação à pressão** (3) — PASSOU

- regra: fugir para o lado oposto; dupla → proteger
- classifica acerto, erro, tempo esgotado e antecipação
- estímulo duplo só a partir do nível 3; espera entre 1 e 2,5 s

**Modo F — finalização** (3) — PASSOU

- fora, bloqueado, defendido e gol seguem as regras explícitas
- goleiro inclinado desloca o alcance para o lado da inclinação
- tamanho da baliza depende da modalidade e sempre existe um canto livre

**coordenadas do campo** (1) — PASSOU

- atores gerados ficam dentro do campo

**descrição em texto da cena** (1) — PASSOU

- posição relativa como na tela (ataque para cima)

**registro de sessões** (4) — PASSOU

- exercício contado gera sessão e resultado de contagem manual
- exercício concluído sem contagem não inventa desempenho
- simulador registra semente, rodadas e tempos de resposta
- cenários, físico, autoavaliação, câmera e vídeo

**repositório local** (7) — PASSOU

- perfil, competição padrão e configurações
- sessões alimentam o histórico e o motor
- gravação é atômica: um registro inválido não grava nada
- excluir sessão remove os resultados ligados a ela
- exportar → validar → importar (substituir) preserva os dados
- importar mesclando não duplica registros
- apagar tudo deixa o aplicativo vazio

**importação de dados** (7) — PASSOU

- aceita uma exportação válida e completa níveis ausentes
- sessões longas do próprio app voltam na importação (duração limitada a 24 h)
- rejeita arquivos de outro aplicativo ou de versão futura
- ignora registros inválidos com aviso, sem derrubar o restante
- conteúdo malicioso continua sendo apenas texto e campos extras são descartados
- ids duplicados e identificadores com caracteres estranhos são rejeitados
- perfil inválido é ignorado com aviso

**detecção de movimento (diferença de quadros)** (8) — PASSOU

- converte RGBA em cinza
- quadros iguais não têm movimento; bloco que muda é medido no lado certo
- espelhamento troca esquerda e direita (jogador de frente para a câmera)
- ruído de sensor fica abaixo do limiar de pixel
- calibração define limiar acima do ruído e detecta cena ruidosa
- início do movimento exige quadros consecutivos e identifica o lado
- movimento dos dois lados é "indefinido"
- picos de movimento respeitam separação mínima

**métricas de pose** (4) — PASSOU

- ângulo articular
- tronco reto ≈ 0°, inclinado > 0°, pernas estendidas ≈ 0° de flexão
- pontos pouco visíveis tornam a métrica não confiável
- resumo de série: estabilidade do tronco

**mensagens de erro de câmera e vídeo** (1) — PASSOU

- erros conhecidos viram orientações em português

## Desempenho medido (simulação de celular modesto)

Medido com o Chromium do Playwright, tela de 360 px, **CPU 4× mais lenta** e rede **"4G ruim"**
(150 ms de latência, 1,6 Mbps), servidor local com gzip (como o GitHub Pages). Mediana de 3 a
5 execuções; scripts de medição fora do repositório (refazer com os mesmos parâmetros via CDP:
`Emulation.setCPUThrottlingRate` e `Network.emulateNetworkConditions`).

| Cenário                                                     | Antes                  | Depois                     | O que mudou                                                                               |
| ----------------------------------------------------------- | ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Primeira visita: até a tela inicial aparecer                | 2,6 s (65 requisições) | **1,7 s** (43 requisições) | Telas carregadas sob demanda, `modulepreload` dos 25 módulos iniciais, JS sem comentários |
| Primeira visita: abrir o simulador logo em seguida          | 0,08 s                 | 0,9 s                      | Custo do carregamento sob demanda…                                                        |
| Primeira visita: abrir o simulador após 3 s na tela inicial | —                      | **0,11 s**                 | …compensado pelo download das telas em segundo plano quando o app fica ocioso             |
| Segunda visita (service worker): até a tela inicial         | —                      | **0,11 s**                 | Tudo vem do cache do aparelho                                                             |
| Segunda visita: abrir a tela de vídeo                       | —                      | 0,25 s                     | —                                                                                         |
| Iniciar uma rodada do simulador                             | 0,16 s                 | 0,16 s                     | —                                                                                         |

Esses números são de uma **simulação** no computador; em um Android modesto real os tempos
podem ser diferentes (EXIGE DISPOSITIVO REAL).

## Revisões feitas além dos testes

- **Revisão de segurança** do código inteiro (importação de backups, DOM, CSP, service worker,
  scripts de build): nenhuma vulnerabilidade explorável no app. Corrigidos: links simbólicos no
  preparo do detector de pose, servidor local seguindo links para fora da pasta, cache opcional
  do detector que não se atualizava, versões não fixadas.
- **Revisão de código** (correção): 15 problemas reais corrigidos, entre eles a série de reação
  da câmera que continuava depois de desligar a câmera e salvava uma sessão falsa (há teste que
  reproduz o caso), avaliações de vídeo duplicadas, nível do simulador alterado na direção
  errada, ordem de sessões do mesmo dia e minutos do plano que não batiam com as atividades.
- **Revisão de acessibilidade** (WCAG 2.2 AA): teclado nos simuladores, foco preservado,
  abas, diálogo, contraste, zoom de 200%, erros ligados aos campos e descrição das cenas em
  texto — cobertos por `tests/e2e/a11y.spec.ts`.
