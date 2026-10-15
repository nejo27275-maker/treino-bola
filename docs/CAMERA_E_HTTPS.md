# Câmera ao vivo: permissões, HTTPS e solução de problemas

## Requisitos

- **HTTPS ou localhost.** Os navegadores só liberam `navigator.mediaDevices.getUserMedia` em
  contextos seguros. Um endereço `http://192.168.x.x` aberto no celular **não** libera a câmera.
  O aplicativo detecta isso e mostra "A câmera precisa de HTTPS" em vez do botão de ligar.
- Navegador moderno (Chrome do Android atualizado é o alvo principal). Navegadores embutidos em
  outros aplicativos (redes sociais, mensageiros) costumam bloquear a câmera: abra o endereço no
  Chrome.

## Como a câmera é usada

- A câmera **só liga quando você toca em "Ligar câmera"**. O navegador então pergunta se o site
  pode usar a câmera.
- Enquanto está ligada, aparece o indicador **"Câmera ligada"** no topo da tela.
- **Nada é gravado nem enviado.** Os quadros são analisados na memória e descartados.
- Ao tocar em "Desligar câmera", ao trocar de tela ou ao sair do aplicativo, **todas as faixas
  de vídeo são encerradas** (o indicador do sistema também apaga). Um teste automatizado confere
  que nenhuma faixa fica ativa.
- Pedidos duplicados são evitados: tocar várias vezes em "Ligar câmera" não abre duas câmeras.
- Ajustes: câmera frontal ou traseira (quando o aparelho tem as duas), resolução baixa
  (640×480) ou média (1280×720) e 5, 10 ou 15 análises por segundo.

## Liberar a câmera no Android (Chrome)

1. Abra o aplicativo pelo endereço HTTPS.
2. Toque em **Mais → Câmera ao vivo → Ligar câmera** e escolha **Permitir**.
3. Se você tocou em "Bloquear" antes: toque no ícone à esquerda do endereço (cadeado ou "i") →
   **Permissões** → **Câmera** → **Permitir**. Recarregue a página.
4. Se o aplicativo estiver instalado (PWA): Configurações do Android → Apps → Chrome (ou o
   próprio app instalado) → Permissões → Câmera.

## Mensagens de erro e o que fazer

| Mensagem                            | Causa provável                              | O que fazer                                  |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------- |
| Permissão da câmera negada          | Você (ou o navegador) bloqueou a câmera     | Libere em Permissões do site (passo 3 acima) |
| Nenhuma câmera encontrada           | Aparelho sem câmera ou câmera desativada    | Teste em outro app; tente a outra câmera     |
| A câmera está ocupada               | Outro app ou aba usa a câmera               | Feche videochamadas e outras abas            |
| Configuração não suportada          | A resolução pedida não existe nessa câmera  | Use a resolução baixa ou a outra câmera      |
| Câmera indisponível neste navegador | Navegador embutido ou sem suporte           | Abra no Chrome atualizado                    |
| A câmera precisa de HTTPS           | Página aberta por `http://` (não localhost) | Use o endereço HTTPS                         |

## Testar no celular durante o desenvolvimento

Opção 1 — **publicar em HTTPS** (por exemplo, GitHub Pages; veja o [README](../README.md)).

Opção 2 — **encaminhamento de porta pelo cabo USB** (o celular acessa como `localhost`, que é
considerado seguro):

1. No computador: `npm run build` e `npm run serve` (servidor em `http://127.0.0.1:4173/`).
2. No celular: ative as Opções do desenvolvedor e a Depuração USB; conecte o cabo.
3. No Chrome do computador, abra `chrome://inspect/#devices`, clique em **Port forwarding** e
   adicione `4173 → localhost:4173`.
4. No Chrome do celular, abra `http://localhost:4173/`.

## O que foi e o que não foi validado

- **Validado automaticamente (Chromium com câmera falsa):** ligar/desligar, liberação de todas
  as faixas, indicador, saída da tela, permissão negada (negação real do navegador), HTTPS
  ausente (contexto inseguro simulado), quadros reais passando pelo detector, recusa de cena
  agitada, lado esquerdo/direito com espelhamento.
- **Exige dispositivo real:** câmera física de um celular Android, troca frontal/traseira,
  desempenho em aparelhos modestos, reação de uma pessoa de verdade e a qualidade da detecção de
  movimento em ambientes reais (luz, fundo, distância).
