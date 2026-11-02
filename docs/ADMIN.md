# Painel de administração (escondido)

Uma área restrita para quem cuida do app: estado do aplicativo e do aparelho, dados guardados,
os números do motor de avaliação, erros recentes e ferramentas de manutenção. Não aparece em
nenhum menu e fica atrás de uma senha. Tudo é local: o painel não envia nada.

## Como abrir

1. Em qualquer tela, **toque os quatro cantos da tela em até 3 segundos**, em qualquer ordem
   (cada canto é um quadrado de uns 5 a 7 mm — no celular, cerca de 54 px). O último toque não
   aciona o botão que estiver embaixo dele.
2. Digite a **senha de administração** e toque em **Entrar**.

O endereço `#/admin` também abre a mesma tela de senha.

O desbloqueio dura **15 minutos**, ou até o app ir para segundo plano, ou até recarregar a
página/reabrir o app. **Bloquear agora** tranca na hora.

## O que tem no painel

| Seção                 | Conteúdo                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicativo e aparelho | Versão e assinatura, **integridade** (build de produção × desenvolvimento; service worker confere), onde roda (navegador, PWA ou APK), uso offline, armazenamento, data/hora e fuso, idioma, tela, detector de pose e navegador. |
| Dados neste aparelho  | Quantidade de sessões, resultados, análises e quadros; perfil; competição; período das sessões; níveis dos simuladores.                                                                                                          |
| Tempo de uso          | Só deste aparelho: total, hoje, dias ativos, sequência, média por dia ativo, primeiro e último uso. Fica no aparelho, não identifica ninguém e some com os dados.                                                                |
| Motor de avaliação    | Para cada fundamento: situação, estimativa, confiança, tentativas (execução real / simulação) e tendência; as 5 prioridades atuais com motivos; bem-estar.                                                                       |
| Erros recentes        | Os últimos 20 erros inesperados (guardados só no aparelho), com **Copiar** e **Limpar** — útil no celular e no APK, onde não há console.                                                                                         |
| Manutenção            | Mostrar as boas-vindas de novo; voltar os simuladores ao nível 1; **Exportar diagnóstico (JSON)** (versões, contagens, motor e erros — sem perfil nem sessões).                                                                  |
| Segurança do painel   | Data da senha atual, parâmetros do hash e como trocar a senha.                                                                                                                                                                   |

## A senha

- É **aleatória**: 24 caracteres sorteados com gerador criptográfico entre 57 símbolos (sem
  os que se confundem, como `0/O` e `1/l/I`), em 4 grupos separados por hífen — cerca de
  **139 bits** de entropia. Exemplo do formato (não é a senha): `Ab3dEf-Gh4jKm-Np5qRs-Tu6vWx`.
- **Não está no código.** O repositório é público, então o app guarda só o resultado do
  **PBKDF2-SHA-256** com **600.000 iterações** e um **sal aleatório de 128 bits**
  (`src/admin/credencial.ts`). Cada tentativa custa uma fração de segundo de propósito; com
  uma senha aleatória desse tamanho, descobri-la a partir do hash é inviável.
- A comparação é feita em tempo constante.
- **Tentativas erradas:** as 4 primeiras são livres; da 5ª em diante, novas tentativas esperam
  1 minuto, dobrando a cada erro até 1 hora (vale mesmo recarregando a página).
- A senha foi entregue ao dono do projeto fora do repositório. Guarde-a num gerenciador de
  senhas (o campo aceita preenchimento automático).

### Trocar a senha

No computador, na pasta do projeto:

```bash
npm run admin:senha
```

O script sorteia uma nova senha, mostra-a **uma única vez** no terminal e grava só o novo
hash em `src/admin/credencial.ts`. Depois, faça commit desse arquivo, publique o site e gere o
APK de novo (o workflow do APK roda sozinho a cada push que muda o app).

## Integridade (em vez de "travar a cópia")

O app **não** tem código que o faz quebrar quando é copiado: isso não protege nada (o código é
aberto) e, na prática, acabaria quebrando o app de gente de verdade por engano. Em vez disso, o
painel **mostra** um sinal honesto de integridade:

- **Build de desenvolvimento** (não é uma versão de produção) → aviso.
- **Service worker não confere com esta versão** (cache antigo ou cópia alterada) → aviso.
- A **assinatura** (hash do conteúdo do build, também no registro do GitHub Actions) permite
  comparar à mão com a versão oficial.

Limite honesto: como o app é público e compilado em um CI público, **não dá** para provar por
criptografia que uma cópia é "a oficial" (não há segredo de assinatura que já não seja público).
No APK, a integridade do pacote é garantida pela assinatura do próprio Android.

## Limites (honestos)

- A senha protege a **interface** do painel, e o tempo de uso é só deste aparelho. Como tudo
  roda no próprio aparelho, o painel não identifica quem usa, não acessa nenhum servidor e não
  vê outros aparelhos; quem tiver controle total do aparelho e conhecimento técnico consegue
  ler os dados locais de outras formas.
- O gesto dos cantos é um atalho escondido, não uma proteção: a proteção é a senha.
- O registro de erros fica no `localStorage` (`cfa:erros`) e é apagado em **Mais →
  Configurações → Apagar todos os dados**, junto com o resto.

## Testes

- `tests/unit/admin.test.ts`: verificação da senha (certa, errada, vazia, espaços),
  comparação em tempo constante, credencial real com hash forte e que recusa senhas fracas,
  bloqueio progressivo e estado corrompido, gesto (cantos, tempo, ordem, repetição) e
  registro de erros.
- `tests/e2e/admin.spec.ts`: o gesto abre a tela de senha; senha errada é recusada; a certa
  abre o painel, exporta o diagnóstico e tranca; cinco erros bloqueiam mesmo recarregando;
  erros inesperados aparecem no painel. Nos testes, o módulo da credencial é trocado por um de
  teste na rede (a senha real nunca aparece nos testes).
