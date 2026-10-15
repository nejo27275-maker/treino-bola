# Vídeo, câmera e visão computacional: o que existe e quais são os limites

Este documento separa, com honestidade, o que o Cláudio Futebol AI **mede de verdade**, o que é
**avaliação manual** e o que é **experimental**. Toda análise roda no próprio aparelho; nenhum
vídeo, quadro ou imagem da câmera é enviado para fora.

## Resumo

| Recurso                                                                      | Tipo de resultado                      | Estado                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Reprodução, linha do tempo, quadro a quadro, marcadores e captura de quadros | Ferramenta                             | Implementado e testado (Chromium, WebM)                                                                |
| Avaliação guiada (9 critérios: bom / parcial / melhorar / não dá para ver)   | **Avaliação manual**                   | Implementado e testado                                                                                 |
| Mapa de movimento do vídeo (picos de mudança entre quadros)                  | **Métrica calculada**                  | Implementado e testado com vídeo sintético                                                             |
| Reação com movimento na câmera ao vivo (lado e tempo da reação)              | **Métrica calculada**                  | Implementado; testado com câmera falsa do Chromium; **exige dispositivo real** para validar com pessoa |
| Estimativa de pose (33 pontos do corpo, MediaPipe) — vídeo e câmera          | **Inferência automática experimental** | Opcional; integração testada com biblioteca **simulada**; **não validada com a biblioteca real**       |
| Detecção de bola, adversários, passes, chutes ou força do chute              | —                                      | **Não implementado** (e não é prometido)                                                               |

## 1. Vídeos importados

- O vídeo é aberto com `URL.createObjectURL` a partir do arquivo escolhido. Ele **não é copiado**
  para o armazenamento do aplicativo e a URL temporária é liberada ao trocar de vídeo ou sair da
  tela.
- Formatos: o que o navegador conseguir decodificar. No Chrome do Android, MP4 (H.264) e WebM
  costumam funcionar; HEVC/H.265 depende do aparelho. Arquivos que não são vídeo, vazios,
  corrompidos ou com codec não suportado geram mensagens específicas (`src/media/mediaErrors.ts`).
- Vídeos acima de 500 MB recebem um aviso (a navegação pode ficar lenta em aparelhos modestos).
- Quadros capturados ficam só na memória; só são guardados no IndexedDB se o jogador marcar
  "Salvar os quadros" ao salvar a avaliação.

## 2. Mapa de movimento (métrica calculada)

Arquivo: `src/core/motion.ts` (funções puras, com testes) e `src/media/videoTools.ts`.

1. O vídeo é percorrido em passos fixos; cada quadro é reduzido para 80×60 pixels em tons de cinza.
2. Para cada par de quadros, conta-se a fração de pixels cuja diferença passa de um limiar.
3. Picos são os pontos acima de `mediana + 2 × MAD` (desvio absoluto mediano), com distância
   mínima entre eles.

**O que isso significa:** "aqui a imagem mudou bastante". Serve para pular direto para os
trechos com ação. **Não** identifica quem se mexeu, nem a bola, nem o tipo de ação. Câmera
tremendo, mudança de luz ou pessoas ao fundo também geram picos.

## 3. Câmera ao vivo

Detalhes de permissão e HTTPS em [CAMERA_E_HTTPS.md](CAMERA_E_HTTPS.md).

- **Treino livre:** a câmera é só um espelho, com temporizador e contagem manual de acertos.
  Nenhuma análise automática é feita (e a tela diz isso).
- **Reação com movimento (métrica calculada):**
  1. Calibração de 2 s com o jogador parado: o ruído da cena define o limiar
     (`média + 4 desvios`, mínimo 1,2 % dos pixels). Cenas agitadas demais são recusadas.
  2. Depois de uma espera aleatória, aparece uma seta (e um som diferente para cada lado).
  3. O detector de início (`OnsetDetector`) exige 2 quadros seguidos acima do limiar e um lado
     dominante (1,3× mais movimento que o outro).
  4. O tempo de reação inclui o atraso da câmera e da tela: compare só com você mesmo, no mesmo
     aparelho.
  5. Movimento antes do sinal é "largada falsa" e a tentativa é repetida; três seguidas pausam a
     série e pedem nova calibração.
  6. Com "Estou de frente para a câmera", esquerda e direita são as do jogador (a imagem é
     espelhada). Um teste automatizado confirma isso com quadros reais de uma câmera falsa.
