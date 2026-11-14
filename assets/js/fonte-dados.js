/* Fonte de dados do catálogo.
 * 1) Busca o cardápio no Supabase (uma chamada só: cardapio_publico).
 * 2) Converte para o mesmo formato que o app.js já usa (window.FAMA_DATA).
 * 3) Se o Supabase não responder, usa a cópia de reserva data/menu.js — o site nunca fica em branco.
 */
(function (root) {
  'use strict';

  var SUPABASE = {
    url: 'https://hhfgqcteeudpllituwyf.supabase.co',
    // chave PUBLICÁVEL: pode ficar no site; só tem o que as regras de segurança (RLS) liberam
    chave: 'sb_publishable_hLJh42rtjXsgdogq4xiGCA_WicjgVtG',
    loja: 'fama',
    bucket: 'cardapio',
    tempoLimite: 6000
  };
  var DIAS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function hm(t) { return String(t || '').slice(0, 5); }
  function num(v) { return v == null ? null : Number(v); }

  /* caminho da mídia: arquivos importados ficam no próprio site (assets/...);
     os enviados pelo painel ficam no Storage do Supabase */
  function urlMidia(c) {
    if (!c) return null;
    if (/^(https?:)?\/\//.test(c) || c.indexOf('assets/') === 0) return c;
    return SUPABASE.url + '/storage/v1/object/public/' + SUPABASE.bucket + '/' + c;
  }

  /* Converte a resposta de cardapio_publico no formato FAMA_DATA */
  function converter(r) {
    var L = r.loja || {};
    var porId = function (lista) { var m = {}; (lista || []).forEach(function (x) { m[x.id] = x; }); return m; };
    var etapasDe = function (campo, id) {
      return (r.etapas || []).filter(function (e) { return e[campo] === id; })
        .sort(function (a, b) { return a.ordem - b.ordem; })
        .map(function (e) { return { g: String(e.grupo_id), min: e.minimo, max: e.maximo, pm: e.regra_preco }; });
    };
    var capa = {};
    (r.midias || []).forEach(function (m) {
      if (m.tipo !== 'foto') return;
      if (!capa[m.produto_id] || m.ordem < capa[m.produto_id].ordem) capa[m.produto_id] = m;
    });
    var midiasDe = function (pid) {
      return (r.midias || []).filter(function (m) { return m.produto_id === pid; })
        .sort(function (a, b) { return a.ordem - b.ordem; })
        .map(function (m) { return { tipo: m.tipo, url: m.tipo === 'link' ? m.caminho : urlMidia(m.caminho), legenda: m.legenda }; });
    };

    var groups = {};
    (r.grupos || []).forEach(function (g) {
      groups[String(g.id)] = { id: String(g.id), t: g.nome, type: g.tipo === 'pizza' ? 'pizza' : 'simple_item', opts: [] };
    });
    (r.opcoes || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).forEach(function (o) {
      var g = groups[String(o.grupo_id)]; if (!g) return;
      g.opts.push({
        id: String(o.id), t: o.nome, d: o.descricao || '', p: num(o.preco), out: !o.disponivel,
        img: urlMidia(o.foto), max: o.max_por_item == null ? -1 : o.max_por_item, steps: etapasDe('opcao_id', o.id)
      });
    });

    var produtos = (r.produtos || []).slice().sort(function (a, b) { return a.ordem - b.ordem; });
    var categories = (r.categorias || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (c) {
      return {
        id: String(c.id), t: c.nome, type: c.tipo === 'pizza' ? 'pizza' : 'simple_item', order: c.ordem,
        promo: !!c.mostrar_selo_promocao, off: c.fora_do_ar || [],
        items: produtos.filter(function (p) { return p.categoria_id === c.id; }).map(function (p) {
          // preço promocional válido (menor que o normal) vira o preço cobrado; o normal aparece riscado
          var preco = num(p.preco), promo = num(p.preco_promocional);
          var temPromo = promo != null && promo > 0 && preco > 0 && promo < preco;
          var it = {
            id: String(p.id), t: p.nome, d: p.descricao || '', p: temPromo ? promo : preco, pOld: temPromo ? preco : null, out: !p.disponivel,
            img: capa[p.id] ? urlMidia(capa[p.id].caminho) : null,
            max: p.max_por_pedido == null ? -1 : p.max_por_pedido,
            steps: etapasDe('produto_id', p.id),
            // campos novos do painel (exibidos no detalhe do produto)
            chamada: p.chamada || '', ingredientes: p.ingredientes || [], diferenciais: p.diferenciais || [],
            info: p.info_adicional || '', promoPrice: num(p.preco_promocional),
            novo: !!p.novidade && (!p.novidade_ate || p.novidade_ate >= new Date().toISOString().slice(0, 10)),
            midias: midiasDe(p.id)
          };
          if (p.preco_minimo != null) it.minp = num(p.preco_minimo);
          if (p.preco_minimo_dia) it.minDay = p.preco_minimo_dia;
          if (p.fora_do_ar && p.fora_do_ar.length) it.off = p.fora_do_ar;
          return it;
        })
      };
    });

    var highlights = produtos.filter(function (p) { return p.destaque; })
      .sort(function (a, b) { return (a.destaque_ordem == null ? 999 : a.destaque_ordem) - (b.destaque_ordem == null ? 999 : b.destaque_ordem); })
      .map(function (p) { return [String(p.categoria_id), String(p.id)]; });

    var week = {};
    DIAS.forEach(function (d) { week[d] = []; });
    (r.horarios || []).forEach(function (h) { week[DIAS[h.dia]].push({ s: hm(h.abre), e: hm(h.fecha) }); });
    var pay = L.pagamentos || {};
    var atualizado = [L.atualizado_em].concat(produtos.map(function (p) { return p.atualizado_em; })).filter(Boolean).sort().pop();

    return {
      store: {
        name: L.nome, slug: L.slug, orderUrl: L.link_pedido_online, whatsapp: L.whatsapp, phones: L.telefones || [],
        address: L.endereco, addressParts: { city: L.cidade, state: L.uf }, tz: L.fuso || 'America/Sao_Paulo', week: week,
        minOrder: num(L.pedido_minimo), deliveryTime: [L.entrega_min, L.entrega_max], takeTime: [L.retirada_min, L.retirada_max],
        accept: { delivery: L.aceita_entrega, take: L.aceita_retirada, local: L.aceita_local },
        pay: { money: !!pay.money, card: !!pay.card, pix: !!pay.pix, online: !!pay.online, cards: L.bandeiras || [] },
        regions: (r.bairros || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (b) { return { n: b.nome, p: num(b.taxa) }; }),
        segments: L.segmentos || [], closedToday: !!L.fechada_hoje, showSoldOut: !!L.mostrar_esgotados,
        menuUpdatedAt: atualizado || null
      },
      categories: categories, groups: groups, highlights: highlights, issues: [], source: 'supabase'
    };
  }

  function carregarReserva(pronto) {
    if (root.FAMA_DATA) return pronto('reserva');
    var s = document.createElement('script');
    s.src = 'data/menu.js';
    s.onload = function () { pronto('reserva'); };
    s.onerror = function () { pronto('erro'); };
    document.head.appendChild(s);
  }

  function carregar(pronto) {
    var feito = false;
    var fim = function (origem) { if (feito) return; feito = true; pronto(origem); };
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); carregarReserva(fim); }, SUPABASE.tempoLimite);
    try {
      fetch(SUPABASE.url + '/rest/v1/rpc/cardapio_publico', {
        method: 'POST',
        headers: { apikey: SUPABASE.chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: SUPABASE.loja }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (json) {
        clearTimeout(timer);
        if (!json || !json.loja || !(json.categorias || []).length) throw new Error('cardápio vazio');
        root.FAMA_DATA = converter(json);
        fim('supabase');
      }).catch(function (e) {
        clearTimeout(timer);
        if (root.console) console.warn('Cardápio do Supabase indisponível, usando a cópia de reserva:', e && e.message);
        carregarReserva(fim);
      });
    } catch (e) {
      clearTimeout(timer);
      carregarReserva(fim);
    }
  }

  root.FamaDados = { converter: converter, carregar: carregar, urlMidia: urlMidia, SUPABASE: SUPABASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FamaDados;
})(typeof window !== 'undefined' ? window : globalThis);
