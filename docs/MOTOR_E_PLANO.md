# Motor de treinamento e plano de preparação

O motor (`src/core/engine.ts`) e o planejador (`src/core/planner.ts`) são funções puras,
determinísticas e independentes da interface: os mesmos registros e a mesma data geram sempre as
mesmas avaliações, recomendações e plano. Não há sorteio nem "IA" externa. Ambos têm testes
unitários (`tests/unit/engine.test.ts`, `tests/unit/planner.test.ts`).

## 1. Dados de entrada

Cada treino salvo vira uma **sessão** e um ou mais **resultados**. Um resultado registra:
fundamento, origem, tentativas, acertos, dificuldade, data, tempos de resposta (quando medidos),
marcas de erro (por exemplo, "pé duro") e, na autoavaliação, uma nota de 1 a 5. A sessão guarda
também esforço percebido (0–10) e desconforto (nenhum, leve, moderado, forte), quando
informados.

### Origem e peso de cada resultado

Uma avaliação manual não vale o mesmo que uma medição automática. Cada origem tem um canal e um
peso (`src/core/skills.ts`):

| Origem              | Tipo mostrado ao jogador                  | Canal         | Peso                                                           |
| ------------------- | ----------------------------------------- | ------------- | -------------------------------------------------------------- |
| Simulador           | Métrica calculada (cenário virtual)       | simulado      | 1,0                                                            |
| Cenários de leitura | Métrica calculada (respostas a situações) | simulado      | 0,8                                                            |
| Contagem manual     | Avaliação manual (você contou os acertos) | real          | 0,85                                                           |
| Observação de vídeo | Avaliação manual (observação guiada)      | real          | 0,6                                                            |
| Câmera (movimento)  | Métrica calculada (detecção de movimento) | real          | 0,9                                                            |
| Pose (experimental) | Inferência automática experimental        | real          | 0,4 (reservado; hoje a pose não gera resultados de habilidade) |
| Autoavaliação       | Avaliação manual (sua opinião)            | autoavaliação | peso fixo baixo                                                |

## 2. Estimativa por fundamento

Para cada fundamento e cada canal (real e simulado):

1. Peso de cada resultado = peso da origem × decaimento por idade (meia-vida de **14 dias**).
2. Taxa estimada = (acertos ponderados + 1) ÷ (tentativas ponderadas + 2) — suavização
   Beta(1,1), que evita conclusões extremas com poucas tentativas (1 acerto em 1 não vira 100 %).
3. A estimativa combinada mistura os canais com pesos real 1,0, simulado 0,6 e autoavaliação
   0,3, cada um multiplicado pela confiança do canal (tentativas efetivas ÷ 10, no máximo 1).

**Status:** _pendente_ (nenhum dado — o aplicativo mostra "Pendente" em vez de inventar uma nota),
_insuficiente_ (menos de 8 tentativas efetivas medidas) ou _avaliado_.
**Nível:** baixo (< 50 %), médio (50–75 %), alto (≥ 75 %).
**Tendência:** compara a última sessão (≥ 5 tentativas) com a média das anteriores
(± 15 pontos = melhorando/piorando; precisa de 3 sessões).
**Inconsistência:** sessões recentes do mesmo canal que variam 35 pontos ou mais.
**Erro mais frequente:** marca de erro registrada ao menos 2 vezes nos últimos 21 dias.

O jogador vê os números brutos ao lado da estimativa, por exemplo:
"Execução real: 8/10 acertos · estimativa 74 % (Contagem manual: 10)".

## 3. Recomendações (regras explícitas, sempre com o motivo)

Em ordem de verificação, para cada fundamento medido por acerto:

