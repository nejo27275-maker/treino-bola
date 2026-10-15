# Arquitetura e decisões técnicas

## Visão geral

O Cláudio Futebol AI é um **site estático** que funciona como aplicativo (PWA) no navegador do
celular. Não há servidor de aplicação, banco remoto, conta, API de IA nem analytics: todo o
processamento acontece no aparelho e os dados ficam no IndexedDB.

```
src/
  core/       lógica pura, sem DOM (testada em Node): motor, plano, datas, simuladores,
              detecção de movimento, métricas de pose, validação de importação, registro de sessões
  content/    conteúdo: 27 exercícios técnicos, 10 treinos físicos, 5 atividades mentais,
              16 cenários de leitura de jogo, 9 critérios da avaliação de vídeo
  storage/    IndexedDB (com alternativa em memória), repositório, preferências pequenas
  media/      câmera (getUserMedia), quadros, ferramentas de vídeo, pose opcional, mensagens de erro
  ui/         roteador por hash, componentes, gráficos, telas e simuladores (SVG)
  main.ts     inicialização, service worker, conectividade, instalação
public/       index.html (CSP), manifest, ícones, CSS
scripts/      build, servidor local, dev, ícones, mídia de teste, preparo opcional da pose
tests/unit    testes do núcleo (node --test)
tests/e2e     testes de ponta a ponta (Playwright + Chromium)
```

