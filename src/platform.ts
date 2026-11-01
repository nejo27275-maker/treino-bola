/**
 * Onde o app está rodando: no navegador (site/PWA) ou dentro do aplicativo Android (APK).
 * O APK injeta a ponte `ClaudioAndroid` no WebView antes de a página carregar; no navegador
 * ela não existe e nada muda.
 */
export interface AndroidBridge {
  /** Abre o "Salvar como" do Android para gravar um arquivo de texto no lugar que o jogador escolher. */
  saveFile(name: string, mime: string, content: string): void;
}

export function androidBridge(): AndroidBridge | null {
  const bridge = (globalThis as { ClaudioAndroid?: Partial<AndroidBridge> }).ClaudioAndroid;
  return bridge && typeof bridge.saveFile === 'function' ? (bridge as AndroidBridge) : null;
}

export function isAndroidApp(): boolean {
  return androidBridge() !== null;
}
