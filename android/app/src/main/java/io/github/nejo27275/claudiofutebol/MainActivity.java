package io.github.nejo27275.claudiofutebol;

import android.Manifest;
import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Cláudio Futebol AI para Android: o site inteiro (pasta dist/) vai dentro do APK e roda num
 * WebView. Este código só faz a ponte com o sistema: arquivos locais, permissão da câmera,
 * escolher/gravar vídeo, "Salvar como" do backup, tela cheia e botão voltar.
 */
public final class MainActivity extends Activity {
    private static final int REQ_ESCOLHER_ARQUIVO = 1;
    private static final int REQ_SALVAR_ARQUIVO = 2;
    private static final int REQ_CAMERA_PAGINA = 3;
    private static final int REQ_CAMERA_GRAVAR = 4;
    /** Limite do texto exportado pela ponte (o backup costuma ter poucos megabytes). */
    private static final int MAX_EXPORTACAO = 50 * 1024 * 1024;

    private FrameLayout raiz;
    private WebView web;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback telaCheiaCallback;
    private ValueCallback<Uri[]> escolhaPendente;
    private PermissionRequest permissaoPendente;
    private String exportacaoPendente;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        raiz = new FrameLayout(this);
        web = new WebView(this);
        raiz.addView(web, cheio());
        setContentView(raiz);

        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        // Travas de segurança: a página só acessa os próprios arquivos (servidos pelo app) e
        // nada do sistema de arquivos, de content:// nem da localização.
        ajustes.setAllowFileAccess(false);
        ajustes.setAllowContentAccess(false);
        ajustes.setAllowFileAccessFromFileURLs(false);
        ajustes.setAllowUniversalAccessFromFileURLs(false);
        ajustes.setGeolocationEnabled(false);
        // Sem janelas/pop-ups: nada abre uma segunda WebView fora do nosso controle.
        ajustes.setSupportMultipleWindows(false);
        ajustes.setJavaScriptCanOpenWindowsAutomatically(false);
        ajustes.setSaveFormData(false);

        web.setWebViewClient(new ClienteLocal());
        web.setWebChromeClient(new ClienteChrome());
        // A ponte só é vista pelas páginas do próprio app (nenhuma outra origem é carregada aqui).
        web.addJavascriptInterface(new Ponte(), "ClaudioAndroid");

