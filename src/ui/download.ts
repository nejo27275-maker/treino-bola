/** Entrega um arquivo JSON ao jogador: download no navegador, "Salvar como" no APK. */
import { androidBridge } from '../platform.ts';
import { h } from './dom.ts';

/** Devolve true quando o Android vai perguntar onde salvar (o WebView não baixa blobs). */
export function baixarJson(data: unknown, filename: string): boolean {
  const text = JSON.stringify(data, null, 2);
  const android = androidBridge();
  if (android) {
    android.saveFile(filename, 'application/json', text);
    return true;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libera a URL temporária depois que o navegador inicia o download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return false;
}