| Situação                                            | Recomendação                             | Motivo exibido (exemplo)                                        |
| --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Sem dados                                           | Avaliar (fazer o teste de linha de base) | "Ainda não há nenhum resultado…"                                |
| Poucos dados                                        | Medir de novo                            | "Só 6 tentativas medidas até agora — pouco para concluir algo." |
| Resultados inconsistentes                           | Medir de novo                            | "Resultados variaram muito entre sessões (90 %, 40 %)…"         |
| ≥ 80 % sustentado (2+ sessões boas, 15+ tentativas) | Subir o nível                            | "Bom desempenho sustentado… Aumente a dificuldade aos poucos."  |
| Nível baixo                                         | Treinar em dificuldade menor             | "Precisa de atenção: execução real 3/10…"                       |
| Nível médio / alto                                  | Treinar / manter                         | "Em desenvolvimento…" / "Nível bom…"                            |

Complementos: diferença grande entre simulador e execução real (≥ 25 pontos), erro mais
frequente (usado para escolher exercícios que o corrigem), tendência, fundamentos marcados como
foco no perfil (+ prioridade) e fundamentos importantes para a posição.

**Bem-estar vem antes de tudo:** desconforto forte nos últimos 2 dias → descanso hoje (com
orientação de procurar um adulto responsável / profissional de saúde se a dor continuar);
desconforto moderado, esforço ≥ 8 no último dia ou três dias seguidos de esforço ≥ 7 → sessão leve.

## 4. Simuladores: pontuação e dificuldade

- Cada rodada é avaliada pela geometria do cenário (`src/core/sim/*.ts`): trajetória e alcance
  dos adversários no passe, espaço ganho no domínio orientado, informação escondida em "olhe
  antes de receber", opções de passe/condução/proteção na decisão rápida, tempo e lado na
  reação, canto, goleiro e bloqueio na finalização. As regras aparecem na própria tela.
- Cenários são gerados por uma semente (`?semente=N` reproduz exatamente o mesmo cenário).
- Rodadas "antes do sinal" são repetidas e não contam; rodadas sem resposta contam como
  incompletas.
- Progressão (`src/core/scoring.ts`): com pelo menos 8 tentativas, ≥ 80 % de acerto sobe um nível
  e < 40 % desce um nível (níveis 1 a 5).

## 5. Plano até a competição

As datas são calculadas a partir da **data local do aparelho** em cada abertura; a aritmética
usa dias UTC (sem horário de verão), então o plano não "pula" dias por causa de fuso. A
competição padrão é o interclasse de **20/10/2026** e pode ser trocada em Plano.

| Dias até o evento                                                   | Fase                                                                                                   | Intensidade |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| 0                                                                   | Dia da competição: rotina pré-jogo, aquecimento de jogo, respiração, hidratação. **Sem treino extra.** | leve        |
| 1                                                                   | Véspera: familiarização leve (poucas repetições fáceis), visualização, revisar a rotina                | leve        |
| 2                                                                   | Recuperação ativa (mobilidade, leitura de jogo sem impacto, respiração)                                | leve        |
| 4, 8, 12…                                                           | Recuperação ativa (um dia leve a cada três de desenvolvimento)                                         | leve        |
| hoje, se faltam testes de base (≥ 3 fundamentos centrais pendentes) | Avaliação inicial (testes de linha de base)                                                            | moderada    |
| demais dias                                                         | Desenvolvimento: técnica prioritária pelo motor + leitura de jogo + físico moderado                    | moderada    |

- O tempo de cada dia respeita o tempo disponível do perfil (padrão 20 min; dias leves ≈ 60 %).
- Se hoje o bem-estar pede descanso ou sessão leve, o plano de hoje muda automaticamente.
- Competição a mais de 21 dias: mostra as próximas duas semanas.
- **Evento que já passou:** o aplicativo avisa que a data passou, não mostra datas antigas como
  futuras e oferece configurar a próxima competição; enquanto isso, segue um plano de manutenção
  semanal (domingo descanso, quarta recuperação).

Exemplo verificado por teste (abertura em 14/10/2026, sem dados): 14/10 avaliação inicial,
15/10 desenvolvimento, 16/10 recuperação, 17/10 desenvolvimento, 18/10 recuperação,
19/10 véspera, 20/10 competição.

O plano nunca promete transformações em poucos dias: a prioridade antes da competição é técnica,
familiarização, confiança e recuperação.