- A frequência de análise é ajustável (5, 10 ou 15 por segundo) e a resolução também
  (640×480 ou 1280×720), para aparelhos modestos.

## 4. Estimativa de pose (opcional e experimental)

### O que faz

Com os arquivos do MediaPipe instalados, o aplicativo pode:

- detectar os 33 pontos do corpo (formato BlazePose) em um quadro do vídeo ou da câmera;
- desenhar o esqueleto sobre a imagem;
- calcular métricas 2D **justificáveis**, cada uma com sua confiança (`src/core/poseMetrics.ts`):
  inclinação do tronco, inclinação dos ombros, flexão de cada joelho, base de apoio
  (tornozelos ÷ quadril) e abertura dos ombros para a câmera;
- marcar como **insuficiente** toda métrica cujo ponto tenha visibilidade abaixo de 0,5 (nada
  é preenchido "no chute");
- resumir um trecho de 3 s (estabilidade do tronco só com ao menos 5 quadros confiáveis).

O resumo de pose é salvo junto da avaliação do vídeo e aparece identificado como
"Pose (automática, experimental)". Ele **não** altera as notas de habilidade: não existe uma
relação validada entre esses ângulos e acertar um passe ou um domínio.

### O que NÃO faz

- Não detecta a bola, adversários, companheiros ou espaços livres.
- Não reconhece ações de futebol (passe, chute, drible) só porque desenha o corpo.
- Não mede força de chute (isso exigiria instrumentos e calibração).
- As medidas são 2D: dependem do ângulo e da distância da câmera.

### Como instalar os arquivos (opcional)

Os arquivos **não** fazem parte do repositório. Com internet:

```bash
npm run pose:prepare      # baixa @mediapipe/tasks-vision (npm) e o modelo pose_landmarker_lite
npm run build             # o build registra em build-info.json que o detector está disponível
```

Sem internet, com os arquivos já baixados:

```bash
node scripts/prepare-pose.mjs --from-tarball caminho/mediapipe-tasks-vision-X.Y.Z.tgz \
  --model-file caminho/pose_landmarker_lite.task
npm run build
```

O script copia `vision_bundle.mjs` e a pasta `wasm/` para `public/vendor/mediapipe/`, o modelo
para `public/models/`, guarda a licença do pacote e grava `manifest.json` com versão e SHA-256 de
cada arquivo. Tudo é servido pelo próprio site (sem CDN), de acordo com a política de segurança
de conteúdo (CSP) da página, que já permite `wasm-unsafe-eval` para o WebAssembly.

### Offline

Os arquivos de pose ficam **fora** do pré-cache do aplicativo (são grandes e opcionais). Na tela
de vídeo, depois de carregar o detector, eles podem ser guardados em um cache separado. O
aplicativo **não** afirma que a pose funciona offline enquanto esses arquivos não estiverem
guardados no aparelho.

### Estado de validação

- A integração segue a API documentada (`FilesetResolver.forVisionTasks`,
  `PoseLandmarker.createFromOptions` com `runningMode: 'VIDEO'`, `detectForVideo`), tenta GPU e
  cai para CPU.
- **Não foi possível baixar a biblioteca real neste ambiente** (sem acesso ao registro npm). O
  teste automatizado `tests/e2e/pose.spec.ts` usa uma biblioteca **simulada** que imita a API e
  devolve pontos sintéticos conhecidos. Ele valida o caminho do aplicativo (carregar, cair de GPU
  para CPU, desenhar, calcular, marcar confiança insuficiente, salvar e tratar falhas), **não** a
  qualidade da detecção.
- Validar a detecção real exige: rodar `npm run pose:prepare` com internet, publicar em HTTPS e
  testar em um celular Android com vídeos reais.

### Licenças

- `@mediapipe/tasks-vision`: Apache License 2.0 (o script copia o arquivo de licença do pacote
  e grava o campo `license` no `manifest.json`).
- Modelo `pose_landmarker_lite.task`: consulte o "model card" oficial, ligado na
  [guia do Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker),
  antes de redistribuir publicamente. O
  [model card do BlazePose GHUM (ML Kit)](https://developers.google.cn/static/ml-kit/images/vision/pose-detection/pose_model_card.pdf)
  indica Apache 2.0, mas isso não foi confirmado para este arquivo específico.
