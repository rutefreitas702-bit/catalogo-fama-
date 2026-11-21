/* Login da equipe (cozinha e gestão): o mesmo e-mail e senha do painel administrativo.
 * O que cada pessoa vê é decidido pelas regras de segurança do banco: só os dados da própria loja.
 */
(function (root) {
  'use strict';

  var CFG = root.FamaDados.SUPABASE;
  var sb = root.supabase.createClient(CFG.url, CFG.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  function $(s) { return document.querySelector(s); }
  function erroTexto(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (/JWT|expired|not authenticated/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'Sem conexão com a internet. Confira e tente de novo.';
    return 'Não foi possível concluir: ' + m;
  }
  function tela(qual) {
    $('#telaLogin').hidden = qual !== 'login';
    $('#telaPainel').hidden = qual !== 'painel';
  }

  /* opcoes.aoEntrar(loja, papel) é chamado quando a pessoa está dentro */
  function iniciar(opcoes) {
    var entrou = false;
    async function carregarLoja() {
      var r = await sb.from('administradores').select('loja_id, papel, lojas(id, nome, slug, tempo_preparo_min, fuso)').limit(1);
      if (r.error) throw r.error;
      var a = r.data && r.data[0];
      if (!a || !a.lojas || a.lojas.slug !== CFG.loja) {
        await sb.auth.signOut();
        throw new Error('Este acesso não é de um administrador da loja.');
      }
      return a;
    }
    async function abrir() {
      if (entrou) return;
      try {
        var a = await carregarLoja();
        // login da cozinha só abre a tela da cozinha
        if (opcoes.soAdministracao && a.papel === 'cozinha') { location.replace('cozinha'); return; }
        entrou = true;
        tela('painel');
        opcoes.aoEntrar(a.lojas, a.papel);
      } catch (e) {
        tela('login');
        var el = $('#loginErro'); el.hidden = false; el.textContent = e.message && /administrador/.test(e.message) ? e.message : erroTexto(e);
      }
    }

    $('#formLogin').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = $('#btnEntrar'), err = $('#loginErro');
      var email = $('#loginEmail').value.trim(), senha = $('#loginSenha').value;
      err.hidden = true;
      if (!email || !senha) { err.hidden = false; err.textContent = 'Preencha e-mail e senha.'; return; }
      btn.disabled = true; btn.textContent = 'Entrando…';
      var r = await sb.auth.signInWithPassword({ email: email, password: senha });
      btn.disabled = false; btn.textContent = 'Entrar';
      if (r.error) { err.hidden = false; err.textContent = erroTexto(r.error); return; }
      abrir();
    });
    var ver = $('[data-ver]');
    if (ver) ver.addEventListener('click', function () { var i = $('#loginSenha'); i.type = i.type === 'password' ? 'text' : 'password'; ver.textContent = i.type === 'password' ? 'Mostrar' : 'Ocultar'; });
    $('#btnSair').addEventListener('click', async function () {
      await sb.auth.signOut();
      location.reload();
    });
    sb.auth.onAuthStateChange(function (evento) { if (evento === 'SIGNED_OUT') { entrou = false; tela('login'); } });
    sb.auth.getSession().then(function (s) { if (s.data && s.data.session) abrir(); else tela('login'); });
  }

  root.FamaAcesso = { sb: sb, iniciar: iniciar, erroTexto: erroTexto };
})(window);
