/* Tela da cozinha: pedidos do salão (QR Code da mesa) e do delivery, por etapa.
 * Atualiza sozinha a cada poucos segundos e toca um alerta quando chega pedido novo.
 */
(function () {
  'use strict';

  var sb = window.FamaAcesso.sb;
  var loja = null;
  var pedidos = [];
  var vistos = null;          // ids já conhecidos (para tocar o alerta só nos novos)
  var somLigado = false;
  var abaCel = 'novo';
  var ocupado = {};           // pedidos com ação em andamento
  var INTERVALO = 6000;
  var desenhados = {};       // cartões já mostrados (animação de entrada só uma vez)

  var COLUNAS = [
    { st: 'aguardando', titulo: 'Confirmar', dica: 'Delivery: confirme no WhatsApp antes de preparar' },
    { st: 'novo', titulo: 'Novos', dica: 'Prontos para começar' },
    { st: 'preparando', titulo: 'Em preparo', dica: '' },
    { st: 'pronto', titulo: 'Prontos', dica: 'Aguardando entrega ou retirada' }
  ];

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function dinheiro(v) { return BRL.format(Number(v) || 0).replace(/\u0020/g, '\u0020'); }
  function hora(d) { return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function minutos(desde) { return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000)); }
  function aviso(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { t.hidden = true; }, 3500);
  }

  /* ---------- alerta sonoro (o navegador só libera som depois de um toque na tela) ---------- */
  var audio = null;
  function bip() {
    if (!somLigado) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach(function (t, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'square'; o.frequency.value = i === 2 ? 1320 : 990;
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
        o.connect(g); g.connect(audio.destination);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
      });
    } catch (e) { /* sem áudio */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  function ligarSom(on) {
    somLigado = on;
    try { localStorage.setItem('fama-cozinha-som', on ? '1' : '0'); } catch (e) { /* ok */ }
    var b = $('#btnSom');
    b.textContent = on ? '🔔 Som ligado' : '🔇 Som desligado';
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
    if (on) { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.resume) audio.resume(); }
  }

  /* ---------- dados ---------- */
  async function carregar() {
    var desde = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    var r = await sb.from('pedidos')
      .select('id, numero, origem, modo, mesa_numero, cliente_nome, endereco, bairro, pagamento, observacao, cupom, subtotal, taxa_entrega, taxa_a_confirmar, desconto, total, status, tempo_estimado_min, criado_em, confirmado_em, preparo_em, pronto_em, pedido_itens(nome, quantidade, opcoes, observacao, ordem)')
      .eq('loja_id', loja.id)
      .in('status', ['aguardando', 'novo', 'preparando', 'pronto'])
      .gte('criado_em', desde)
      .order('criado_em', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function atualizar() {
    try {
      var lista = await carregar();
      $('#conexao').hidden = true;
      var novos = lista.filter(function (p) { return (p.status === 'aguardando' || p.status === 'novo') && vistos && !vistos[p.id]; });
      vistos = vistos || {};
      lista.forEach(function (p) { vistos[p.id] = true; });
      pedidos = lista;
      desenhar();
      if (novos.length) {
        bip();
        aviso(novos.length === 1 ? 'Pedido nº ' + novos[0].numero + ' chegou!' : novos.length + ' pedidos novos chegaram!');
        document.title = '(' + novos.length + ') Pedido novo · Cozinha';
        setTimeout(function () { document.title = 'Cozinha · Fama Burguer e Pizzaria'; }, 8000);
      }
    } catch (e) {
      var c = $('#conexao'); c.hidden = false; c.textContent = 'Sem conexão com o sistema. Tentando de novo… (' + window.FamaAcesso.erroTexto(e) + ')';
    }
  }

  /* ---------- desenho ---------- */
  function origemTag(p) {
    if (p.origem === 'mesa') return '<span class="tag tag--mesa">Mesa ' + p.mesa_numero + '</span>';
    return '<span class="tag tag--' + p.modo + '">' + ({ entrega: 'Entrega', retirada: 'Retirada', local: 'No local' })[p.modo] + '</span>';
  }
  function opcoesTexto(ops) {
    var porGrupo = {}, ordem = [];
    (ops || []).forEach(function (o) {
      if (!porGrupo[o.grupo]) { porGrupo[o.grupo] = []; ordem.push(o.grupo); }
      porGrupo[o.grupo].push((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome);
    });
    return ordem.map(function (g) { return '<li><span>' + esc(g) + ':</span> ' + esc(porGrupo[g].join(', ')) + '</li>'; }).join('');
  }
  function cartao(p) {
    var itens = (p.pedido_itens || []).slice().sort(function (a, b) { return a.ordem - b.ordem; });
    var desde = p.status === 'preparando' ? p.preparo_em : p.criado_em;
    var min = minutos(desde || p.criado_em);
    var atrasado = p.status === 'preparando' && min > p.tempo_estimado_min;
    var esperando = (p.status === 'novo' || p.status === 'aguardando') && min >= 10;
    var acoes = '';
    if (p.status === 'aguardando') acoes = '<button class="btn btn--secundario" data-acao="novo">Confirmar pedido</button><button class="btn-link perigo" data-acao="cancelado">Cancelar</button>';
    if (p.status === 'novo') acoes = '<button class="btn btn--primario" data-acao="preparando">Começar preparo</button><button class="btn-link perigo" data-acao="cancelado">Cancelar</button>';
    if (p.status === 'preparando') acoes = '<div class="tempo"><button class="btn-icone" data-tempo="-5" aria-label="Menos 5 minutos">−</button><span>' + p.tempo_estimado_min + ' min</span><button class="btn-icone" data-tempo="5" aria-label="Mais 5 minutos">+</button></div><button class="btn btn--ok" data-acao="pronto">Pronto</button>';
    if (p.status === 'pronto') acoes = '<button class="btn btn--fantasma" data-acao="entregue">' + (p.origem === 'mesa' ? 'Entregue na mesa' : p.modo === 'entrega' ? 'Saiu para entrega' : 'Entregue ao cliente') + '</button>';
    var novoNaTela = !desenhados[p.id + p.status]; desenhados[p.id + p.status] = true;
    return '<article class="ped' + (novoNaTela ? ' is-entrando' : '') + (atrasado ? ' is-atrasado' : '') + (esperando ? ' is-esperando' : '') + (ocupado[p.id] ? ' is-ocupado' : '') + '" data-id="' + p.id + '">' +
      '<header><b class="ped__num">#' + p.numero + '</b>' + origemTag(p) + '<span class="ped__tempo" title="Tempo nesta etapa">' + min + ' min</span></header>' +
      '<p class="ped__cli">' + esc(p.cliente_nome) + ' · ' + hora(p.criado_em) + '</p>' +
      '<ul class="ped__itens">' + itens.map(function (i) {
        return '<li><b>' + i.quantidade + '×</b> ' + esc(i.nome) + (i.opcoes && i.opcoes.length ? '<ul>' + opcoesTexto(i.opcoes) + '</ul>' : '') +
          (i.observacao ? '<p class="ped__obs">⚠ ' + esc(i.observacao) + '</p>' : '') + '</li>';
      }).join('') + '</ul>' +
      (p.observacao ? '<p class="ped__obs ped__obs--geral">Obs.: ' + esc(p.observacao) + '</p>' : '') +
      (p.modo === 'entrega' ? '<p class="ped__end">📍 ' + esc([p.endereco, p.bairro].filter(Boolean).join(' – ')) + '</p>' : '') +
      (p.origem === 'delivery' ? '<p class="ped__pag">' + esc(p.pagamento || '') + ' · <b>' + dinheiro(p.total) + '</b>' + (p.taxa_a_confirmar ? ' + taxa' : '') + '</p>' : '<p class="ped__pag">Paga no caixa · <b>' + dinheiro(p.total) + '</b></p>') +
      '<footer>' + acoes + '<button class="btn-link" data-imprimir>Imprimir</button></footer></article>';
  }
  function desenhar() {
    var porSt = {};
    COLUNAS.forEach(function (c) { porSt[c.st] = []; });
    pedidos.forEach(function (p) { if (porSt[p.status]) porSt[p.status].push(p); });
    $('#kdsAbas').innerHTML = COLUNAS.map(function (c) {
      return '<button type="button" data-aba="' + c.st + '" class="' + (abaCel === c.st ? 'is-ativa' : '') + '">' + c.titulo + ' <b>' + porSt[c.st].length + '</b></button>';
    }).join('');
    $('#kds').innerHTML = COLUNAS.map(function (c) {
      var lista = porSt[c.st];
      return '<section class="col col--' + c.st + (abaCel === c.st ? ' is-ativa' : '') + '"><h2>' + c.titulo + ' <b>' + lista.length + '</b></h2>' +
        (c.dica ? '<p class="col__dica">' + c.dica + '</p>' : '') +
        (lista.length ? lista.map(cartao).join('') : '<p class="col__vazia">Nenhum pedido aqui.</p>') + '</section>';
    }).join('');
  }

  /* ---------- ações ---------- */
  async function mudarStatus(id, status) {
    var p = pedidos.find(function (x) { return x.id === id; }); if (!p) return;
    if (status === 'cancelado' && !window.confirm('Cancelar o pedido nº ' + p.numero + ' de ' + p.cliente_nome + '?')) return;
    ocupado[id] = true; desenhar();
    var r = await sb.from('pedidos').update({ status: status }).eq('id', id).select('id');
    delete ocupado[id];
    if (r.error || !r.data || !r.data.length) { aviso(r.error ? window.FamaAcesso.erroTexto(r.error) : 'Não foi possível atualizar o pedido.'); desenhar(); return; }
    p.status = status;
    if (status === 'preparando') p.preparo_em = new Date().toISOString();
    if (['entregue', 'cancelado'].indexOf(status) >= 0) pedidos = pedidos.filter(function (x) { return x.id !== id; });
    desenhar();
    atualizar();
  }
  async function mudarTempo(id, delta) {
    var p = pedidos.find(function (x) { return x.id === id; }); if (!p) return;
    var novo = Math.max(5, Math.min(240, p.tempo_estimado_min + delta));
    p.tempo_estimado_min = novo; desenhar();
    var r = await sb.from('pedidos').update({ tempo_estimado_min: novo }).eq('id', id);
    if (r.error) aviso(window.FamaAcesso.erroTexto(r.error));
  }
  function imprimir(id) {
    var p = pedidos.find(function (x) { return x.id === id; }); if (!p) return;
    var itens = (p.pedido_itens || []).slice().sort(function (a, b) { return a.ordem - b.ordem; });
    $('#impressao').innerHTML = '<div class="comanda"><h1>Fama · #' + p.numero + '</h1>' +
      '<p>' + (p.origem === 'mesa' ? 'MESA ' + p.mesa_numero : ({ entrega: 'ENTREGA', retirada: 'RETIRADA', local: 'NO LOCAL' })[p.modo]) + ' · ' + hora(p.criado_em) + '</p>' +
      '<p>' + esc(p.cliente_nome) + '</p><hr>' +
      itens.map(function (i) {
        return '<p><b>' + i.quantidade + 'x ' + esc(i.nome) + '</b></p>' + (i.opcoes || []).map(function (o) { return '<p>  - ' + esc(o.grupo) + ': ' + (o.qtd > 1 ? o.qtd + 'x ' : '') + esc(o.nome) + '</p>'; }).join('') +
          (i.observacao ? '<p>  * ' + esc(i.observacao) + '</p>' : '');
      }).join('') + '<hr>' +
      (p.observacao ? '<p>Obs.: ' + esc(p.observacao) + '</p>' : '') +
      (p.modo === 'entrega' ? '<p>' + esc([p.endereco, p.bairro].filter(Boolean).join(' - ')) + '</p>' : '') +
      '<p>' + esc(p.origem === 'mesa' ? 'Pagamento no caixa' : (p.pagamento || '')) + '</p><p><b>Total: ' + dinheiro(p.total) + '</b></p></div>';
    window.print();
  }

  document.addEventListener('click', function (e) {
    var aba = e.target.closest('[data-aba]');
    if (aba) { abaCel = aba.dataset.aba; desenhar(); return; }
    var card = e.target.closest('.ped'); if (!card) return;
    var id = Number(card.dataset.id);
    var a = e.target.closest('[data-acao]'); if (a) { mudarStatus(id, a.dataset.acao); return; }
    var t = e.target.closest('[data-tempo]'); if (t) { mudarTempo(id, Number(t.dataset.tempo)); return; }
    if (e.target.closest('[data-imprimir]')) imprimir(id);
  });

  window.FamaAcesso.iniciar({
    aoEntrar: function (l, papel) {
      loja = l;
      // equipe da cozinha não vê os atalhos da administração
      if (papel === 'cozinha') document.querySelectorAll('.topo__acoes a').forEach(function (a) { a.remove(); });
      var salvo = null; try { salvo = localStorage.getItem('fama-cozinha-som'); } catch (e) { /* ok */ }
      ligarSom(salvo === '1');
      $('#btnSom').addEventListener('click', function () { ligarSom(!somLigado); if (somLigado) bip(); });
      // ao tocar na tela, libera o áudio no celular
      document.addEventListener('pointerdown', function () { if (somLigado && audio && audio.resume) audio.resume(); }, { passive: true });
      var rel = function () { $('#relogio').textContent = loja.nome + ' · ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
      rel(); setInterval(rel, 20000);
      atualizar();
      setInterval(atualizar, INTERVALO);
      setInterval(function () { if (pedidos.length) desenhar(); }, 30000); // atualiza os minutos
      // mantém a tela acesa no tablet da cozinha, se o aparelho deixar
      if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () { });
    }
  });
})();