        if (estado == null || web.restoreState(estado) == null) {
            web.loadUrl(ServidorLocal.INICIO);
        }
    }

    private static FrameLayout.LayoutParams cheio() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    // ——— Páginas e endereços ———

    private final class ClienteLocal extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
            return ServidorLocal.responder(getAssets(), pedido.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
            Uri url = pedido.getUrl();
            if (ServidorLocal.ehLocal(url)) return false;
            // Links para fora do app abrem no navegador; o app em si nunca acessa a internet.
            abrirFora(url);
            return true;
        }

        @TargetApi(Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detalhe) {
            // O processo da página caiu (por exemplo, falta de memória): recria a tela em vez de
            // fechar o app. O que já foi salvo continua no aparelho.
            if (web != null) {
                raiz.removeView(web);
                web.destroy();
                web = null;
            }
            recreate();
            return true;
        }
    }

    private void abrirFora(Uri url) {
        String esquema = url.getScheme();
        if (!"https".equals(esquema) && !"http".equals(esquema) && !"mailto".equals(esquema)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            aviso("Nenhum aplicativo para abrir este link.");
        }
    }

    // ——— Câmera, arquivos e tela cheia ———

    private final class ClienteChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest pedido) {
            runOnUiThread(() -> tratarPermissao(pedido));
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest pedido) {
            if (pedido == permissaoPendente) permissaoPendente = null;
        }

        @Override
        public boolean onShowFileChooser(
                WebView view, ValueCallback<Uri[]> retorno, FileChooserParams parametros) {
            return escolherArquivo(retorno, parametros);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback retorno) {
            mostrarTelaCheia(view, retorno);
        }

        @Override
        public void onHideCustomView() {
            esconderTelaCheia();
        }
    }

    private void tratarPermissao(PermissionRequest pedido) {
        boolean querCamera = false;
        for (String recurso : pedido.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(recurso)) querCamera = true;
        }
        // Só a câmera e só para as páginas do próprio app (o microfone nunca é usado).
        if (!querCamera || !ServidorLocal.ehLocal(pedido.getOrigin())) {
            pedido.deny();
            return;
        }
        if (temPermissaoDaCamera()) {
            pedido.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            return;
        }
        if (permissaoPendente != null) permissaoPendente.deny();
        permissaoPendente = pedido;
        requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA_PAGINA);
    }

    private boolean escolherArquivo(
            ValueCallback<Uri[]> retorno, WebChromeClient.FileChooserParams parametros) {
        entregarEscolha(null);
        escolhaPendente = retorno;
        boolean video = Arquivos.aceitaSoVideo(parametros.getAcceptTypes());
        if (video && parametros.isCaptureEnabled()) {
            // "Gravar vídeo": abre o app de câmera do aparelho (precisa da permissão da câmera).
            if (temPermissaoDaCamera()) gravarVideo();
            else requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA_GRAVAR);
            return true;
        }
        // Vídeos pela galeria; o backup por qualquer tipo (muitos aparelhos não marcam .json).
        iniciarEscolha(seletor(video ? "video/*" : "*/*"));
        return true;
    }

    private static Intent seletor(String tipo) {
        return new Intent(Intent.ACTION_GET_CONTENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(tipo);
    }

    private void gravarVideo() {
        try {
            startActivityForResult(new Intent(MediaStore.ACTION_VIDEO_CAPTURE), REQ_ESCOLHER_ARQUIVO);
        } catch (ActivityNotFoundException e) {
            iniciarEscolha(seletor("video/*"));
        }
    }

    private void iniciarEscolha(Intent intent) {
        try {
            startActivityForResult(intent, REQ_ESCOLHER_ARQUIVO);
        } catch (ActivityNotFoundException e) {
            entregarEscolha(null);
            aviso("Nenhum aplicativo para escolher arquivos foi encontrado.");
        }
    }

    private void entregarEscolha(Uri[] resultado) {
        ValueCallback<Uri[]> retorno = escolhaPendente;
        escolhaPendente = null;
        if (retorno != null) retorno.onReceiveValue(resultado);
    }

    private boolean temPermissaoDaCamera() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void mostrarTelaCheia(View view, WebChromeClient.CustomViewCallback retorno) {
        if (telaCheia != null) {
            retorno.onCustomViewHidden();
            return;
        }
        telaCheia = view;
        telaCheiaCallback = retorno;
        raiz.addView(view, cheio());
        if (web != null) web.setVisibility(View.GONE);
    }

    private void esconderTelaCheia() {
        if (telaCheia == null) return;
        raiz.removeView(telaCheia);
        telaCheia = null;
        if (web != null) web.setVisibility(View.VISIBLE);
        WebChromeClient.CustomViewCallback retorno = telaCheiaCallback;
        telaCheiaCallback = null;
        if (retorno != null) retorno.onCustomViewHidden();
    }

    // ——— Ponte com a página (window.ClaudioAndroid) ———

    /** Só as páginas do próprio app são carregadas no WebView, então só elas veem a ponte. */
    private final class Ponte {
        @JavascriptInterface
        public void saveFile(String nome, String tipo, String conteudo) {
            if (conteudo == null || conteudo.length() > MAX_EXPORTACAO) return;
            String arquivo = Arquivos.nomeSeguro(nome);
            String mime = Arquivos.mimeSeguro(tipo);
            runOnUiThread(() -> salvarComo(arquivo, mime, conteudo));
        }
    }

    private void salvarComo(String arquivo, String mime, String conteudo) {
        exportacaoPendente = conteudo;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime)
                .putExtra(Intent.EXTRA_TITLE, arquivo);
        try {
            startActivityForResult(intent, REQ_SALVAR_ARQUIVO);
        } catch (ActivityNotFoundException e) {
            exportacaoPendente = null;
            aviso("Este aparelho não tem onde salvar arquivos.");
        }
    }

    // ——— Retornos do sistema ———

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == REQ_ESCOLHER_ARQUIVO) {
            Uri uri = resultado == RESULT_OK && dados != null ? dados.getData() : null;
            entregarEscolha(uri != null ? new Uri[] {uri} : null);
            return;
        }
        if (pedido == REQ_SALVAR_ARQUIVO) {
            String conteudo = exportacaoPendente;
            exportacaoPendente = null;
            Uri destino = resultado == RESULT_OK && dados != null ? dados.getData() : null;
            if (conteudo == null || destino == null) {
                aviso("Exportação cancelada.");
                return;
            }
            try (OutputStream saida = getContentResolver().openOutputStream(destino, "w")) {
                if (saida == null) throw new IOException("destino indisponível");
                saida.write(conteudo.getBytes(StandardCharsets.UTF_8));
                aviso("Arquivo salvo.");
            } catch (IOException | SecurityException e) {
                aviso("Não foi possível salvar o arquivo.");
            }
            return;
        }
        super.onActivityResult(pedido, resultado, dados);
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] permissoes, int[] resultados) {
        boolean concedida =
                resultados.length > 0 && resultados[0] == PackageManager.PERMISSION_GRANTED;
        if (pedido == REQ_CAMERA_PAGINA) {
            PermissionRequest pendente = permissaoPendente;
            permissaoPendente = null;
            if (pendente == null) return;
            if (concedida) pendente.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendente.deny();
        } else if (pedido == REQ_CAMERA_GRAVAR) {
            if (concedida) {
                gravarVideo();
            } else {
                entregarEscolha(null);
                aviso("Sem a permissão da câmera não dá para gravar. Escolha um vídeo da galeria.");
            }
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Voltar fecha a tela cheia, depois volta pelas telas do app e só então sai.
        if (telaCheia != null) {
            esconderTelaCheia();
        } else if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        // A página fica "oculta": a câmera desliga sozinha (a tela da câmera trata esse evento).
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        if (web != null) web.saveState(estado);
    }

    @Override
    protected void onDestroy() {
        if (permissaoPendente != null) {
            permissaoPendente.deny();
            permissaoPendente = null;
        }
        entregarEscolha(null);
        if (web != null) {
            raiz.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void aviso(String texto) {
        Toast.makeText(this, texto, Toast.LENGTH_LONG).show();
    }
}
