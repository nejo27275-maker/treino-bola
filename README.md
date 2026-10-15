# Cláudio Futebol AI

Treinador digital de futebol para o navegador do celular (Android): fundamentos, leitura de
jogo, simuladores, preparação física e mental, análise de vídeo e câmera ao vivo, com um plano
adaptativo até o **interclasse de 20/10/2026**. Tudo roda **no próprio aparelho**: sem conta,
sem API de IA, sem analytics, e funciona offline depois da primeira visita.

> **Estado honesto:** o app foi construído e testado com testes automatizados (129 unitários e
> 65 de ponta a ponta no Chromium), mas **não foi testado em um celular físico** nem publicado
> por mim. A câmera foi validada com a câmera falsa do Chromium e a estimativa de pose só com
> uma biblioteca simulada. Detalhes em [docs/TESTING.md](docs/TESTING.md).

## O que o app faz

| Área                         | O que tem de verdade                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Início**                   | Próxima atividade do plano, contagem até o evento, prioridades do motor com o motivo de cada uma.                                                                                                                                                                                            |
| **Perfil (opcional)**        | Posição, experiência, focos, tempo, espaço, materiais, dificuldade, sessões curtas/longas. Editável e apagável.                                                                                                                                                                              |
| **Avaliação**                | Testes de linha de base (10 tentativas, condições fixas) e autoavaliação de peso baixo. Sem dados, o fundamento aparece como **pendente** — nada de nota inventada.                                                                                                                          |
| **Treino técnico**           | 27 exercícios em 12 temas, cada um com objetivo, materiais, organização, instruções numeradas, volume, pausas, critério de sucesso, erros comuns com correção e variações; alternativas sem cones/parede. Sessão com contagem de acertos/erros, séries, descanso, desfazer e sinais visuais. |
| **Preparação física**        | 10 treinos guiados (aquecimento, coordenação, agilidade, equilíbrio, aceleração, core, força com peso do corpo, mobilidade, aquecimento de jogo, técnica de chute), checagem de segurança, botão "Parar: não estou bem", esforço percebido e desconforto que deixam o plano mais leve.       |
| **Leitura de jogo e mental** | 16 situações com explicação de todas as opções; respiração, rotina pré-jogo editável, reset após erro, visualização e diário de confiança.                                                                                                                                                   |
| **Simuladores (6)**          | Passe pela brecha, domínio orientado, olhe antes de receber, decisão rápida, reação à pressão e finalização — regras geométricas explícitas, pontuação pelo motor, sementes reproduzíveis, dificuldade progressiva, histórico, toque/teclado e descrição da cena em texto.                   |
| **Vídeos**                   | Importar da galeria (ou gravar), reproduzir, quadro a quadro, linha do tempo, marcar momentos, capturar quadros, mapa de movimento (métrica calculada), avaliação guiada em 9 critérios (manual) e pose opcional (experimental).                                                             |
| **Câmera ao vivo**           | Permissão explícita, frontal/traseira, resolução e frequência ajustáveis, indicador "Câmera ligada", liberação de todas as faixas ao sair; treino livre com contagem manual e reação com detecção de movimento (métrica calculada). Nada é gravado.                                          |
| **Plano**                    | Calendário recalculado pela data do aparelho: avaliação inicial, desenvolvimento, recuperação, véspera leve, dia do jogo sem treino extra; se o evento passou, pede a próxima competição.                                                                                                    |
| **Histórico**                | Sessões, evolução por fundamento (gráfico com tabela), simuladores e comparação de sessões.                                                                                                                                                                                                  |
| **Dados**                    | IndexedDB, exportar/importar JSON validado, apagar tudo (só os dados deste app), uso de espaço e proteção contra limpeza.                                                                                                                                                                    |

Cada resultado mostra a **origem**: avaliação manual, métrica calculada ou inferência automática
experimental — e o motor dá pesos diferentes a cada uma ([docs/MOTOR_E_PLANO.md](docs/MOTOR_E_PLANO.md)).

## Rodar no computador

Requisitos: **Node.js 22.18 ou mais novo** (o projeto usa TypeScript sem etapa extra nos
testes). Não há dependências em tempo de execução; `npm install` instala só as ferramentas de
desenvolvimento (TypeScript, ESLint, Prettier, Playwright).

```bash
npm install
npm run dev        # build de desenvolvimento + recompilação ao salvar → http://127.0.0.1:5173/
```

