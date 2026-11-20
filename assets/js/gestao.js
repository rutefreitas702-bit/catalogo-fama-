/* Gestão da Fama: vendas por período, mais vendidos, lista de pedidos e mesas com QR Code. */
(function () {
  'use strict';

  var sb = window.FamaAcesso.sb;
  var loja = null;
  var periodo = 'hoje';
  var pedidos = [];
  var mesas = [];
  var aberto = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function dinheiro(v) { return BRL.format(Number(v) || 0).replace(/\u0020/g, '\u0020'); }
  function curto(v) { v = Number(v) || 0; return v >= 1000 ? 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + ' mil' : 'R$ ' + Math.round(v); }
  function aviso(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { t.hidden = true; }, 4000);
  }
  var valido = function (p) { return p.status !== 'cancelado' && p.status !== 'aguardando'; };
  var CANAL = { mesa: 'Mesa (QR Code)', entrega: 'Delivery · entrega', retirada: 'Delivery · retirada', local: 'Delivery · no local' };
  var SITUACAO = { aguardando: 'Não confirmado', novo: 'Na fila', preparando: 'Em preparo', pronto: 'Pronto', entregue: 'Finalizado', cancelado: 'Cancelado' };

  /* ================= período ================= */
  function intervalo() {
    var ini = new Date(); ini.setHours(0, 0, 0, 0);
    var fim = new Date(ini); fim.setDate(fim.getDate() + 1);
    if (periodo === 'ontem') { ini.setDate(ini.getDate() - 1); fim.setDate(fim.getDate() - 1); }
    if (periodo === '7') ini.setDate(ini.getDate() - 6);
    if (periodo === '30') ini.setDate(ini.getDate() - 29);
    if (periodo === 'mes') ini.setDate(1);
    return { ini: ini, fim: fim, porHora: periodo === 'hoje' || periodo === 'ontem' };
  }

  async function carregarVendas() {
    var iv = intervalo(), lista = [], de = 0, passo = 1000;
    $('#kpis').innerHTML = '<p class="vazio">Carregando…</p>';
    for (;;) {
      var r = await sb.from('pedidos')
        .select('id, numero, origem, modo, mesa_numero, cliente_nome, endereco, bairro, pagamento, observacao, cupom, subtotal, taxa_entrega, desconto, total, status, criado_em, pedido_itens(nome, quantidade, total, opcoes, observacao, ordem)')
        .eq('loja_id', loja.id).gte('criado_em', iv.ini.toISOString()).lt('criado_em', iv.fim.toISOString())
        .order('criado_em', { ascending: false }).range(de, de + passo - 1);
      if (r.error) { aviso(window.FamaAcesso.erroTexto(r.error)); return; }
      lista = lista.concat(r.data || []);
      if (!r.data || r.data.length < passo || lista.length >= 10000) break;
      de += passo;
    }
    pedidos = lista;
    desenharVendas();
  }

  function desenharVendas() {
    var iv = intervalo();
    var ok = pedidos.filter(valido);
    var fat = ok.reduce(function (a, p) { return a + Number(p.total); }, 0);
    var canc = pedidos.filter(function (p) { return p.status === 'cancelado'; });
    var aguard = pedidos.filter(function (p) { return p.status === 'aguardando'; });
    var mesa = ok.filter(function (p) { return p.origem === 'mesa'; });
    var deliv = ok.filter(function (p) { return p.origem === 'delivery'; });
    var soma = function (l) { return l.reduce(function (a, p) { return a + Number(p.total); }, 0); };

    $('#kpis').innerHTML =
      '<div class="kpi kpi--destaque"><span>Faturamento</span><b>' + dinheiro(fat) + '</b><small>pedidos confirmados</small></div>' +
      '<div class="kpi"><span>Pedidos</span><b>' + ok.length + '</b><small>' + mesa.length + ' na mesa · ' + deliv.length + ' delivery</small></div>' +
      '<div class="kpi"><span>Ticket médio</span><b>' + dinheiro(ok.length ? fat / ok.length : 0) + '</b><small>por pedido</small></div>' +
      '<div class="kpi"><span>Cancelados</span><b>' + canc.length + '</b><small>' + (aguard.length ? aguard.length + ' sem confirmação' : dinheiro(soma(canc)) + ' perdidos') + '</small></div>';

    // gráfico
    var baldes = [], rot = [];
    if (iv.porHora) {
      for (var h = 0; h < 24; h++) { baldes.push(0); rot.push(h + 'h'); }
      ok.forEach(function (p) { baldes[new Date(p.criado_em).getHours()] += Number(p.total); });
      // mostra só o horário com movimento (com folga)
      var usados = baldes.map(function (v, i) { return v > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      var a = usados.length ? Math.max(0, Math.min(usados[0], 17) - 1) : 17, b = usados.length ? Math.min(23, Math.max(usados[usados.length - 1], 23)) : 23;
      baldes = baldes.slice(a, b + 1); rot = rot.slice(a, b + 1);
      $('#tituloGrafico').textContent = 'Vendas por hora';
    } else {
      var d = new Date(iv.ini);
      while (d < iv.fim) { baldes.push(0); rot.push(d.getDate() + '/' + (d.getMonth() + 1)); d.setDate(d.getDate() + 1); }
      ok.forEach(function (p) { var i = Math.floor((new Date(p.criado_em) - iv.ini) / 86400000); if (i >= 0 && i < baldes.length) baldes[i] += Number(p.total); });
      $('#tituloGrafico').textContent = 'Vendas por dia';
    }
    var max = Math.max.apply(null, baldes.concat([1]));
    var passoRot = baldes.length > 16 ? Math.ceil(baldes.length / 10) : 1;
    $('#grafico').innerHTML = baldes.map(function (v, i) {
      return '<div title="' + rot[i] + ': ' + dinheiro(v) + '">' + (v > 0 && baldes.length <= 16 ? '<em>' + curto(v) + '</em>' : '') +
        '<i style="height:' + Math.round(v / max * 100) + '%"></i><small>' + (i % passoRot === 0 ? rot[i] : '&nbsp;') + '</small></div>';
    }).join('');

    // canais e pagamentos
    var pag = {};
    ok.forEach(function (p) {
      var k = p.origem === 'mesa' ? 'No caixa (mesa)' : String(p.pagamento || 'Não informado').split(/[ (\u2013-]/)[0] || 'Não informado';
      pag[k] = (pag[k] || 0) + Number(p.total);
    });
    $('#divisao').innerHTML =
      ['entrega', 'retirada', 'local'].map(function (m) {
        var l = deliv.filter(function (p) { return p.modo === m; });
        return l.length ? '<div><span>' + CANAL[m] + ' (' + l.length + ')</span><b>' + dinheiro(soma(l)) + '</b></div>' : '';
      }).join('') +
      '<div><span>' + CANAL.mesa + ' (' + mesa.length + ')</span><b>' + dinheiro(soma(mesa)) + '</b></div>' +
      Object.keys(pag).sort(function (x, y) { return pag[y] - pag[x]; }).map(function (k) { return '<div><span>Pagamento: ' + esc(k) + '</span><b>' + dinheiro(pag[k]) + '</b></div>'; }).join('') +
      (deliv.length ? '<div><span>Taxas de entrega</span><b>' + dinheiro(deliv.reduce(function (a, p) { return a + Number(p.taxa_entrega); }, 0)) + '</b></div>' : '') +
      (ok.some(function (p) { return Number(p.desconto) > 0; }) ? '<div><span>Descontos de cupom</span><b>− ' + dinheiro(ok.reduce(function (a, p) { return a + Number(p.desconto); }, 0)) + '</b></div>' : '');

    // mais vendidos
    var prod = {};
    ok.forEach(function (p) { (p.pedido_itens || []).forEach(function (i) {
      var x = prod[i.nome] || (prod[i.nome] = { q: 0, v: 0 }); x.q += i.quantidade; x.v += Number(i.total);
    }); });
    var top = Object.keys(prod).map(function (n) { return { n: n, q: prod[n].q, v: prod[n].v }; }).sort(function (x, y) { return y.q - x.q || y.v - x.v; }).slice(0, 10);
    var maxQ = top.length ? top[0].q : 1;
    $('#ranking').innerHTML = top.length ? top.map(function (t) {
      return '<li><b>' + esc(t.n) + '</b><span>' + t.q + ' un · ' + dinheiro(t.v) + '</span><i style="--p:' + Math.round(t.q / maxQ * 100) + '%"></i></li>';
    }).join('') : '<li class="vazio">Nenhuma venda neste período.</li>';

    desenharTabela();
  }

  function desenharTabela() {
    $('#tabela').innerHTML = pedidos.length ? pedidos.map(function (p) {
      var dt = new Date(p.criado_em);
      var quando = (periodo === 'hoje' ? '' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      var canal = p.origem === 'mesa' ? 'Mesa ' + p.mesa_numero : ({ entrega: 'Entrega', retirada: 'Retirada', local: 'No local' })[p.modo];
      var linha = '<tr data-ped="' + p.id + '"><td><b>#' + p.numero + '</b></td><td>' + quando + '</td><td>' + esc(canal) + '</td><td>' + esc(p.cliente_nome) + '</td><td><span class="st st--' + p.status + '">' + SITUACAO[p.status] + '</span></td><td class="num">' + dinheiro(p.total) + '</td></tr>';
      if (aberto === p.id) {
        linha += '<tr class="detalhe"><td colspan="6"><ul>' + (p.pedido_itens || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (i) {
          return '<li>' + i.quantidade + '× ' + esc(i.nome) + ' — ' + dinheiro(i.total) + ((i.opcoes || []).length ? ' (' + i.opcoes.map(function (o) { return (o.qtd > 1 ? o.qtd + '× ' : '') + esc(o.nome); }).join(', ') + ')' : '') + (i.observacao ? ' · Obs.: ' + esc(i.observacao) : '') + '</li>';
        }).join('') + '</ul>' +
          '<p style="margin:8px 0 0">' + (p.modo === 'entrega' ? 'Endereço: ' + esc([p.endereco, p.bairro].filter(Boolean).join(' – ')) + ' · Taxa ' + dinheiro(p.taxa_entrega) + ' · ' : '') +
          (p.pagamento ? 'Pagamento: ' + esc(p.pagamento) + ' · ' : '') + (p.cupom ? 'Cupom ' + esc(p.cupom) + ' (− ' + dinheiro(p.desconto) + ') · ' : '') +
          (p.observacao ? 'Obs.: ' + esc(p.observacao) : '') + '</p></td></tr>';
      }
      return linha;
    }).join('') : '<tr><td colspan="6" class="vazio">Nenhum pedido neste período.</td></tr>';
  }

  function baixarCsv() {
    var cab = ['Numero', 'Data', 'Hora', 'Canal', 'Mesa', 'Cliente', 'Situacao', 'Itens', 'Pagamento', 'Bairro', 'Subtotal', 'Taxa entrega', 'Desconto', 'Total'];
    var linhas = pedidos.map(function (p) {
      var d = new Date(p.criado_em);
      return [p.numero, d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), CANAL[p.modo], p.mesa_numero || '', p.cliente_nome, SITUACAO[p.status],
        (p.pedido_itens || []).map(function (i) { return i.quantidade + 'x ' + i.nome; }).join(' | '), p.pagamento || '', p.bairro || '',
        Number(p.subtotal).toFixed(2).replace('.', ','), Number(p.taxa_entrega).toFixed(2).replace('.', ','), Number(p.desconto).toFixed(2).replace('.', ','), Number(p.total).toFixed(2).replace('.', ',')];
    });
    var csv = [cab].concat(linhas).map(function (l) { return l.map(function (c) { c = String(c == null ? '' : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'vendas-fama-' + periodo + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= mesas ================= */
  function linkMesa(m) { return location.origin + '/mesa?m=' + m.codigo; }
  function nomeMesa(m) { return m.nome || 'Mesa ' + m.numero; }
  async function carregarMesas() {
    var r = await sb.from('mesas').select('id, numero, nome, codigo, ativa').eq('loja_id', loja.id).order('numero');
    if (r.error) { aviso(window.FamaAcesso.erroTexto(r.error)); return; }
    mesas = r.data || [];
    desenharMesas();
  }
  function desenharMesas() {
    $('#mesas').innerHTML = mesas.length ? mesas.map(function (m) {
      return '<div class="mesa' + (m.ativa ? '' : ' is-off') + '" data-mesa="' + m.id + '">' +
        '<div class="mesa__qr">' + window.FamaQR.svg(linkMesa(m), 150) + '</div>' +
        '<h3>' + esc(nomeMesa(m)) + '</h3>' +
        '<p>' + (m.ativa ? '<a href="' + esc(linkMesa(m)) + '" target="_blank" rel="noopener">Testar o link ↗</a>' : 'Desativada: o QR Code não aceita pedidos') + '</p>' +
        '<div class="mesa__acoes">' +
        '<button class="btn btn--fantasma" data-m="nome">Renomear</button>' +
        '<button class="btn btn--fantasma" data-m="ativa">' + (m.ativa ? 'Desativar' : 'Ativar') + '</button>' +
        '<button class="btn btn--fantasma" data-m="codigo">Trocar QR</button>' +
        '<button class="btn btn--fantasma" data-m="apagar">Excluir</button></div></div>';
    }).join('') : '<p class="vazio">Nenhuma mesa cadastrada. Toque em “Nova mesa”.</p>';
  }
  function codigoNovo() {
    var a = new Uint8Array(6); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  async function acaoMesa(id, acao) {
    var m = mesas.find(function (x) { return x.id === id; }); if (!m) return;
    var r;
    if (acao === 'nome') {
      var nome = window.prompt('Nome da mesa (deixe vazio para "Mesa ' + m.numero + '"):', m.nome || '');
      if (nome === null) return;
      nome = nome.trim().slice(0, 40);
      r = await sb.from('mesas').update({ nome: nome || null }).eq('id', id);
    } else if (acao === 'ativa') {
      r = await sb.from('mesas').update({ ativa: !m.ativa }).eq('id', id);
    } else if (acao === 'codigo') {
      if (!window.confirm('Trocar o QR Code de ' + nomeMesa(m) + '? O QR antigo para de funcionar e será preciso imprimir de novo.')) return;
      r = await sb.from('mesas').update({ codigo: codigoNovo() }).eq('id', id);
    } else if (acao === 'apagar') {
      if (!window.confirm('Excluir ' + nomeMesa(m) + '? Os pedidos antigos dessa mesa continuam no relatório.')) return;
      r = await sb.from('mesas').delete().eq('id', id);
    }
    if (r && r.error) { aviso(window.FamaAcesso.erroTexto(r.error)); return; }
    carregarMesas();
  }
  async function novaMesa() {
    var prox = mesas.reduce(function (a, m) { return Math.max(a, m.numero); }, 0) + 1;
    var n = window.prompt('Número da nova mesa:', String(prox));
    if (n === null) return;
    n = parseInt(n, 10);
    if (!(n >= 1 && n <= 999)) { aviso('Digite um número de 1 a 999.'); return; }
    if (mesas.some(function (m) { return m.numero === n; })) { aviso('Já existe a mesa ' + n + '.'); return; }
    var r = await sb.from('mesas').insert({ loja_id: loja.id, numero: n });
    if (r.error) { aviso(window.FamaAcesso.erroTexto(r.error)); return; }
    carregarMesas();
  }
  function imprimirQr() {
    var ativas = mesas.filter(function (m) { return m.ativa; });
    if (!ativas.length) { aviso('Nenhuma mesa ativa para imprimir.'); return; }
    $('#folhaQr').innerHTML = ativas.map(function (m) {
      return '<div class="placa"><img src="assets/img/logo-fama.png" alt=""><h2>' + esc(nomeMesa(m)) + '</h2>' + window.FamaQR.svg(linkMesa(m), 240) +
        '<p><b>Faça seu pedido pelo celular</b><br>Aponte a câmera para o código. O pedido vai direto para a cozinha e o pagamento é no caixa.</p></div>';
    }).join('');
    window.print();
  }

  /* ================= navegação ================= */
  function mostrar(secao) {
    $$('.secoes [data-secao]').forEach(function (b) { var on = b.dataset.secao === secao; b.classList.toggle('is-ativa', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#secVendas').hidden = secao !== 'vendas';
    $('#secMesas').hidden = secao !== 'mesas';
    if (secao === 'mesas') carregarMesas(); else carregarVendas();
    history.replaceState(null, '', secao === 'mesas' ? '#mesas' : location.pathname);
  }

  window.FamaAcesso.iniciar({
    aoEntrar: function (l) {
      loja = l;
      $('#topoLoja').textContent = loja.nome;
      $$('.secoes [data-secao]').forEach(function (b) { b.addEventListener('click', function () { mostrar(b.dataset.secao); }); });
      $('#periodos').addEventListener('click', function (e) {
        var b = e.target.closest('[data-p]'); if (!b) return;
        periodo = b.dataset.p; aberto = null;
        $$('#periodos button').forEach(function (x) { x.classList.toggle('is-ativa', x === b); });
        carregarVendas();
      });
      $('#tabela').addEventListener('click', function (e) {
        var tr = e.target.closest('[data-ped]'); if (!tr) return;
        var id = Number(tr.dataset.ped); aberto = aberto === id ? null : id; desenharTabela();
      });
      $('#btnCsv').addEventListener('click', baixarCsv);
      $('#mesas').addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]'); if (!b) return;
        acaoMesa(Number(b.closest('[data-mesa]').dataset.mesa), b.dataset.m);
      });
      $('#btnNovaMesa').addEventListener('click', novaMesa);
      $('#btnImprimir').addEventListener('click', imprimirQr);
      mostrar(location.hash === '#mesas' ? 'mesas' : 'vendas');
      // vendas de hoje se atualizam sozinhas
      setInterval(function () { if (!$('#secVendas').hidden && periodo === 'hoje' && !document.hidden) carregarVendas(); }, 60000);
    }
  });
})();
