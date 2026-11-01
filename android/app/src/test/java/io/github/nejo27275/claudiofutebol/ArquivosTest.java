package io.github.nejo27275.claudiofutebol;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ArquivosTest {
    @Test
    public void caminhosDoSiteViramAssets() {
        assertEquals("index.html", Arquivos.caminhoDoAsset(null));
        assertEquals("index.html", Arquivos.caminhoDoAsset("/"));
        assertEquals("js/main.js", Arquivos.caminhoDoAsset("/js/main.js"));
        assertEquals("styles/app.css", Arquivos.caminhoDoAsset("/styles/app.css"));
        assertEquals("vendor/index.html", Arquivos.caminhoDoAsset("/vendor/"));
    }

    @Test
    public void caminhosSuspeitosSaoRecusados() {
        assertNull(Arquivos.caminhoDoAsset("/../shared_prefs/x.xml"));
        assertNull(Arquivos.caminhoDoAsset("/js/../../x"));
        assertNull(Arquivos.caminhoDoAsset("//outro/x"));
        assertNull(Arquivos.caminhoDoAsset("/js\\x.js"));
        assertNull(Arquivos.caminhoDoAsset("/x\0.js"));
        assertNull(Arquivos.caminhoDoAsset("sem-barra.js"));
    }

    @Test
    public void tiposMimeCorretosParaModulosEMidia() {
        assertEquals("text/javascript", Arquivos.tipoMime("js/main.js"));
        assertEquals("text/html", Arquivos.tipoMime("index.html"));
        assertEquals("application/manifest+json", Arquivos.tipoMime("manifest.webmanifest"));
        assertEquals("application/wasm", Arquivos.tipoMime("vendor/pose/x.WASM"));
        assertEquals("application/octet-stream", Arquivos.tipoMime("modelo.task"));
        assertEquals("utf-8", Arquivos.codificacao("text/javascript"));
        assertEquals("utf-8", Arquivos.codificacao("application/json"));
        assertNull(Arquivos.codificacao("image/png"));
    }

    @Test
    public void nomeEMimeDaExportacaoSaoLimpos() {
        assertEquals(
                "claudio-futebol-ai-backup-2026-10-14.json",
                Arquivos.nomeSeguro("claudio-futebol-ai-backup-2026-10-14.json"));
        assertEquals("_.._etc_passwd", Arquivos.nomeSeguro("/../etc/passwd"));
        assertEquals("claudio-futebol-ai.json", Arquivos.nomeSeguro(".oculto"));
        assertEquals("claudio-futebol-ai.json", Arquivos.nomeSeguro(null));
        assertEquals(100, Arquivos.nomeSeguro("a".repeat(300)).length());
        assertEquals("application/json", Arquivos.mimeSeguro("application/json"));
        assertEquals("application/octet-stream", Arquivos.mimeSeguro("text/html; x=<script>"));
    }

    @Test
    public void campoDeVideoAbreGaleriaOuCamera() {
        assertTrue(Arquivos.aceitaSoVideo(new String[] {"video/*"}));
        assertTrue(Arquivos.aceitaSoVideo(new String[] {"video/mp4", " "}));
        assertFalse(Arquivos.aceitaSoVideo(new String[] {"application/json", ".json"}));
        assertFalse(Arquivos.aceitaSoVideo(new String[] {"video/*", "image/*"}));
        assertFalse(Arquivos.aceitaSoVideo(new String[] {}));
        assertFalse(Arquivos.aceitaSoVideo(null));
    }
}