Build de produção (com service worker e uso offline):

```bash
npm run build      # gera dist/
npm run serve      # serve dist/ em http://127.0.0.1:4173/
```

### Todos os comandos

| Comando                           | O que faz                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                     | Build de desenvolvimento (sem cache offline), recompila ao salvar e serve em `:5173`. |
| `npm run build`                   | Build de produção em `dist/` (gera `sw.js` com a lista de arquivos e a versão).       |
| `npm run build:dev`               | Build de desenvolvimento sem servidor.                                                |
| `npm run serve`                   | Serve `dist/` em `http://127.0.0.1:4173/`.                                            |
| `npm run typecheck`               | Verifica os tipos do app e dos testes.                                                |
| `npm run lint`                    | ESLint nos scripts JavaScript.                                                        |
| `npm run format` / `format:check` | Prettier (corrigir / conferir).                                                       |
| `npm test`                        | Testes unitários (`node --test`).                                                     |
| `npm run test:e2e`                | Testes de interface (Playwright + Chromium; faz o build sozinho).                     |
| `npm run check`                   | Tudo: tipos, lint, formatação, unitários, build e interface.                          |
| `npm run icons`                   | Regera os ícones PNG.                                                                 |
| `npm run pose:prepare`            | Opcional: baixa o detector de pose (MediaPipe) para ser servido pelo próprio site.    |

## Usar no celular Android

A câmera, a instalação e o modo offline exigem **HTTPS** (ou `localhost`).

**Opção A — publicar no GitHub Pages** (não feito por mim; o repositório já tem o workflow):

1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Actions → "Publicar no GitHub Pages" → Run workflow**.
3. O endereço segue o padrão `https://<seu-usuário>.github.io/<nome-do-repositório>/`
   (o GitHub mostra o link ao fim do workflow).
4. No Chrome do Android, abra o endereço; depois, menu **⋮ → Instalar app**.

**Opção B — sem publicar, pelo cabo USB** (o celular acessa como `localhost`): veja
[docs/CAMERA_E_HTTPS.md](docs/CAMERA_E_HTTPS.md#testar-no-celular-durante-o-desenvolvimento).

Instalação, offline e atualização: [docs/PWA_E_OFFLINE.md](docs/PWA_E_OFFLINE.md).

## Privacidade

Nenhum dado sai do aparelho. Vídeos não são copiados, a câmera não grava, não há rastreamento.
Exportar, importar e apagar ficam em **Mais → Configurações**. Detalhes:
[docs/PRIVACIDADE.md](docs/PRIVACIDADE.md).

## Documentação

| Documento                                                  | Conteúdo                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | Arquitetura, decisões e por quê                                               |
| [docs/MOTOR_E_PLANO.md](docs/MOTOR_E_PLANO.md)             | Regras do motor adaptativo, simuladores e plano                               |
| [docs/TESTING.md](docs/TESTING.md)                         | Testes executados, resultados individuais e o que falta validar               |
| [docs/PWA_E_OFFLINE.md](docs/PWA_E_OFFLINE.md)             | Instalação no Android, uso offline e atualizações                             |
| [docs/CAMERA_E_HTTPS.md](docs/CAMERA_E_HTTPS.md)           | Permissões da câmera, HTTPS e solução de problemas                            |
| [docs/VISAO_COMPUTACIONAL.md](docs/VISAO_COMPUTACIONAL.md) | O que a análise de vídeo/câmera mede de verdade e seus limites; pose opcional |
| [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md)                 | O que é guardado, onde, e como apagar                                         |
| [docs/TERCEIROS.md](docs/TERCEIROS.md)                     | Bibliotecas, ferramentas e modelos de terceiros e licenças                    |

## Limitações conhecidas

- Não validado em celular físico; desempenho em aparelhos modestos ainda precisa ser medido.
- A detecção de movimento mede **mudança de pixels**: não reconhece pessoas, bola, adversários
  nem espaços livres. A estimativa de pose (opcional) só desenha pontos do corpo e calcula
  ângulos 2D; não reconhece ações de futebol nem mede força de chute.
- Sem `package-lock.json` (o ambiente de desenvolvimento não tinha acesso ao npm). Ao rodar
  `npm install` com internet, versione o lockfile gerado.
- Cenários dos simuladores são **virtuais**: o resultado é identificado como tal e pesa diferente
  da execução real.

Licença: projeto privado (`UNLICENSED`).