Tamanho aproximado: ~18 mil linhas de TypeScript no aplicativo, ~3,9 mil linhas de testes;
o build tem ~580 KB pré-armazenados para uso offline (cerca de 150 KB com gzip). Só a tela
inicial e o núcleo (25 módulos) vêm no primeiro carregamento, com `modulepreload` gerado pelo
build; as outras telas são importadas quando abertas e baixadas em segundo plano quando o app
fica ocioso (respeitando a "economia de dados"). Medições em [TESTING.md](TESTING.md#desempenho-medido-simulação-de-celular-modesto).

## Decisões principais (e por quê)

| Decisão                                                                  | Motivo                                                                                                                                                                                                                                                    | Custo assumido                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **TypeScript sem framework**, compilado com `tsc` para módulos ES        | O ambiente não tinha acesso ao registro npm (Vite/React não podiam ser instalados); TypeScript, ESLint, Prettier e Playwright já estavam disponíveis. Sem framework, o app fica leve para celulares modestos e não tem dependências em tempo de execução. | Componentes e re-renderização são feitos à mão (`src/ui/dom.ts`, `components.ts`). |
| **Roteador por hash** (`#/plano`) e caminhos relativos                   | Funciona em hospedagem estática (GitHub Pages em subpasta) e offline, sem regras de servidor.                                                                                                                                                             | URLs com `#`.                                                                      |
| **DOM sem `innerHTML`** (`h()`/`s()`)                                    | Texto vindo de dados (perfil, importação, nomes de arquivo) nunca é interpretado como HTML.                                                                                                                                                               | —                                                                                  |
| **CSP restrita** no `index.html`                                         | `script-src 'self'` (+ `wasm-unsafe-eval` só para o detector opcional), `connect-src 'self'`, `object-src 'none'`, `form-action 'none'`.                                                                                                                  | Sem CDNs ou fontes remotas (é o objetivo).                                         |
| **Núcleo puro e determinístico** (`src/core`)                            | Regras testáveis em Node, resultados reproduzíveis (sementes nos simuladores), recomendações explicáveis.                                                                                                                                                 | —                                                                                  |
| **IndexedDB com transações atômicas** e alternativa em memória           | Histórico estruturado e grande; se o IndexedDB faltar (ex.: janela anônima), o app avisa e segue funcionando.                                                                                                                                             | —                                                                                  |
| **Service worker próprio** com pré-cache versionado por hash de conteúdo | Abre offline depois da primeira visita; atualização só quando o jogador pede (não interrompe treino). Build reprodutível: sem mudanças, mesma versão.                                                                                                     | Primeira visita precisa de internet.                                               |
| **Detecção de movimento por diferença de quadros** (sem modelo)          | Funciona em qualquer aparelho, offline, e é verificável (testes com câmera falsa e vídeos sintéticos).                                                                                                                                                    | Não identifica pessoas, bola ou adversários.                                       |
| **Pose (MediaPipe) opcional** e instalada no servidor                    | O modelo não pôde ser baixado aqui; o app nunca finge ter detector e funciona inteiro sem ele.                                                                                                                                                            | Integração validada só com biblioteca simulada.                                    |

## Fluxo de dados

```
Treino (exercício, simulador, leitura, físico, mental, câmera, vídeo, autoavaliação)
   │  src/core/sessionLog.ts  → TrainingSession + ResultRecord[] (com origem e confiabilidade)
   ▼
Repository (IndexedDB)  ── exportar/importar JSON validado (src/core/validation.ts)
   │
   ▼
runEngine (src/core/engine.ts)  → avaliação por fundamento + recomendações com motivos
   │
   ▼
buildPlan (src/core/planner.ts) → dias até a competição, com blocos e avisos
   │
   ▼
Telas (início, plano, avaliação, histórico) — recalculadas a cada abertura
```

Detalhes das regras do motor e do plano: [MOTOR_E_PLANO.md](MOTOR_E_PLANO.md).

## Armazenamento

Banco `claudio-futebol-ai` (versão 1), object stores:

| Store           | Chave                              | Conteúdo                                                                                |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `kv`            | `key`                              | perfil, configurações, competição, níveis dos simuladores, rotina pré-jogo, boas-vindas |
| `sessions`      | `id` (índice `date`)               | sessões de treino                                                                       |
| `results`       | `id` (índices `date`, `sessionId`) | resultados por fundamento                                                               |
| `videoAnalyses` | `id`                               | avaliações de vídeo (sem o vídeo)                                                       |
| `frames`        | `id` (índice `analysisId`)         | quadros JPEG guardados por escolha do jogador                                           |

Gravações em lote são uma única transação (tudo ou nada). Erros de cota e de indisponibilidade
viram mensagens em português (`friendlyStorageError`).

## Telas e recursos de interface

- Navegação inferior fixa (Início, Treinar, Simular, Plano, Mais) e link "Pular para o conteúdo".
- Ao trocar de tela, o foco vai para o título; nas trocas de fase dentro de uma tela (série,
  descanso, rodada), o foco é preservado (`replaceKeepingFocus`) e mudanças automáticas são
  anunciadas em regiões `role="status"` discretas.
- Cada tela pode declarar `canLeave` (pede confirmação se há treino não salvo — vale também
  para "Atualizar agora") e `destroy` (libera câmera, vídeos, temporizadores e URLs).
- Gráficos de evolução em SVG com legenda, rótulos diretos, dica por ponteiro/teclado e
  "Ver tabela"; paleta validada para daltonismo nos temas claro e escuro.
- Tema claro/escuro (segue o sistema ou escolha do jogador) e "reduzir animações".

## Simuladores

Campo de 24 × 32 m (ataque para cima), mesmas coordenadas no motor e no SVG. Cada modo tem
gerador com semente (`roundSeed`), avaliação geométrica pura e testes. A interface aceita toque
(com tolerância para rolar a página), botões alternativos e teclado (atalhos só durante a rodada,
sem roubar Enter de botões focados). A cena pode ser lida em texto ("Descrição da cena").

## Limitações conhecidas

- Sem lockfile (`package-lock.json`): o ambiente não tinha acesso ao npm; as versões das
  ferramentas estão fixadas em `package.json`.
- Câmera, desempenho e uso real foram verificados com o Chromium (câmera falsa, vídeos
  sintéticos), **não** em um celular Android físico.
- Vídeos MP4/H.264 dependem dos codecs do navegador; o Chromium dos testes não inclui H.264,
  então os testes usam WebM.
- A estimativa de pose depende de arquivos opcionais e não foi validada com a biblioteca real.

Mais detalhes em [TESTING.md](TESTING.md) e [VISAO_COMPUTACIONAL.md](VISAO_COMPUTACIONAL.md).
