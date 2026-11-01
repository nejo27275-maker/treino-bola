package io.github.nejo27275.claudiofutebol;

import java.util.Locale;

/** Regras puras (sem Android) para caminhos, tipos e nomes de arquivo; testadas em JVM. */
final class Arquivos {
    private Arquivos() {}

    /**
     * Converte o caminho pedido pela página no nome do asset: "/js/main.js" → "js/main.js" e
     * "/" → "index.html". Caminhos suspeitos (subir de pasta, barras duplas, barra invertida,
     * byte nulo) devolvem null e são recusados.
     */
    static String caminhoDoAsset(String caminho) {
        if (caminho == null || caminho.isEmpty() || caminho.equals("/")) return "index.html";
        if (!caminho.startsWith("/")
                || caminho.contains("..")
                || caminho.contains("//")
                || caminho.contains("\\")
                || caminho.indexOf('\0') >= 0) {
            return null;
        }
        String asset = caminho.substring(1);
        return asset.endsWith("/") ? asset + "index.html" : asset;
    }

    /** Tipo MIME pela extensão. Módulos ES exigem "text/javascript". */
    static String tipoMime(String caminho) {
        String p = caminho.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    /** Textos precisam declarar a codificação; binários não. */
    static String codificacao(String mime) {
        boolean texto = mime.startsWith("text/")
                || mime.endsWith("json")
                || mime.endsWith("+xml")
                || mime.endsWith("javascript");
        return texto ? "utf-8" : null;
    }

    /** Nome sugerido no "Salvar como": só letras, números, ponto, hífen e sublinhado. */
    static String nomeSeguro(String nome) {
        String limpo = nome == null ? "" : nome.replaceAll("[^A-Za-z0-9._-]", "_");
        if (limpo.isEmpty() || limpo.startsWith(".")) limpo = "claudio-futebol-ai.json";
        return limpo.length() > 100 ? limpo.substring(0, 100) : limpo;
    }

    /** Tipo MIME aceito pela ponte de exportação; qualquer outro vira binário genérico. */
    static String mimeSeguro(String tipo) {
        return tipo != null && tipo.matches("[a-z]+/[a-z0-9.+-]+") ? tipo : "application/octet-stream";
    }

    /** true se todos os tipos aceitos pelo campo de arquivo são de vídeo (ex.: "video/*"). */
    static boolean aceitaSoVideo(String[] tipos) {
        if (tipos == null) return false;
        boolean algum = false;
        for (String tipo : tipos) {
            if (tipo == null || tipo.trim().isEmpty()) continue;
            if (!tipo.trim().toLowerCase(Locale.ROOT).startsWith("video/")) return false;
            algum = true;
        }
        return algum;
    }
}
