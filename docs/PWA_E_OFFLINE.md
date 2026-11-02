# Instalação no Android e no iPhone (PWA) e uso offline

O Craque AI é um site estático que funciona como aplicativo instalável (PWA). Não há
loja de aplicativos, conta ou servidor próprio: depois da primeira visita, tudo roda no aparelho.
O mesmo endereço serve Android e iPhone — no iPhone **não** se usa APK (isso é só do Android).

## No iPhone (iOS)

1. Abra o endereço **HTTPS** do app no **Safari** (precisa ser o Safari, não um navegador
   embutido de outro app).
2. Toque no botão **Compartilhar** (o quadrado com a seta para cima).
3. Escolha **"Adicionar à Tela de Início"** e confirme.
4. Abra pelo ícone "Craque AI": roda em tela cheia, funciona offline e pede permissão
   da câmera quando você usa. Vídeos MP4/H.264 do iPhone tocam normalmente.

Observações honestas do iOS (não testado em um iPhone real por mim, **EXIGE DISPOSITIVO REAL**):

- A câmera e a instalação só funcionam no **Safari** e em **HTTPS**.
- O iOS pode apagar os dados de um site **não instalado** após alguns dias sem uso; depois de
  "Adicionar à Tela de Início" isso é bem menos provável. Mesmo assim, para trocar de aparelho
  use **Exportar meus dados** e **Importar backup**.
- Não há prompt automático de instalação no iOS (por isso o passo manual acima); o botão
  "Instalar o aplicativo" em Configurações só aparece onde o navegador oferece a instalação
  (Android/Chrome).

## Requisitos

- O site precisa estar em **HTTPS** (por exemplo, GitHub Pages) — exigência dos navegadores para
  service worker, instalação e câmera. Em `localhost` também funciona (desenvolvimento).
- Chrome do Android atualizado (outros navegadores baseados em Chromium costumam funcionar).

## Instalar

1. Abra o endereço HTTPS do aplicativo no Chrome.
2. Espere a página carregar por completo (o service worker guarda os arquivos na primeira visita).
3. Toque no menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).
   - Quando o Chrome oferece a instalação, o botão **Instalar o aplicativo** também aparece em
     **Mais → Configurações → Uso offline e instalação**.
4. O ícone "Cláudio FC" aparece na tela inicial e o app abre em tela cheia.

## O que funciona offline

Depois da primeira visita completa (em **Configurações** aparece "Offline: pronto"):

- todas as telas, a biblioteca de exercícios, os treinos físicos e mentais, os seis simuladores,
  a leitura de jogo, o plano e o histórico;
- registrar sessões, exportar e importar backups (os dados ficam no IndexedDB do aparelho);
- abrir vídeos do próprio aparelho, o mapa de movimento e a avaliação guiada;
- a câmera ao vivo (treino livre e reação com movimento), que não depende de internet.

O que **não** funciona offline:

- a estimativa de pose, **a menos que** os arquivos opcionais do detector tenham sido instalados
  no servidor e guardados no aparelho (botão "Guardar o detector para uso offline" em
  Configurações → Visão computacional local). Veja [VISAO_COMPUTACIONAL.md](VISAO_COMPUTACIONAL.md).

Um teste automatizado (`tests/e2e/offline.spec.ts`) carrega o aplicativo com o service worker
real, desliga a rede, recarrega e confirma que as telas abrem, um simulador inicia e um
resultado é salvo.

## Como o cache funciona

- O build (`npm run build`) gera `dist/sw.js` com a lista de todos os arquivos do aplicativo e
  um hash do conteúdo de cada um. A versão do service worker muda sempre que algum arquivo muda.
- Na instalação, o service worker guarda esses arquivos no cache `cfa-app-<versão>`. Pedidos do
  próprio site são atendidos primeiro pelo cache; navegações recebem o `index.html` guardado.
- Nada de outros domínios é interceptado ou guardado.
- Arquivos opcionais de pose (`vendor/` e `models/`) ficam em um cache separado
  (`cfa-opcional-<versão dos arquivos>`) e só são guardados quando o jogador pede; versões antigas
  são apagadas quando uma nova versão do app é ativada.

## Atualizações

- Quando uma nova versão é publicada, o navegador a baixa em segundo plano e aparece o aviso
  **"Nova versão do aplicativo disponível"** com o botão **Atualizar agora**. Nada muda sem o
  seu toque (para não interromper um treino). Ao atualizar, o cache antigo é apagado.
- Coberto por teste automatizado: o aviso aparece, a versão antiga continua no controle até o
  toque e, depois, só o cache novo permanece.

## Dados e espaço

- Os dados do jogador ficam no **IndexedDB** (banco `claudio-futebol-ai`); o `localStorage`
  guarda só uma cópia do tema e da preferência de animação (chaves `cfa:tema` e `cfa:movimento`).
- Em **Configurações** o aplicativo mostra o espaço usado e permite pedir ao navegador que
  **proteja os dados contra limpeza automática** ("Proteger meus dados"); o navegador decide se
  concede (instalar o app costuma ajudar).
- **Remover arquivos offline** apaga só os caches deste aplicativo (`cfa-*`); os dados do
  jogador continuam.
- **Apagar todos os dados** apaga perfil, histórico, avaliações, quadros salvos e preferências
  deste aplicativo. Arquivos de outros aplicativos e os vídeos da galeria não são tocados.
- Se o IndexedDB não estiver disponível (por exemplo, em algumas janelas anônimas), o
  aplicativo avisa e funciona em memória até a página ser fechada.

## Desinstalar

Pressione o ícone na tela inicial → **Desinstalar** (ou Configurações do Android → Apps). Para
apagar também os dados guardados pelo site: Chrome → Configurações → Configurações do site →
Todos os sites → endereço do aplicativo → **Limpar e redefinir**.
