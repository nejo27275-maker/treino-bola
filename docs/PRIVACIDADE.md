# Privacidade

Resumo: **tudo fica no aparelho.** O Cláudio Futebol AI não tem servidor de dados, conta,
anúncios, analytics, rastreamento ou telemetria, e não usa API de IA externa.

## O que é guardado e onde

| Dado                                                                                                               | Onde                                       | Quando                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------- |
| Perfil (apelido opcional, posição, experiência, focos, tempo, espaço, materiais, preferências)                     | IndexedDB                                  | Só se você preencher                  |
| Sessões e resultados (tentativas, acertos, erros marcados, tempos de reação, esforço e desconforto)                | IndexedDB                                  | Ao salvar cada treino                 |
| Avaliações de vídeo (nome do arquivo, marcadores, critérios, observações, resumos calculados)                      | IndexedDB                                  | Ao salvar a avaliação                 |
| Quadros capturados do vídeo (imagens JPEG pequenas)                                                                | IndexedDB                                  | Só se você marcar "Salvar os quadros" |
| Competição (nome e data), níveis dos simuladores, configurações (tema, som, vibração, animações) e rotina pré-jogo | IndexedDB                                  | Ao configurar / jogar / editar        |
| Cópia do tema e da preferência de animação, para aplicar antes de a página carregar                                | localStorage (`cfa:tema`, `cfa:movimento`) | Ao alterar                            |
| Arquivos do aplicativo para uso offline                                                                            | Cache do service worker (`cfa-*`)          | Na primeira visita                    |

O que **não** é guardado:

- **Vídeos**: são abertos direto do arquivo do aparelho (URL temporária) e não são copiados.
- **Imagens da câmera**: são analisadas na memória e descartadas; nada é gravado.
- Nome real, idade, localização ou informações médicas não são pedidos. Esforço percebido e
  desconforto são registros opcionais do próprio treino, usados só para deixar o plano mais leve
  quando necessário.

## O que é enviado pela rede

Nada além de baixar os próprios arquivos do site (HTML, JavaScript, CSS, ícones e, se
instalados, os arquivos opcionais do detector de pose, todos do mesmo endereço). A política de
segurança de conteúdo (CSP) da página bloqueia conexões com outros domínios
(`connect-src 'self'`) e o envio de formulários (`form-action 'none'`).

## Controle do jogador

- **Exportar** (Configurações → Exportar meus dados): gera um arquivo JSON com tudo, exceto os
  quadros de imagem. Você decide com quem compartilhar.
- **Importar**: arquivos de backup são validados campo a campo (tipos, tamanhos, datas, listas
  permitidas). O conteúdo é tratado só como dado: nada é executado e nenhum HTML é interpretado.
  É possível mesclar com os dados atuais ou substituí-los.
- **Apagar**: perfil (Configurações → Perfil) ou todos os dados do aplicativo (Configurações →
  Apagar todos os dados). Afeta só os dados deste aplicativo.

## Câmera

A câmera só liga quando você toca em "Ligar câmera", mostra o indicador "Câmera ligada", desliga
ao sair da tela ou quando o aplicativo vai para segundo plano, e nunca grava nem transmite.
Detalhes em [CAMERA_E_HTTPS.md](CAMERA_E_HTTPS.md).
