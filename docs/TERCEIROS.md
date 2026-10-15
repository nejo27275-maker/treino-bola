# Bibliotecas, ferramentas e modelos de terceiros

## No aplicativo publicado

**Nenhuma dependência de terceiros em tempo de execução.** Todo o código do aplicativo em
`dist/` é compilado a partir de `src/` deste repositório. Não há CDN, fontes remotas (usa a
fonte do sistema) nem scripts externos. Os ícones são gerados por `scripts/make-icons.mjs`.

## Opcional: detector de pose

Só presente se alguém executar `npm run pose:prepare` antes do build (não incluído no
repositório):

| Item                                                      | Origem                                        | Licença                                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mediapipe/tasks-vision` (`vision_bundle.mjs` + `wasm/`) | registro npm (Google AI Edge / MediaPipe)     | Apache License 2.0 — o script copia o arquivo de licença do pacote para `public/vendor/mediapipe/` e registra o campo `license` em `manifest.json` |
| `pose_landmarker_lite.task`                               | `storage.googleapis.com/mediapipe-models/...` | Verifique o model card oficial antes de redistribuir publicamente (detalhes em [VISAO_COMPUTACIONAL.md](VISAO_COMPUTACIONAL.md))                   |

Tamanho aproximado: alguns megabytes (o modelo "lite" é o menor dos três disponíveis). Os
arquivos não entram no pré-cache do aplicativo.

## Ferramentas de desenvolvimento (não vão para o aplicativo)

Versões fixadas em `package.json` (`devDependencies`):

| Ferramenta  | Versão | Uso                                 | Licença    |
| ----------- | ------ | ----------------------------------- | ---------- |
| TypeScript  | 6.0.2  | Compilação e verificação de tipos   | Apache-2.0 |
| ESLint      | 10.1.0 | Lint dos scripts JavaScript         | MIT        |
| Prettier    | 3.8.1  | Formatação                          | MIT        |
| Playwright  | 1.56.1 | Testes de ponta a ponta no Chromium | Apache-2.0 |
| @types/node | 26.1.2 | Tipos do Node para scripts e testes | MIT        |

Os testes unitários usam o executor nativo do Node (`node --test`), sem bibliotecas extras.

Observação: o repositório não tem `package-lock.json` porque o ambiente de desenvolvimento não
tinha acesso ao registro npm (as ferramentas já estavam instaladas). Ao rodar `npm install` com
internet, o npm cria o lockfile; recomenda-se versioná-lo.
