# APK Android

O Craque AI também existe como **aplicativo Android (APK)**, além do site/PWA. O APK
leva o site inteiro dentro dele: funciona sem internet desde a primeira abertura, sem precisar
publicar o site em HTTPS.

> **Estado honesto:** o APK é compilado automaticamente no GitHub Actions (o ambiente onde o
> projeto foi desenvolvido não tem acesso ao Android SDK). O comportamento do app dentro do
> APK foi testado no Chromium simulando a ponte com o Android, mas **o APK não foi instalado em
> um celular real** por mim: câmera, galeria, "Salvar como" e desempenho no aparelho
> **EXIGEM DISPOSITIVO REAL**.

## Como baixar

1. No GitHub do repositório, abra **Actions → "APK Android"** e entre na execução mais recente
   com ✓ verde.
2. Em **Artifacts**, baixe `claudio-futebol-ai-apk` (é preciso estar logado no GitHub). O
   arquivo vem compactado em `.zip`: extraia e use o `claudio-futebol-ai-<versão>.apk`.
3. O `SHA256SUMS.txt` ao lado traz a soma do APK, para conferir que o arquivo não mudou.

Para um link direto (sem `.zip`), rode o workflow manualmente (**Run workflow**) marcando
**"Também publicar o APK numa release"**: o APK fica anexado a uma release do repositório.
Como o repositório é público, essa release fica visível para qualquer pessoa.

Um APK novo é gerado sempre que o app muda (`src/`, `public/`, `android/` e afins).

## Como instalar no celular

1. Copie o `.apk` para o celular (ou baixe direto nele).
2. Toque no arquivo. Na primeira vez, o Android pede para **permitir instalar apps
   desconhecidos** para o aplicativo que está abrindo o arquivo (navegador ou gerenciador de
   arquivos): permita só para ele.
3. Abra **Craque AI** pela tela inicial.

Requisitos: Android 7.0 (API 24) ou mais novo, com o **Android System WebView** (ou o Chrome)
atualizado pela Play Store — é ele que desenha o app.

### Atualizar sem perder os dados

Cada APK do Actions tem um número de versão maior que o anterior e instala por cima, mantendo
os dados, **desde que a assinatura seja a mesma**. Sem chave própria configurada, o workflow
usa uma chave de depuração guardada no cache do Actions; se esse cache expirar (7 dias sem
uso), a chave muda e o Android recusa a atualização. Nesse caso:

1. No app antigo: **Mais → Configurações → Exportar meus dados (JSON)**.
2. Desinstale o app antigo e instale o novo.
3. No app novo: **Importar backup** com o arquivo exportado.

Para evitar isso de vez, configure uma chave própria (abaixo).

## Permissões

| Permissão            | Para quê                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Câmera               | Câmera ao vivo e "Gravar vídeo". O Android só pergunta quando você usa; dá para negar e usar o resto do app.                                         |
| Vibração             | Sinais dos treinos (se ligado nas configurações).                                                                                                    |
| Internet (declarada) | Declarada por precaução, porque alguns WebViews recusam carregar páginas sem ela. O app **não acessa a internet**: veja "Privacidade no APK" abaixo. |

Microfone, localização, contatos e arquivos do aparelho **não** são pedidos. Vídeos e o backup
são escolhidos por você nos seletores do próprio Android.

## Privacidade no APK

- Os arquivos do site são servidos pelo próprio APK num endereço local
  (`https://appassets.androidplatform.net/`, reservado pelo Android para isso). **Todo pedido**
  de rede da página é respondido pelo app: os arquivos do site, ou uma recusa local para
  qualquer outro endereço. Links externos abrem no navegador, fora do app.
- O WebView não consulta o Safe Browsing do Google nem envia métricas de uso (desligados no
  manifesto).
- `allowBackup=false`: os dados não entram no backup automático do Android para a nuvem. Para
  levar os dados a outro celular, use **Exportar meus dados** e **Importar backup**.
- A política de segurança da página (CSP) continua valendo, como no site.

## O que muda em relação ao site

- **Offline:** tudo já está dentro do app; não há service worker nem "Remover arquivos offline".
  Configurações mostra "Offline: pronto" e "O aplicativo já está instalado neste aparelho".
- **Exportar meus dados:** abre o "Salvar como" do Android (o WebView não baixa arquivos como
  o navegador).
- **Permissão da câmera negada:** as instruções apontam para Configurações do Android → Apps →
  Craque AI → Permissões.
- **Gravar vídeo:** abre o app de câmera do aparelho; o vídeo gravado fica na galeria (como no
  navegador) e é aberto no app sem ser copiado.
- **Voltar:** o botão voltar do Android volta pelas telas do app e só depois fecha o app.
- **Girar a tela** não recarrega a página (um treino em andamento continua).
- O detector de pose opcional não vai no APK (os arquivos não estão no repositório).

## Chave de assinatura própria (opcional, recomendado)

Gere uma chave **uma vez** e guarde-a com cuidado (quem tiver a chave e as senhas pode publicar
"atualizações" do app):

```bash
keytool -genkeypair -v -keystore claudio.jks -alias claudio -keyalg RSA -keysize 4096 \
  -validity 10000 -dname "CN=Claudio Futebol AI"
base64 -w0 claudio.jks > claudio.jks.base64
```

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, crie:

| Segredo                     | Valor                                  |
| --------------------------- | -------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | conteúdo de `claudio.jks.base64`       |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore                      |
| `ANDROID_KEY_ALIAS`         | `claudio` (o alias usado no comando)   |
| `ANDROID_KEY_PASSWORD`      | senha da chave (a mesma, se não mudou) |

A partir daí o workflow gera um APK **release** assinado com essa chave. A primeira troca de
chave (depuração → própria) exige desinstalar e reinstalar: exporte os dados antes.

## Compilar no computador (opcional)

Precisa do Android Studio (ou Android SDK + JDK 17) e do Node.js 22:

```bash
npm install
npm run build              # gera dist/, que vai dentro do APK
cd android
./gradlew testDebugUnitTest assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

O Android Studio também abre a pasta `android/` diretamente (rode `npm run build` antes; o
build para com uma mensagem clara se `dist/` não existir).

## Como é feito (para quem for mexer)

| Arquivo                                      | Papel                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `android/app/src/main/.../MainActivity.java` | WebView + pontes: câmera, escolher/gravar vídeo, "Salvar como", tela cheia, voltar, recuperação se a página cair |
| `.../ServidorLocal.java`                     | Responde a todos os pedidos da página com os assets do APK (ou recusa local)                                     |
| `.../Arquivos.java`                          | Regras puras: caminho seguro do asset, tipo MIME, nome de arquivo seguro (testes JUnit em `src/test`)            |
| `src/platform.ts`                            | No site: detecta a ponte `window.ClaudioAndroid` (só existe no APK)                                              |
| `.github/workflows/android.yml`              | Build do site, testes, APK, conferência do conteúdo, soma SHA-256 e artefato; release opcional                   |
| `scripts/make-icons.mjs`                     | Também gera os ícones do launcher (tradicional e adaptativo)                                                     |

Sem bibliotecas AndroidX ou de terceiros no app: só a API da plataforma Android (o build usa o
Android Gradle Plugin e, nos testes, JUnit).
