/* Painel da Fama — login e gerenciamento de produtos.
 * Usa o Supabase com a chave publicável: o que cada pessoa pode fazer é decidido pelas
 * regras de segurança do banco (só administradores da loja alteram dados).
 */
(function () {
  'use strict';

  var CFG = window.FamaDados.SUPABASE;
  var sb = window.supabase.createClient(CFG.url, CFG.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var urlMidia = window.FamaDados.urlMidia;

  var st = { loja: null, papel: null, categorias: [], produtos: [], aba: 'cardapio', busca: '', cat: '' };
  var ed = null; // produto em edição

  /* ================= utilidades ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function dinheiro(v) { return BRL.format(Number(v) || 0).replace(/ /g, ' '); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function lerPreco(v) {
    v = String(v == null ? '' : v).trim().replace(/[^\d,.-]/g, '');
    if (!v) return null;
    if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
    var n = Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }
  function precoCampo(n) { return n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','); }
  function hojeMais(dias) { var d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }

  function carregando(on, txt) { $('#carregando').hidden = !on; if (txt) $('#carregando p').textContent = txt; }
  function aviso(msg, linkSite) {
    var t = $('#toast');
    t.innerHTML = esc(msg) + (linkSite ? ' <a href="./" target="_blank" rel="noopener">Ver no site ↗</a>' : '');
    t.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function confirmar(titulo, texto, rotuloSim, perigo) {
    return new Promise(function (ok) {
      $('#confirmaTitulo').textContent = titulo;
      $('#confirmaTexto').textContent = texto;
      var sim = $('#confirmaSim'), nao = $('#confirmaNao');
      sim.textContent = rotuloSim || 'Confirmar';
      sim.className = 'btn ' + (perigo ? 'btn--perigo' : 'btn--primario');
      $('#confirma').hidden = false; sim.focus();
      function fim(v) { $('#confirma').hidden = true; sim.onclick = nao.onclick = null; ok(v); }
      sim.onclick = function () { fim(true); };
      nao.onclick = function () { fim(false); };
    });
  }
  function mensagemErro(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (/JWT|expired|not authenticated/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com a internet. Confira e tente de novo.';
    if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return 'O arquivo é grande demais (máximo 20 MB).';
    return 'Não foi possível concluir: ' + m;
  }

  /* ================= login ================= */
  function mostrarTela(qual) {
    $('#telaLogin').hidden = qual !== 'login';
    $('#telaPainel').hidden = qual !== 'painel';
  }
  function mostrarForm(qual) {
    $('#formLogin').hidden = qual !== 'login';
    $('#formEsqueci').hidden = qual !== 'esqueci';
    $('#formNovaSenha').hidden = qual !== 'nova';
  }

  $$('[data-ver]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = document.getElementById(b.dataset.ver);
      i.type = i.type === 'password' ? 'text' : 'password';
      b.textContent = i.type === 'password' ? 'Mostrar' : 'Ocultar';
    });
  });

  $('#formLogin').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#loginErro'); err.hidden = true;
    var email = $('#loginEmail').value.trim(), senha = $('#loginSenha').value;
    if (!email || !senha) { err.textContent = 'Preencha o e-mail e a senha.'; err.hidden = false; return; }
    var b = $('#btnEntrar'); b.disabled = true; b.textContent = 'Entrando…';
    var r = await sb.auth.signInWithPassword({ email: email, password: senha });
    b.disabled = false; b.textContent = 'Entrar';
    if (r.error) { err.textContent = mensagemErro(r.error); err.hidden = false; return; }
    $('#loginSenha').value = '';
    entrarNoPainel();
  });
  $('#btnEsqueci').addEventListener('click', function () { $('#esqueciEmail').value = $('#loginEmail').value; mostrarForm('esqueci'); });
  $('#btnVoltarLogin').addEventListener('click', function () { mostrarForm('login'); });
  $('#formEsqueci').addEventListener('submit', async function (e) {
    e.preventDefault();
    var m = $('#esqueciMsg'), email = $('#esqueciEmail').value.trim();
    if (!email) { m.className = 'msg msg--erro'; m.textContent = 'Digite o seu e-mail.'; m.hidden = false; return; }
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    m.className = r.error ? 'msg msg--erro' : 'msg';
    m.textContent = r.error ? mensagemErro(r.error) : 'Pronto! Se este e-mail tiver acesso, chega um link em alguns minutos. Confira também o spam.';
    m.hidden = false;
  });
  $('#formNovaSenha').addEventListener('submit', async function (e) {
    e.preventDefault();
    var m = $('#novaSenhaMsg'), senha = $('#novaSenha').value;
    if (senha.length < 8) { m.className = 'msg msg--erro'; m.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; m.hidden = false; return; }
    var r = await sb.auth.updateUser({ password: senha });
    if (r.error) { m.className = 'msg msg--erro'; m.textContent = mensagemErro(r.error); m.hidden = false; return; }
    history.replaceState(null, '', location.pathname);
    aviso('Senha nova salva!');
    entrarNoPainel();
  });
  $('#btnSair').addEventListener('click', async function () {
    await sb.auth.signOut();
    st.loja = null; mostrarForm('login'); mostrarTela('login');
  });

  async function entrarNoPainel() {
    carregando(true, 'Abrindo o painel…');
    var r = await sb.from('administradores').select('loja_id, papel, lojas(id, nome, slug)').limit(1);
    if (r.error || !r.data || !r.data.length) {
      await sb.auth.signOut();
      carregando(false); mostrarTela('login'); mostrarForm('login');
      var err = $('#loginErro');
      err.textContent = r.error ? mensagemErro(r.error) : 'Este e-mail não tem acesso ao painel da Fama. Fale com o responsável pelo site.';
      err.hidden = false;
      return;
    }
    st.loja = r.data[0].lojas; st.papel = r.data[0].papel;
    $('#topoLoja').textContent = st.loja.nome;
    mostrarTela('painel');
    await recarregar();
    carregando(false);
  }

  /* ================= dados ================= */
  async function recarregar() {
    var c = await sb.from('categorias').select('*').eq('loja_id', st.loja.id).order('ordem');
    var p = await sb.from('produtos')
      .select('*, produto_midias(*), etapas(id, grupo_id, minimo, maximo, ordem, grupos_opcoes(nome, opcoes(count)))')
      .eq('loja_id', st.loja.id).order('ordem');
    if (c.error || p.error) { aviso(mensagemErro(c.error || p.error)); return; }
    st.categorias = c.data; st.produtos = p.data;
    st.produtos.forEach(function (x) {
      x.produto_midias.sort(function (a, b) { return a.ordem - b.ordem; });
      x.etapas.sort(function (a, b) { return a.ordem - b.ordem; });
    });
    montarFiltros(); desenharLista();
  }
  function categoria(id) { return st.categorias.find(function (c) { return c.id === id; }); }
  function capa(p) { var f = p.produto_midias.find(function (m) { return m.tipo === 'foto'; }); return f ? urlMidia(f.caminho) : null; }

  /* ================= lista ================= */
  var EXPLICA = {
    cardapio: 'Produtos que aparecem para o cliente agora. Desligue "Disponível" quando acabar no estoque.',
    esgotados: 'Produtos marcados como esgotados. Não aparecem no site até você ligar "Disponível" de novo.',
    destaques: 'Produtos que aparecem na faixa "Destaques", no topo do cardápio.',
    arquivados: 'Produtos guardados que não aparecem no site. Use "Reativar" para voltar a vender.'
  };
  function naAba(p, aba) {
    if (aba === 'arquivados') return p.status === 'arquivado';
    if (p.status !== 'ativo') return false;
    if (aba === 'esgotados') return !p.disponivel;
    if (aba === 'destaques') return p.destaque;
    return p.disponivel;
  }
  function montarFiltros() {
    var sel = $('#filtroCategoria'), atual = sel.value;
    sel.innerHTML = '<option value="">Todas as categorias</option>' + st.categorias.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.nome) + (c.ativa ? '' : ' (oculta)') + '</option>';
    }).join('');
    sel.value = atual;
    ['cardapio', 'esgotados', 'destaques', 'arquivados'].forEach(function (a) {
      $('[data-conta="' + a + '"]').textContent = st.produtos.filter(function (p) { return naAba(p, a); }).length;
    });
    var ativos = st.produtos.filter(function (p) { return p.status === 'ativo'; }).length;
    $('#resumo').textContent = st.produtos.length + ' produtos cadastrados em ' + st.categorias.length + ' categorias';
  }
  function precoTexto(p) {
    if (p.preco_promocional != null && Number(p.preco_promocional) > 0) return '<s>' + dinheiro(p.preco) + '</s> ' + dinheiro(p.preco_promocional);
    if (Number(p.preco) > 0) return dinheiro(p.preco);
    return p.etapas.length ? '<span class="item__meta">Preço nas opções</span>' : dinheiro(0);
  }
  function desenharLista() {
    $('#explicaAba').textContent = EXPLICA[st.aba];
    var q = norm(st.busca);
    var lista = st.produtos.filter(function (p) {
      return naAba(p, st.aba) && (!st.cat || String(p.categoria_id) === st.cat) && (!q || norm(p.nome + ' ' + (p.descricao || '')).indexOf(q) >= 0);
    });
    if (st.aba === 'destaques') lista.sort(function (a, b) { return (a.destaque_ordem || 999) - (b.destaque_ordem || 999); });
    else lista.sort(function (a, b) {
      var ca = categoria(a.categoria_id), cb = categoria(b.categoria_id);
      return ((ca ? ca.ordem : 0) - (cb ? cb.ordem : 0)) || (a.ordem - b.ordem);
    });
    if (!lista.length) {
      $('#lista').innerHTML = '<div class="vazio">' + (q || st.cat ? 'Nenhum produto encontrado com esse filtro.' : 'Nada por aqui ainda.') + '</div>';
      return;
    }
    $('#lista').innerHTML = lista.map(function (p) {
      var c = categoria(p.categoria_id), f = capa(p);
      var selos = [];
      if (p.status === 'arquivado') selos.push('<span class="selo selo--arquivado">Arquivado</span>');
      else if (!p.disponivel) selos.push('<span class="selo selo--esgotado">Esgotado</span>');
      if (p.destaque) selos.push('<span class="selo selo--destaque">⭐ Destaque</span>');
      if (p.novidade) selos.push('<span class="selo selo--novo">Novo</span>');
      var ativo = p.status === 'ativo';
      return '<div class="item">' +
        '<div class="item__foto">' + (f ? '<img src="' + esc(f) + '" alt="" loading="lazy" width="64" height="64">' : '🍔') + '</div>' +
        '<button type="button" class="item__info" data-editar="' + p.id + '" aria-label="Editar ' + esc(p.nome) + '">' +
          '<span class="item__nome">' + esc(p.nome) + '</span>' +
          '<span class="item__meta">' + esc(c ? c.nome : 'Sem categoria') + '</span>' +
          '<span class="item__preco">' + precoTexto(p) + '</span>' +
          (selos.length ? '<span class="item__selos">' + selos.join('') + '</span>' : '') +
        '</button>' +
        '<div class="item__acoes">' +
          (ativo ? '<label class="mini-chave" title="Disponível hoje"><input type="checkbox" data-disp="' + p.id + '"' + (p.disponivel ? ' checked' : '') + '><span class="chave__trilho"></span><span>Disponível</span></label>' : '') +
          '<div class="menu"><button type="button" class="btn-icone" data-menu="' + p.id + '" aria-label="Mais ações para ' + esc(p.nome) + '" aria-haspopup="true">⋯</button>' +
            '<div class="menu__lista" hidden>' +
              '<button type="button" data-acao="editar" data-id="' + p.id + '">✏️ Editar</button>' +
              '<button type="button" data-acao="duplicar" data-id="' + p.id + '">📄 Duplicar</button>' +
              (ativo ? '<button type="button" data-acao="arquivar" data-id="' + p.id + '">🗄️ Arquivar</button>'
                     : '<button type="button" data-acao="reativar" data-id="' + p.id + '">♻️ Reativar</button>' +
                       '<button type="button" class="perigo" data-acao="excluir" data-id="' + p.id + '">🗑️ Excluir para sempre</button>') +
            '</div></div>' +
        '</div></div>';
    }).join('');
  }
  function fecharMenus() { $$('.menu__lista').forEach(function (m) { m.hidden = true; }); }

  $('#abas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-aba]'); if (!b) return;
    st.aba = b.dataset.aba;
    $$('.aba').forEach(function (x) { x.classList.toggle('is-ativa', x === b); x.setAttribute('aria-selected', x === b); });
    desenharLista();
  });
  $('#busca').addEventListener('input', function (e) { st.busca = e.target.value; desenharLista(); });
  $('#filtroCategoria').addEventListener('change', function (e) { st.cat = e.target.value; desenharLista(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) fecharMenus(); });

  $('#lista').addEventListener('click', function (e) {
    var ed1 = e.target.closest('[data-editar]');
    if (ed1) { abrirEditor(Number(ed1.dataset.editar)); return; }
    var m = e.target.closest('[data-menu]');
    if (m) { var l = m.nextElementSibling, aberto = !l.hidden; fecharMenus(); l.hidden = aberto; return; }
    var a = e.target.closest('[data-acao]');
    if (a) { fecharMenus(); acao(a.dataset.acao, Number(a.dataset.id)); }
  });
  $('#lista').addEventListener('change', async function (e) {
    var t = e.target; if (!t.dataset.disp) return;
    var id = Number(t.dataset.disp), p = st.produtos.find(function (x) { return x.id === id; });
    var r = await sb.from('produtos').update({ disponivel: t.checked }).eq('id', id).select('id').single();
    if (r.error) { t.checked = !t.checked; aviso(mensagemErro(r.error)); return; }
    p.disponivel = t.checked;
    aviso(t.checked ? '"' + p.nome + '" voltou para o site.' : '"' + p.nome + '" marcado como esgotado e saiu do site.', true);
    montarFiltros(); setTimeout(desenharLista, 600);
  });

  async function acao(qual, id) {
    var p = st.produtos.find(function (x) { return x.id === id; }); if (!p) return;
    if (qual === 'editar') return abrirEditor(id);
    if (qual === 'arquivar') {
      if (!(await confirmar('Arquivar produto?', '"' + p.nome + '" sai do site, mas fica guardado com fotos e preços. Você pode reativar quando quiser.', 'Arquivar'))) return;
      return mudarStatus(p, 'arquivado', 'Arquivado. Está na aba "Arquivados".');
    }
    if (qual === 'reativar') return mudarStatus(p, 'ativo', '"' + p.nome + '" voltou para o cardápio!');
    if (qual === 'duplicar') return duplicar(p);
    if (qual === 'excluir') {
      if (!(await confirmar('Excluir para sempre?', '"' + p.nome + '" e as fotos dele serão apagados e não dá para desfazer. Se você só quer tirar do site, use "Arquivar".', 'Excluir para sempre', true))) return;
      return excluir(p);
    }
  }
  async function mudarStatus(p, status, msg) {
    carregando(true, 'Salvando…');
    var r = await sb.from('produtos').update({ status: status }).eq('id', p.id).select('id').single();
    carregando(false);
    if (r.error) return aviso(mensagemErro(r.error));
    aviso(msg, true); await recarregar();
  }
  async function duplicar(p) {
    carregando(true, 'Duplicando…');
    var copia = {
      loja_id: p.loja_id, categoria_id: p.categoria_id, nome: (p.nome + ' (cópia)').slice(0, 160), chamada: p.chamada, descricao: p.descricao,
      ingredientes: p.ingredientes, diferenciais: p.diferenciais, info_adicional: p.info_adicional, preco: p.preco,
      preco_promocional: p.preco_promocional, preco_minimo: p.preco_minimo, preco_minimo_dia: p.preco_minimo_dia,
      status: 'ativo', disponivel: false, destaque: false, novidade: false, max_por_pedido: p.max_por_pedido,
      fora_do_ar: p.fora_do_ar, ordem: p.ordem + 1, descricao_origem: p.descricao_origem
    };
    var r = await sb.from('produtos').insert(copia).select('id').single();
    if (r.error) { carregando(false); return aviso(mensagemErro(r.error)); }
    var novo = r.data.id;
    if (p.produto_midias.length) {
      await sb.from('produto_midias').insert(p.produto_midias.map(function (m) {
        return { loja_id: p.loja_id, produto_id: novo, tipo: m.tipo, caminho: m.caminho, ordem: m.ordem, legenda: m.legenda };
      }));
    }
    if (p.etapas.length) {
      await sb.from('etapas').insert(p.etapas.map(function (e) {
        return { loja_id: p.loja_id, produto_id: novo, grupo_id: e.grupo_id, ordem: e.ordem, minimo: e.minimo, maximo: e.maximo };
      }));
    }
    await recarregar(); carregando(false);
    aviso('Cópia criada como "esgotada". Revise e ligue "Disponível hoje" quando estiver pronta.');
    abrirEditor(novo);
  }
  async function apagarArquivosSemUso(caminhos) {
    var proprios = caminhos.filter(function (c) { return c && c.indexOf('assets/') !== 0 && !/^https?:/.test(c); });
    if (!proprios.length) return;
    var r = await sb.from('produto_midias').select('caminho').in('caminho', proprios);
    var emUso = (r.data || []).map(function (x) { return x.caminho; });
    var apagar = proprios.filter(function (c) { return emUso.indexOf(c) < 0; });
    if (apagar.length) await sb.storage.from(CFG.bucket).remove(apagar);
  }
  async function excluir(p) {
    carregando(true, 'Excluindo…');
    var caminhos = p.produto_midias.map(function (m) { return m.caminho; });
    var r = await sb.from('produtos').delete().eq('id', p.id).select('id');
    if (r.error || !r.data.length) { carregando(false); return aviso(r.error ? mensagemErro(r.error) : 'Não foi possível excluir.'); }
    // some da lista na hora; as fotos são apagadas em seguida
    st.produtos = st.produtos.filter(function (x) { return x.id !== p.id; });
    montarFiltros(); desenharLista(); carregando(false);
    aviso('Produto excluído.');
    await apagarArquivosSemUso(caminhos);
  }

  /* ================= editor ================= */
  $('#btnNovo').addEventListener('click', function () { abrirEditor(null); });

  function abrirEditor(id) {
    var p = id ? st.produtos.find(function (x) { return x.id === id; }) : null;
    var cat0 = st.cat ? Number(st.cat) : (st.categorias.find(function (c) { return c.ativa; }) || st.categorias[0] || {}).id;
    ed = {
      id: p ? p.id : null, original: p, passo: 0, alterado: false,
      ingredientes: p ? (p.ingredientes || []).slice() : [], diferenciais: p ? (p.diferenciais || []).slice() : [],
      fotos: p ? p.produto_midias.filter(function (m) { return m.tipo === 'foto'; }).map(function (m) { return { id: m.id, caminho: m.caminho, url: urlMidia(m.caminho) }; }) : [],
      video: p ? (function (m) { return m ? { id: m.id, caminho: m.caminho, url: urlMidia(m.caminho) } : null; })(p.produto_midias.find(function (m) { return m.tipo === 'video'; })) : null,
      link: p ? (function (m) { return m ? { id: m.id, url: m.caminho } : null; })(p.produto_midias.find(function (m) { return m.tipo === 'link'; })) : null,
      removidas: []
    };
    $('#editorTitulo').textContent = p ? 'Editar produto' : 'Novo produto';
    $('#pCategoria').innerHTML = st.categorias.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + (c.ativa ? '' : ' (oculta)') + '</option>'; }).join('');
    $('#pNome').value = p ? p.nome : '';
    $('#pChamada').value = p ? (p.chamada || '') : '';
    $('#pCategoria').value = p ? p.categoria_id : cat0;
    $('#pPreco').value = p ? precoCampo(p.preco) : '';
    $('#pPromo').value = p ? precoCampo(p.preco_promocional) : '';
    $('#pDescricao').value = p ? (p.descricao || '') : '';
    $('#pInfo').value = p ? (p.info_adicional || '') : '';
    $('#pLinkVideo').value = ed.link ? ed.link.url : '';
    $('#pDisponivel').checked = p ? p.disponivel : true;
    $('#pDestaque').checked = p ? p.destaque : false;
    $('#pNovidade').checked = p ? p.novidade : !p;
    $('#pNovidadeAte').value = p ? (p.novidade_ate || '') : hojeMais(14);
    $('#campoNovidadeAte').hidden = !$('#pNovidade').checked;
    $('#editorErro').hidden = true;
    desenharEtiquetas(); desenharFotos(); desenharVideo(); desenharOpcoes(); irPasso(0); previa();
    $('#editor').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#pNome').focus(); }, 50);
  }
  async function fecharEditor(forcar) {
    if (!forcar && ed && ed.alterado && !(await confirmar('Sair sem salvar?', 'As mudanças que você fez neste produto serão perdidas.', 'Sair sem salvar', true))) return;
    $('#editor').hidden = true; document.body.style.overflow = ''; ed = null;
  }
  $('#editorFechar').addEventListener('click', function () { fecharEditor(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#editor').hidden && $('#confirma').hidden) fecharEditor(false); });

  function irPasso(n) {
    ed.passo = n;
    $$('.etapa').forEach(function (s) { s.hidden = Number(s.dataset.etapa) !== n; });
    $$('.passo').forEach(function (b) { var i = Number(b.dataset.passo); b.classList.toggle('is-atual', i === n); b.classList.toggle('is-feito', i < n); });
    $('#editorVoltar').style.visibility = n === 0 ? 'hidden' : 'visible';
    $('#editorAvancar').hidden = n === 3;
    $('.editor__corpo').scrollTop = 0;
  }
  $('#passos').addEventListener('click', function (e) { var b = e.target.closest('[data-passo]'); if (b) irPasso(Number(b.dataset.passo)); });
  $('#editorVoltar').addEventListener('click', function () { irPasso(Math.max(0, ed.passo - 1)); });
  $('#editorAvancar').addEventListener('click', function () { irPasso(Math.min(3, ed.passo + 1)); });

  $('#formProduto').addEventListener('input', function (e) {
    if (!ed) return; ed.alterado = true;
    if (e.target.id === 'pDescricao') $('#contaDescricao').textContent = e.target.value.length;
    previa();
  });
  $('#formProduto').addEventListener('change', function (e) {
    if (!ed) return; ed.alterado = true;
    if (e.target.id === 'pNovidade') { $('#campoNovidadeAte').hidden = !e.target.checked; if (e.target.checked && !$('#pNovidadeAte').value) $('#pNovidadeAte').value = hojeMais(14); }
    previa();
  });
  $('#formProduto').addEventListener('submit', function (e) { e.preventDefault(); });

  /* etiquetas: ingredientes e diferenciais */
  function desenharEtiquetas() {
    [['ingredientes', '#pIngredientes'], ['diferenciais', '#pDiferenciais']].forEach(function (par) {
      $(par[1]).innerHTML = ed[par[0]].map(function (t, i) {
        return '<span class="etiqueta">' + esc(t) + '<button type="button" data-tirar="' + par[0] + '|' + i + '" aria-label="Remover ' + esc(t) + '">✕</button></span>';
      }).join('');
    });
  }
  function ligarEtiqueta(input, lista) {
    $(input).addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      var v = e.target.value.replace(/,/g, '').trim();
      if (v && ed[lista].indexOf(v) < 0) { ed[lista].push(v.slice(0, 60)); ed.alterado = true; desenharEtiquetas(); }
      e.target.value = '';
    });
    $(input).addEventListener('blur', function (e) {
      var v = e.target.value.replace(/,/g, '').trim();
      if (v && ed && ed[lista].indexOf(v) < 0) { ed[lista].push(v.slice(0, 60)); ed.alterado = true; desenharEtiquetas(); }
      e.target.value = '';
    });
  }
  ligarEtiqueta('#pIngredienteNovo', 'ingredientes');
  ligarEtiqueta('#pDiferencialNovo', 'diferenciais');
  $('#formProduto').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tirar]'); if (!b) return;
    var pr = b.dataset.tirar.split('|'); ed[pr[0]].splice(Number(pr[1]), 1); ed.alterado = true; desenharEtiquetas();
  });

  /* fotos */
  function desenharFotos() {
    $('#fotos').innerHTML = ed.fotos.map(function (f, i) {
      return '<div class="foto' + (i === 0 ? ' is-capa' : '') + '">' +
        '<img src="' + esc(f.url) + '" alt="Foto ' + (i + 1) + '">' +
        (i === 0 ? '<span class="foto__selo">Capa</span>' : '') +
        '<div class="foto__acoes">' +
          (i > 0 ? '<button type="button" data-foto="capa|' + i + '" title="Usar como capa" aria-label="Usar como capa">⭐</button>' : '<span></span>') +
          '<button type="button" data-foto="tirar|' + i + '" title="Remover foto" aria-label="Remover foto">🗑️</button>' +
        '</div></div>';
    }).join('');
  }
  $('#fotos').addEventListener('click', function (e) {
    var b = e.target.closest('[data-foto]'); if (!b) return;
    var pr = b.dataset.foto.split('|'), i = Number(pr[1]);
    if (pr[0] === 'capa') { var f = ed.fotos.splice(i, 1)[0]; ed.fotos.unshift(f); }
    if (pr[0] === 'tirar') { var t = ed.fotos.splice(i, 1)[0]; if (t.id) ed.removidas.push(t); }
    ed.alterado = true; desenharFotos(); previa();
  });
  async function comprimir(arquivo) {
    var MAX = 1400, Q = 0.82, fonte, w, h;
    try { fonte = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); w = fonte.width; h = fonte.height; }
    catch (e) {
      fonte = await new Promise(function (ok, erro) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = erro; im.src = URL.createObjectURL(arquivo); });
      w = fonte.naturalWidth; h = fonte.naturalHeight;
    }
    var s = Math.min(1, MAX / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(fonte, 0, 0, c.width, c.height);
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/webp', Q); });
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', Q); });
    return blob;
  }
  $('#inputFotos').addEventListener('change', async function (e) {
    var arqs = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
    if (!arqs.length) return;
    carregando(true, 'Preparando ' + (arqs.length > 1 ? arqs.length + ' fotos' : 'a foto') + '…');
    for (var i = 0; i < arqs.length; i++) {
      if (!/^image\//.test(arqs[i].type)) { aviso('"' + arqs[i].name + '" não é uma foto.'); continue; }
      try {
        var blob = await comprimir(arqs[i]);
        ed.fotos.push({ blob: blob, url: URL.createObjectURL(blob) });
      } catch (err) { aviso('Não consegui ler "' + arqs[i].name + '". Tente outra foto (JPG ou PNG).'); }
    }
    carregando(false); ed.alterado = true; desenharFotos(); previa();
  });

  /* vídeo */
  function desenharVideo() {
    var v = ed.video;
    $('#videoAtual').innerHTML = v ? '<video src="' + esc(v.url) + '" controls playsinline preload="metadata"></video>' +
      '<div class="video__linha"><span>' + (v.arquivo ? 'Vídeo novo (será enviado ao salvar)' : 'Vídeo do produto') + '</span><button type="button" class="btn-link" id="tirarVideo">Remover vídeo</button></div>' : '';
  }
  $('#inputVideo').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { aviso('Esse vídeo tem ' + Math.round(f.size / 1048576) + ' MB. O máximo é 20 MB: use um vídeo mais curto.'); return; }
    if (ed.video && ed.video.id) ed.removidas.push(ed.video);
    ed.video = { arquivo: f, url: URL.createObjectURL(f) }; ed.alterado = true; desenharVideo();
  });
  $('#videoAtual').addEventListener('click', function (e) {
    if (e.target.id !== 'tirarVideo') return;
    if (ed.video && ed.video.id) ed.removidas.push(ed.video);
    ed.video = null; ed.alterado = true; desenharVideo();
  });

  /* opções (somente leitura nesta etapa) */
  function desenharOpcoes() {
    var et = ed.original ? ed.original.etapas : [];
    $('#opcoesResumo').innerHTML = et.length ? et.map(function (e) {
      var g = e.grupos_opcoes || {}, n = (g.opcoes && g.opcoes[0] && g.opcoes[0].count) || 0;
      var regra = e.minimo === e.maximo ? 'escolhe ' + e.minimo : (e.minimo ? 'escolhe de ' + e.minimo + ' a ' + e.maximo : 'opcional, até ' + e.maximo);
      return '<div class="grupo"><b>' + esc(g.nome || 'Grupo') + '</b><small>' + regra + ' · ' + n + ' opções</small></div>';
    }).join('') : '<div class="grupo"><b>Sem escolhas</b><small>O cliente pede este produto direto, sem escolher tamanho ou adicionais.</small></div>';
  }

  /* prévia do card */
  function previa() {
    var f = ed.fotos[0], preco = lerPreco($('#pPreco').value), promo = lerPreco($('#pPromo').value);
    var precoHtml = (promo && promo > 0 && preco > 0) ? '<s>' + dinheiro(preco) + '</s>' + dinheiro(promo)
      : (preco > 0 ? dinheiro(preco) : '<span class="ajuda">Preço pelas opções</span>');
    $('#previa').innerHTML =
      '<div class="previa__img">' + (f ? '<img src="' + esc(f.url) + '" alt="">' : 'Sem foto') + '</div>' +
      '<div class="previa__corpo">' +
        ($('#pNovidade').checked ? '<span class="selo selo--novo" style="justify-self:start">Novo</span>' : '') +
        '<h3>' + esc($('#pNome').value || 'Nome do produto') + '</h3>' +
        ($('#pChamada').value ? '<span class="previa__chamada">' + esc($('#pChamada').value) + '</span>' : '') +
        ($('#pDescricao').value ? '<p class="previa__desc">' + esc($('#pDescricao').value) + '</p>' : '') +
        '<span class="previa__preco">' + precoHtml + '</span>' +
        (!$('#pDisponivel').checked ? '<span class="selo selo--esgotado" style="justify-self:start">Esgotado (fora do site)</span>' : '') +
      '</div>';
  }

  /* salvar */
  function erroEditor(msg, passo) {
    var e = $('#editorErro'); e.textContent = msg; e.hidden = false;
    if (passo != null) irPasso(passo);
  }
  async function salvar() {
    if (!ed) return;
    $('#editorErro').hidden = true;
    var nome = $('#pNome').value.trim(), preco = lerPreco($('#pPreco').value), promo = lerPreco($('#pPromo').value);
    if (!nome) return erroEditor('Escreva o nome do produto.', 0);
    if (!$('#pCategoria').value) return erroEditor('Escolha a categoria.', 0);
    if (Number.isNaN(preco)) return erroEditor('O preço está estranho. Escreva só números, por exemplo 25,90.', 0);
    if (Number.isNaN(promo)) return erroEditor('O preço promocional está estranho. Escreva só números, por exemplo 22,90.', 0);
    if (promo != null && promo > 0 && (preco || 0) > 0 && promo >= preco) return erroEditor('O preço promocional precisa ser menor que o preço normal.', 0);
    var link = $('#pLinkVideo').value.trim();
    if (link && !/^https:\/\/\S+$/.test(link)) return erroEditor('O link do vídeo precisa começar com https://', 1);

    var p = ed.original, destaque = $('#pDestaque').checked;
    var dados = {
      loja_id: st.loja.id, categoria_id: Number($('#pCategoria').value), nome: nome,
      chamada: $('#pChamada').value.trim() || null, descricao: $('#pDescricao').value.trim() || null,
      ingredientes: ed.ingredientes, diferenciais: ed.diferenciais, info_adicional: $('#pInfo').value.trim() || null,
      preco: preco || 0, preco_promocional: promo > 0 ? promo : null,
      disponivel: $('#pDisponivel').checked, destaque: destaque,
      novidade: $('#pNovidade').checked, novidade_ate: $('#pNovidade').checked ? ($('#pNovidadeAte').value || null) : null
    };
    if (destaque && (!p || !p.destaque)) {
      dados.destaque_ordem = st.produtos.reduce(function (m, x) { return x.destaque ? Math.max(m, x.destaque_ordem || 0) : m; }, -1) + 1;
    }
    if (p && p.descricao_origem === 'importada' && (dados.descricao || '') !== (p.descricao || '')) dados.descricao_origem = 'manual';
    if (!p) {
      dados.status = 'ativo';
      dados.ordem = st.produtos.filter(function (x) { return x.categoria_id === dados.categoria_id; }).reduce(function (m, x) { return Math.max(m, x.ordem); }, -1) + 1;
    }

    $$('#editorSalvar, #editorSalvarTopo').forEach(function (b) { b.disabled = true; });
    carregando(true, 'Salvando…');
    try {
      var r = p ? await sb.from('produtos').update(dados).eq('id', p.id).select('id').single()
                : await sb.from('produtos').insert(dados).select('id').single();
      if (r.error) throw r.error;
      var id = r.data.id;
      ed.id = id;

      // fotos/vídeo removidos
      if (ed.removidas.length) {
        var ids = ed.removidas.map(function (m) { return m.id; });
        var d = await sb.from('produto_midias').delete().in('id', ids);
        if (d.error) throw d.error;
        await apagarArquivosSemUso(ed.removidas.map(function (m) { return m.caminho; }));
      }
      // fotos novas: envia e cadastra
      for (var i = 0; i < ed.fotos.length; i++) {
        var f = ed.fotos[i];
        if (f.blob) {
          carregando(true, 'Enviando foto ' + (i + 1) + ' de ' + ed.fotos.length + '…');
          var ext = f.blob.type === 'image/webp' ? 'webp' : 'jpg';
          var caminho = st.loja.id + '/produtos/' + id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
          var up = await sb.storage.from(CFG.bucket).upload(caminho, f.blob, { contentType: f.blob.type, cacheControl: '31536000', upsert: false });
          if (up.error) throw up.error;
          var ins = await sb.from('produto_midias').insert({ loja_id: st.loja.id, produto_id: id, tipo: 'foto', caminho: caminho, ordem: i }).select('id').single();
          if (ins.error) throw ins.error;
          f.id = ins.data.id; f.caminho = caminho; delete f.blob;
        }
      }
      // ordem das fotos (a primeira é a capa)
      for (var j = 0; j < ed.fotos.length; j++) {
        if (ed.fotos[j].id) await sb.from('produto_midias').update({ ordem: j }).eq('id', ed.fotos[j].id);
      }
      // vídeo novo
      if (ed.video && ed.video.arquivo) {
        carregando(true, 'Enviando o vídeo…');
        var vf = ed.video.arquivo, vext = (vf.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
        var vcam = st.loja.id + '/produtos/' + id + '/video-' + Date.now() + '.' + vext;
        var vu = await sb.storage.from(CFG.bucket).upload(vcam, vf, { contentType: vf.type || 'video/mp4', cacheControl: '31536000', upsert: false });
        if (vu.error) throw vu.error;
        var vi = await sb.from('produto_midias').insert({ loja_id: st.loja.id, produto_id: id, tipo: 'video', caminho: vcam, ordem: 100 });
        if (vi.error) throw vi.error;
      }
      // link de vídeo (Instagram/YouTube)
      var linkAntigo = ed.link ? ed.link.url : '';
      if (link !== linkAntigo) {
        if (ed.link && ed.link.id) await sb.from('produto_midias').delete().eq('id', ed.link.id);
        if (link) {
          var li = await sb.from('produto_midias').insert({ loja_id: st.loja.id, produto_id: id, tipo: 'link', caminho: link, ordem: 200 });
          if (li.error) throw li.error;
        }
      }
      ed.alterado = false;
      await recarregar();
      carregando(false);
      fecharEditor(true);
      aviso(dados.disponivel ? 'Salvo! Já está no site.' : 'Salvo! Está como esgotado, fora do site.', dados.disponivel);
    } catch (e) {
      carregando(false);
      erroEditor(mensagemErro(e));
      if (!p && ed.id) { ed.original = null; } // produto já criado: um novo "Salvar" atualiza em vez de duplicar
      if (ed.id && !ed.original) { await recarregar(); ed.original = st.produtos.find(function (x) { return x.id === ed.id; }) || null; }
    } finally {
      $$('#editorSalvar, #editorSalvarTopo').forEach(function (b) { b.disabled = false; });
    }
  }
  $('#editorSalvar').addEventListener('click', salvar);
  $('#editorSalvarTopo').addEventListener('click', salvar);

  /* ================= início ================= */
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === 'PASSWORD_RECOVERY') { mostrarTela('login'); mostrarForm('nova'); }
    if (evento === 'SIGNED_OUT') { mostrarTela('login'); mostrarForm('login'); }
  });
  (async function () {
    carregando(true, 'Carregando…');
    var s = await sb.auth.getSession();
    carregando(false);
    var recuperando = /type=recovery/.test(location.hash);
    if (recuperando) { mostrarTela('login'); mostrarForm('nova'); return; }
    if (s.data && s.data.session) entrarNoPainel();
    else { mostrarTela('login'); mostrarForm('login'); }
  })();
})();
