// Executado apenas por navegadores antigos que não suportam módulos JavaScript.
(function () {
  var boot = document.getElementById('boot');
  if (boot) {
    boot.innerHTML = '';
    var p = document.createElement('p');
    p.textContent =
      'Este navegador é muito antigo para o Cláudio Futebol AI. Atualize o Google Chrome ' +
      '(ou outro navegador moderno) pela loja de aplicativos e abra a página novamente.';
    boot.appendChild(p);
  }
})();
