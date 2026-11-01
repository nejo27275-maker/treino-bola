package io.github.nejo27275.claudiofutebol;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serve os arquivos do site (assets do APK) numa origem https local. O WebView trata essa
 * origem como contexto seguro (câmera, módulos ES, IndexedDB) e nenhum pedido vai para a rede:
 * o domínio é reservado pelo Android para isso e qualquer outro endereço recebe recusa local.
 */
final class ServidorLocal {
    static final String HOST = "appassets.androidplatform.net";
    static final String INICIO = "https://" + HOST + "/index.html";

    private ServidorLocal() {}

    static boolean ehLocal(Uri url) {
        return url != null && "https".equals(url.getScheme()) && HOST.equals(url.getHost());
    }

    static WebResourceResponse responder(AssetManager assets, Uri url) {
        if (!ehLocal(url)) return resposta(403, "Forbidden", "text/plain", null);
        String asset = Arquivos.caminhoDoAsset(url.getPath());
        if (asset == null) return resposta(400, "Bad Request", "text/plain", null);
        try {
            return resposta(200, "OK", Arquivos.tipoMime(asset), assets.open(asset));
        } catch (IOException e) {
            return resposta(404, "Not Found", "text/plain", null);
        }
    }

    private static WebResourceResponse resposta(
            int status, String motivo, String mime, InputStream dados) {
        Map<String, String> cabecalhos = new HashMap<>();
        cabecalhos.put("Cache-Control", "no-cache");
        cabecalhos.put("X-Content-Type-Options", "nosniff");
        InputStream corpo = dados != null ? dados : new ByteArrayInputStream(new byte[0]);
        return new WebResourceResponse(
                mime, Arquivos.codificacao(mime), status, motivo, cabecalhos, corpo);
    }
}
