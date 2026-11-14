/* Fama Burguer e Pizzaria — catálogo digital
 * O conteúdo comercial vem do Supabase (painel administrativo), carregado por fonte-dados.js;
 * se o Supabase não responder, vem da cópia de reserva data/menu.js.
 * Este arquivo só apresenta os dados: nenhum preço, nome ou descrição é escrito aqui.
 */
window.iniciarFama = function () {
  'use strict';

  var D = window.FAMA_DATA;
  var S = D.store;
  var G = D.groups;

  /* Regra de preço para etapas com price_model 1 (ex.: pizza com 2 sabores).
     'maior' = cobra o sabor de maior valor; 'media' = média dos sabores.
     Confirme com a loja qual regra o sistema original usa. */
  var CONFIG = {
    priceModel1: 'maior',
    priceModel2: 'media',
    imgDir: 'assets/img/p/',
    heroDir: 'assets/hero/',
    heroFrames: 151
  };

  /* ================= utilidades ================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function money(v) { return BRL.format(Math.round(v * 100) / 100).replace(/ /g, ' '); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function trimT(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function imgSrc(k) {
    if (!k) return null;
    // caminho completo (Supabase/painel ou assets/...) ou chave antiga da cópia de reserva
    return (k.indexOf('/') >= 0 || k.indexOf(':') >= 0) ? k : CONFIG.imgDir + k + '.webp';
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= horários (fuso da loja) ================= */
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_PT = { sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado' };
  var DAY_SHORT = { sun: 'dom.', mon: 'seg.', tue: 'ter.', wed: 'qua.', thu: 'qui.', fri: 'sex.', sat: 'sáb.' };
  function nowStore() {
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: S.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var d = new Date(); parts = { weekday: d.toString().slice(0, 3), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
    }
    var dow = String(parts.weekday).slice(0, 3).toLowerCase();
    var h = parseInt(parts.hour, 10) % 24, m = parseInt(parts.minute, 10), s = parseInt(parts.second, 10) || 0;
    return { dow: dow, secs: h * 3600 + m * 60 + s, mins: h * 60 + m };
  }
  function hm(str) { var p = str.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function fmtHM(str) { var p = str.split(':'); return p[0] + 'h' + (p[1] === '00' ? '' : p[1]); }
  function fmtSecs(sec) { var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h + 'h' + (m ? String(m).padStart(2, '0') : ''); }

  function storeStatus() {
    if (S.closedToday) return { open: false, label: 'Fechado hoje', short: 'Fechado' };
    var n = nowStore();
    var today = S.week[n.dow] || [];
    for (var i = 0; i < today.length; i++) {
      var a = hm(today[i].s), b = hm(today[i].e);
      if (n.mins >= a && n.mins <= b) return { open: true, label: 'Aberto até ' + fmtHM(today[i].e), short: 'Aberto' };
    }
    for (var k = 0; k < today.length; k++) {
      if (n.mins < hm(today[k].s)) return { open: false, label: 'Fechado · abre hoje às ' + fmtHM(today[k].s), short: 'Fechado' };
    }
    var idx = DAYS.indexOf(n.dow);
    for (var j = 1; j <= 7; j++) {
      var d = DAYS[(idx + j) % 7], w = S.week[d] || [];
      if (w.length) return { open: false, label: 'Fechado · abre ' + (j === 1 ? 'amanhã' : DAY_PT[d].toLowerCase()) + ' às ' + fmtHM(w[0].s), short: 'Fechado' };
    }
    return { open: false, label: 'Fechado', short: 'Fechado' };
  }

  /* Janelas em que uma categoria/item NÃO aparece no original (non_active_weekdays). */
  function isActiveNow(off) {
    if (!off || !off.length) return true;
    var n = nowStore();
    for (var i = 0; i < off.length; i++) if (off[i].d === n.dow && n.secs >= off[i].s && n.secs <= off[i].e) return false;
    return true;
  }
  function availabilityText(off) {
    if (!off || !off.length) return '';
    var byDay = {};
    DAYS.forEach(function (d) {
      var wins = [[0, 86399]];
      off.filter(function (o) { return o.d === d; }).forEach(function (o) {
        var next = [];
        wins.forEach(function (w) {
          if (o.e < w[0] || o.s > w[1]) { next.push(w); return; }
          if (o.s > w[0]) next.push([w[0], o.s - 1]);
          if (o.e < w[1]) next.push([o.e + 1, w[1]]);
        });
        wins = next;
      });
      wins = wins.filter(function (w) { return w[1] - w[0] > 60; });
      byDay[d] = wins.map(function (w) { return 'das ' + fmtSecs(w[0] + (w[0] % 60 ? 60 - (w[0] % 60) : 0)) + ' às ' + fmtSecs(w[1]); }).join(' e ');
    });
    var groups = [];
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(function (d) {
      var t = byDay[d];
      var last = groups[groups.length - 1];
      if (last && last.t === t) last.days.push(d); else groups.push({ t: t, days: [d] });
    });
    return groups.filter(function (g) { return g.t; }).map(function (g) {
      var days = g.days.length > 2 ? DAY_SHORT[g.days[0]] + ' a ' + DAY_SHORT[g.days[g.days.length - 1]] : g.days.map(function (d) { return DAY_SHORT[d]; }).join(' e ');
      return days + ' ' + g.t;
    }).join(' · ');
  }

  /* ================= visibilidade: igual ao cardápio original =================
     O original não mostra itens/opções esgotados, categorias vazias nem categorias fora do horário. */
  function visOpts(g) { return g ? g.opts.filter(function (o) { return !o.out; }) : []; }
  // esgotado some do site, a menos que a loja escolha mostrar com selo "Esgotado" (configuração do painel)
  function visibleItem(it) { return (!it.out || !!S.showSoldOut) && isActiveNow(it.off); }
  function visibleItems(cat) { return isActiveNow(cat.off) ? cat.items.filter(visibleItem) : []; }
  function visibleCats() { return D.categories.filter(function (c) { return visibleItems(c).length > 0; }); }

  /* ================= preços: só o que o original exibe ================= */
  function displayPrice(it) {
    if (it.p > 0) return { from: false, v: it.p };
    if (it.minDay) {
      var today = it.minDay[nowStore().dow];
      if (today > 0) return { from: true, v: today };
    }
    if (it.minp > 0) return { from: true, v: it.minp };
    // preço depende da escolha: usa os preços reais das opções disponíveis da 1ª etapa
    var s0 = it.steps[0], g0 = s0 && G[s0.g];
    var ps = visOpts(g0).map(function (o) { return o.p; }).filter(function (v) { return v > 0; });
    if (!ps.length) return null;
    var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
    return { from: lo !== hi, v: lo };
  }
  function priceHTML(it) {
    var p = displayPrice(it);
    if (!p) return '';
    var antes = !p.from && it.pOld ? '<s class="price__old">' + money(it.pOld) + '</s>' : '';
    return '<span class="price">' + (p.from ? '<small>A partir de</small>' : '') + antes + money(p.v) + '</span>';
  }

  /* ================= estrutura ================= */
  var catById = {}, itemIndex = {};
  D.categories.forEach(function (c) {
    catById[c.id] = c;
    c.items.forEach(function (it) { itemIndex[it.id] = { item: it, cat: c }; });
  });
  function mediaHTML(key, alt) {
    return key ? '<img src="' + imgSrc(key) + '" alt="' + esc(alt || '') + '" loading="lazy" decoding="async" width="720" height="720">' : '';
  }

  /* ================= render: catálogo ================= */
  function cardHTML(cat, it) {
    var desc = it.d ? '<p class="card__desc">' + esc(it.d) + '</p>' : '';
    var selos = (it.out ? '<span class="tag tag--out">Esgotado</span>' : '') + (it.novo ? '<span class="tag tag--novo">Novo</span>' : '') +
      (it.pOld ? '<span class="tag tag--promo">Promoção</span>' : '');
    return '<button type="button" class="card reveal' + (it.img ? '' : ' card--noimg') + (it.out ? ' is-out' : '') + '" data-open="' + it.id + '">' +
      (it.img ? '<div class="card__img">' + mediaHTML(it.img, it.t) + (selos ? '<div class="card__tags">' + selos + '</div>' : '') + '</div>' : '') +
      '<div class="card__body">' + (!it.img && selos ? '<div class="card__tags card__tags--inline">' + selos + '</div>' : '') +
      '<h3 class="card__title">' + esc(it.t) + '</h3>' + (it.chamada ? '<p class="card__chamada">' + esc(it.chamada) + '</p>' : '') + desc +
      '<div class="card__foot">' + priceHTML(it) + '<span class="add-dot" aria-hidden="true">+</span></div></div></button>';
  }
  var DRIP_PATH = 'M0 0h120v6c-6 0-8 3-9 9-1 8-3 13-7 13s-6-5-6-12c0-4-2-6-6-6s-5 3-6 7c-1 5-2 8-5 8s-4-3-4-7c0-5-2-8-7-8H0z';
  var PCT = '<span class="cat__pct" title="Promoção" aria-label="Promoção">%</span>';
  function renderCatalog() {
    var cats = visibleCats();
    $('#catalog').innerHTML = cats.map(function (cat) {
      var body = '<div class="grid">' + visibleItems(cat).map(function (it) { return cardHTML(cat, it); }).join('') + '</div>';
      return '<section class="cat wrap" id="cat-' + cat.id + '" data-cat="' + cat.id + '" aria-labelledby="h-' + cat.id + '">' +
        '<div class="cat__head"><h2 class="cat__title" id="h-' + cat.id + '">' + esc(trimT(cat.t)) +
        '<svg class="cat__drip" viewBox="0 0 120 34" aria-hidden="true"><path d="' + DRIP_PATH + '"/></svg></h2>' + (cat.promo ? PCT : '') + '</div>' + body + '</section>';
    }).join('');
    $('#catnavInner').innerHTML = cats.map(function (c) {
      return '<button type="button" class="chip" data-goto="' + c.id + '">' + esc(trimT(c.t)) + '</button>';
    }).join('');
    renderCatalog.sig = cats.map(function (c) { return c.id; }).join();
  }
  function renderHighlights() {
    var cards = D.highlights.map(function (h) {
      var ref = itemIndex[h[1]]; if (!ref || !visibleItem(ref.item) || !isActiveNow(ref.cat.off)) return '';
      var it = ref.item;
      var key = it.img;
      return '<button type="button" class="hl-card' + (key ? '' : ' hl-card--noimg') + '" data-open="' + it.id + '">' + (key ? '<div class="hl-card__img">' + mediaHTML(key, it.t) + '</div>' : '') +
        '<div class="hl-card__body"><h3>' + esc(trimT(it.t)) + '</h3></div></button>';
    }).join('');
    $('#highlights').innerHTML = cards;
    $('.highlights').hidden = !cards;
  }
  function waLink(text) { return 'https://wa.me/' + S.whatsapp + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function fmtPhone(p) {
    var d = String(p).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 3) + ' ' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return String(p);
  }
  function renderFacts() {
    var st = storeStatus();
    var pay = [];
    if (S.pay.money) pay.push('Dinheiro');
    if (S.pay.card) pay.push('Cartão');
    if (S.pay.pix) pay.push('Pix');
    $('#facts').innerHTML =
      '<span class="fact ' + (st.open ? 'fact--open' : 'fact--closed') + '"><i></i>' + esc(st.label) + '</span>' +
      '<span class="fact">Pedido mín. ' + money(S.minOrder) + '</span>' +
      '<a class="fact fact--link" href="#info" data-scroll="#info">Mais informações</a>';
    var pill = $('#statusPill'); pill.dataset.state = st.open ? 'open' : 'closed'; pill.querySelector('span').textContent = st.label;
  }
  function renderFooter() {
    var n = nowStore();
    var hours = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(function (d) {
      var w = S.week[d] || [];
      return '<tr class="' + (d === n.dow ? 'is-today' : '') + '"><td>' + DAY_PT[d] + '</td><td>' + (w.length ? w.map(function (x) { return x.s + ' – ' + x.e; }).join(', ') : 'Fechado') + '</td></tr>';
    }).join('');
    var regions = S.regions.slice().sort(function (a, b) { return a.n.localeCompare(b.n, 'pt-BR'); })
      .map(function (r) { return '<tr><td>' + esc(r.n) + '</td><td>' + money(r.p) + '</td></tr>'; }).join('');
    var phones = S.phones.map(function (p) { return '<li class="copyable">Telefone: <span>' + esc(fmtPhone(p)) + '</span></li>'; }).join('');
    $('#footer').innerHTML =
      '<div><div class="brandline"><img src="assets/img/logo-fama.png" alt="Logo Fama Burguer" width="72" height="72"><strong>Fama Burguer<br><span style="color:var(--mustard)">e Pizzaria</span></strong></div>' +
      '<p>' + esc(S.address) + '</p><ul class="contact-list">' +
      '<li>WhatsApp: <a href="' + waLink() + '" target="_blank" rel="noopener">' + esc(fmtPhone(S.whatsapp)) + '</a></li>' + phones + '</ul>' +
      '<p style="margin-top:14px">Atendemos: ' + [S.accept.delivery && 'Entrega', S.accept.take && 'Retirada', S.accept.local && 'Consumo no local'].filter(Boolean).join(' · ') + '</p></div>' +
      '<div><h3>Horários</h3><table class="hours"><tbody>' + hours + '</tbody></table>' +
      '<h3 style="margin-top:26px">Pagamento</h3><p>' + [S.pay.money && 'Dinheiro', S.pay.card && 'Cartão na entrega', S.pay.pix && 'Pix'].filter(Boolean).join(' · ') + '</p>' +
      (S.pay.cards.length ? '<p>Bandeiras: ' + S.pay.cards.map(esc).join(', ') + '</p>' : '') + '</div>' +
      '<div><h3>Taxas de entrega</h3><div class="regions" data-lenis-prevent><table><tbody>' + regions + '</tbody></table></div></div>';
    var dt = (S.menuUpdatedAt || '').slice(0, 10).split('-').reverse().join('/');
    $('#sourceNote').textContent = 'Cardápio oficial da Fama Burguer e Pizzaria' + (dt ? ', atualizado em ' + dt : '') + '. Fotos originais da loja.';
    $('#heroSegments').textContent = S.segments.join(' · ');
    $('#heroWhats').href = waLink();
  }

  /* ================= modal de produto ================= */
  var current = null; // { it, cat, sel: {path: {optId: qty}}, qty, obs }
  function findOpt(g, id) { return g.opts.find(function (o) { return o.id === id; }); }
  function stepRuleText(s) {
    if (s.max === 1) return s.min ? 'Escolha 1 opção' : 'Escolha até 1 opção';
    if (s.min === s.max) return 'Escolha ' + s.min + ' opções';
    if (s.min) return 'Escolha de ' + s.min + ' a ' + s.max + ' opções';
    return 'Escolha até ' + s.max + ' opções';
  }
  function selCount(map) { return Object.keys(map || {}).reduce(function (a, k) { return a + map[k]; }, 0); }
  function optTotal(o, path) { return o.p + (o.steps || []).reduce(function (a, s, i) { return a + stepTotal(s, path + '.' + o.id + '.' + i); }, 0); }
  function stepTotal(s, path) {
    var g = G[s.g], map = current.sel[path] || {};
    var chosen = [];
    Object.keys(map).forEach(function (id) { var o = findOpt(g, id); if (o && map[id] > 0) chosen.push({ o: o, q: map[id] }); });
    if (!chosen.length) return 0;
    if (s.pm === 0) return chosen.reduce(function (a, c) { return a + optTotal(c.o, path) * c.q; }, 0);
    var vals = []; chosen.forEach(function (c) { for (var i = 0; i < c.q; i++) vals.push(optTotal(c.o, path)); });
    var rule = s.pm === 1 ? CONFIG.priceModel1 : CONFIG.priceModel2;
    if (rule === 'maior') return Math.max.apply(null, vals);
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function unitPrice() { return current.it.p + current.it.steps.reduce(function (a, s, i) { return a + stepTotal(s, String(i)); }, 0); }

  function stepsHTML(steps, base, depth) {
    return steps.map(function (s, i) {
      var g = G[s.g]; if (!g) return '';
      var path = base + i;
      var map = current.sel[path] || {};
      var n = selCount(map);
      var multiQty = s.max > 1;
      var hint = s.pm === 1 && s.max > 1 ? (CONFIG.priceModel1 === 'maior' ? ' · valor pelo sabor de maior preço' : ' · valor pela média dos sabores') : '';
      var badge = s.min ? (n >= s.min ? '<span class="step__badge is-ok">' + n + '/' + s.max + '</span>' : '<span class="step__badge is-req">Obrigatório</span>') : '<span class="step__badge">' + n + '/' + s.max + '</span>';
      var opts = visOpts(g).map(function (o) {
        var q = map[o.id] || 0;
        var on = q > 0;
        var out = o.out;
        var stepperOK = multiQty && o.max !== 1 && s.pm === 0;
        var right = '<span class="opt__p">' + (o.p > 0 ? '+ ' + money(o.p) : '') + '</span>';
        var lead;
        if (stepperOK) {
          lead = '<span class="stepper" role="group" aria-label="Quantidade de ' + esc(o.t) + '"><button type="button" data-dec="' + path + '|' + o.id + '" ' + (q ? '' : 'disabled') + ' aria-label="Remover">−</button><output>' + q + '</output>' +
            '<button type="button" data-inc="' + path + '|' + o.id + '" ' + (out || n >= s.max ? 'disabled' : '') + ' aria-label="Adicionar">+</button></span>';
        } else {
          lead = '<span class="opt__mark' + (s.max === 1 ? '' : ' opt__mark--box') + '"></span>';
        }
        var inner = '<span class="opt__lead">' + (stepperOK ? '' : lead) + '</span>' +
          '<span><span class="opt__t">' + esc(o.t) + '</span>' + (o.d ? '<span class="opt__d">' + esc(o.d) + '</span>' : '') + (out ? '<span class="opt__out">Indisponível no momento</span>' : '') + '</span>' +
          (stepperOK ? '<span style="display:grid;justify-items:end;gap:6px">' + right + lead + '</span>' : right);
        var row = stepperOK
          ? '<div class="opt' + (on ? ' is-on' : '') + (out ? ' is-out' : '') + '"' + (!q && !out ? ' data-inc="' + path + '|' + o.id + '"' : '') + '>' + inner + '</div>'
          : '<button type="button" class="opt' + (on ? ' is-on' : '') + (out ? ' is-out' : '') + '" data-toggle="' + path + '|' + o.id + '" ' + (out ? 'aria-disabled="true"' : '') + ' aria-pressed="' + on + '">' + inner + '</button>';
        if (on && o.steps && o.steps.length) row += '<div class="nested">' + stepsHTML(o.steps, path + '.' + o.id + '.', depth + 1) + '</div>';
        return row;
      }).join('');
      return '<div class="step" data-step="' + path + '"><div class="step__head"><div><h3>' + esc(g.t) + '</h3><p>' + stepRuleText(s) + hint + '</p></div>' + badge + '</div><div class="opts">' + opts + '</div></div>';
    }).join('');
  }
  function validate(steps, base) {
    var errs = [];
    steps.forEach(function (s, i) {
      var g = G[s.g]; if (!g) return;
      var path = base + i, map = current.sel[path] || {}, n = selCount(map);
      if (n < s.min) errs.push({ path: path, msg: 'Escolha ' + (s.min - n) + ' opção(ões) em “' + g.t + '”.' });
      Object.keys(map).forEach(function (id) {
        var o = findOpt(g, id);
        if (o && map[id] > 0 && o.steps && o.steps.length) errs = errs.concat(validate(o.steps, path + '.' + o.id + '.'));
      });
    });
    return errs;
  }
  /* campos extras cadastrados no painel: ingredientes, diferenciais, informações, fotos e vídeo */
  function extrasHTML(it) {
    var h = '';
    var chips = function (lista, titulo) {
      return lista && lista.length ? '<div class="pd__bloco"><h3>' + titulo + '</h3><ul class="pd__chips">' +
        lista.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
    };
    h += chips(it.ingredientes, 'Ingredientes') + chips(it.diferenciais, 'Diferenciais');
    if (it.info) h += '<div class="pd__bloco"><h3>Informações</h3><p class="pd__info">' + esc(it.info) + '</p></div>';
    var fotos = (it.midias || []).filter(function (m) { return m.tipo === 'foto'; });
    if (fotos.length > 1) h += '<div class="pd__bloco"><h3>Fotos</h3><div class="pd__galeria">' + fotos.map(function (m, i) {
      return '<button type="button" class="pd__miniatura" data-foto="' + esc(m.url) + '" aria-label="Ver foto ' + (i + 1) + '"><img src="' + esc(m.url) + '" alt="" loading="lazy" width="120" height="120"></button>';
    }).join('') + '</div></div>';
    var video = (it.midias || []).find(function (m) { return m.tipo === 'video'; });
    if (video) h += '<div class="pd__bloco"><h3>Vídeo</h3><video class="pd__video" src="' + esc(video.url) + '" controls playsinline preload="metadata"></video></div>';
    var link = (it.midias || []).find(function (m) { return m.tipo === 'link'; });
    if (link && /^https:\/\//.test(link.url)) h += '<div class="pd__bloco"><a class="btn btn--ghost" href="' + esc(link.url) + '" target="_blank" rel="noopener">▶ Ver o vídeo</a></div>';
    return h;
  }
  function renderProduct(keepScroll) {
    var it = current.it, cat = current.cat;
    var panel = $('#productSheet .sheet__panel');
    var st = keepScroll ? panel.scrollTop : 0;
    var blocked = it.out || !visibleItem(it) || !isActiveNow(cat.off);
    var unit = unitPrice();
    var maxQ = it.max > 0 ? it.max : 99;
    var heroImg = it.img;
    var notice = '';
    var p = displayPrice(it);
    $('#productBody').innerHTML =
      (heroImg ? '<div class="pd__media"><div class="pd__media-inner">' + mediaHTML(heroImg, it.t) + '</div></div>' : '') +
      '<div class="pd__main"><p class="pd__cat">' + esc(trimT(cat.t)) + '</p><h2 class="pd__title" id="pTitle">' + esc(trimT(it.t)) + '</h2>' +
      (it.chamada ? '<p class="pd__chamada">' + esc(it.chamada) + '</p>' : '') +
      (it.d ? '<p class="pd__desc">' + esc(it.d) + '</p>' : '') +
      (p ? '<div class="pd__price">' + priceHTML(it) + '</div>' : '') + notice + extrasHTML(it) +
      stepsHTML(it.steps, '', 0) +
      '<div class="pd__note"><label for="pObs">Alguma observação?</label><textarea id="pObs" maxlength="140" placeholder="Ex.: sem cebola, ponto da carne…">' + esc(current.obs || '') + '</textarea></div>' +
      '<p class="pd__err" id="pErr" hidden></p>' +
      '<div class="pd__bar"><span class="stepper" role="group" aria-label="Quantidade"><button type="button" id="qDec" ' + (current.qty <= 1 ? 'disabled' : '') + ' aria-label="Diminuir">−</button><output id="qOut">' + current.qty + '</output><button type="button" id="qInc" ' + (current.qty >= maxQ ? 'disabled' : '') + ' aria-label="Aumentar">+</button></span>' +
      '<button type="button" class="btn btn--ketchup" id="addBtn" ' + (blocked ? 'disabled' : '') + '><span>' + (blocked ? 'Indisponível' : 'Adicionar') + '</span><span>' + money(unit * current.qty) + '</span></button></div></div>';
    panel.scrollTop = st;
    var img = $('#productBody .pd__media img'); if (img) img.loading = 'eager';
  }
  function openProduct(itemId, preOptId) {
    var ref = itemIndex[itemId]; if (!ref) return;
    current = { it: ref.item, cat: ref.cat, sel: {}, qty: 1, obs: '' };
    if (preOptId && ref.item.steps[0]) {
      var g = G[ref.item.steps[0].g];
      var o = findOpt(g, preOptId);
      if (!o && ref.cat.type === 'pizza') { // sabores: encontrar pelo nome no grupo do tamanho
        var any = null; Object.keys(G).some(function (k) { any = findOpt(G[k], preOptId); return any; });
        if (any) o = g.opts.find(function (x) { return x.t === any.t; });
      }
      if (o && !o.out) current.sel['0'] = (function () { var m = {}; m[o.id] = 1; return m; })();
    }
    renderProduct(false);
    openLayer('#productSheet');
  }
  function onProductClick(e) {
    var mini = e.target.closest('[data-foto]');
    if (mini) {
      var principal = $('#productBody .pd__media img');
      if (principal) { principal.src = mini.dataset.foto; principal.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }
    var t = e.target.closest('[data-toggle],[data-inc],[data-dec],#qInc,#qDec,#addBtn');
    if (!t || !current) return;
    if (t.id === 'qInc') { current.qty++; renderProduct(true); return; }
    if (t.id === 'qDec') { current.qty = Math.max(1, current.qty - 1); renderProduct(true); return; }
    if (t.id === 'addBtn') { addCurrentToCart(); return; }
    var key = t.dataset.toggle || t.dataset.inc || t.dataset.dec;
    var parts = key.split('|'), path = parts[0], id = parts[1];
    var s = stepAt(path); if (!s) return;
    var g = G[s.g], o = findOpt(g, id); if (!o || o.out) return;
    var map = current.sel[path] || (current.sel[path] = {});
    var n = selCount(map);
    if (t.dataset.toggle) {
      if (map[id]) { delete map[id]; clearNested(path + '.' + id + '.'); }
      else if (s.max === 1) { Object.keys(map).forEach(function (k) { clearNested(path + '.' + k + '.'); }); current.sel[path] = {}; current.sel[path][id] = 1; }
      else if (n < s.max) map[id] = 1;
      else { toast('Limite de ' + s.max + ' opções em “' + g.t + '”.'); return; }
    } else if (t.dataset.inc) {
      if (n >= s.max) { toast('Limite de ' + s.max + ' opções em “' + g.t + '”.'); return; }
      if (o.max > 0 && (map[id] || 0) >= o.max) return;
      map[id] = (map[id] || 0) + 1;
    } else {
      map[id] = Math.max(0, (map[id] || 0) - 1);
      if (!map[id]) { delete map[id]; clearNested(path + '.' + id + '.'); }
    }
    renderProduct(true);
  }
  function clearNested(prefix) { Object.keys(current.sel).forEach(function (k) { if (k.indexOf(prefix) === 0) delete current.sel[k]; }); }
  function stepAt(path) {
    var segs = path.split('.');
    var steps = current.it.steps, s = steps[+segs[0]];
    for (var i = 1; i < segs.length; i += 2) {
      var o = findOpt(G[s.g], segs[i]); if (!o) return null;
      s = o.steps[+segs[i + 1]];
    }
    return s;
  }
  function summarize(steps, base, depth) {
    var out = [];
    steps.forEach(function (s, i) {
      var g = G[s.g], path = base + i, map = current.sel[path] || {};
      var parts = [];
      g.opts.forEach(function (o) {
        var q = map[o.id]; if (!q) return;
        parts.push({ t: o.t, q: q, p: o.p });
        if (o.steps && o.steps.length) summarize(o.steps, path + '.' + o.id + '.', depth + 1).forEach(function (x) { out.push(x); });
      });
      if (parts.length) out.push({ g: g.t, opts: parts, depth: depth });
    });
    return out;
  }

  /* ================= carrinho ================= */
  var cart = [];
  try { cart = JSON.parse(store('fama-cart') || '[]') || []; } catch (e) { cart = []; }
  cart = cart.filter(function (l) { return l && itemIndex[l.itemId]; });
  function saveCart() { store('fama-cart', JSON.stringify(cart)); updateCartBtn(); }
  function cartSubtotal() { return cart.reduce(function (a, l) { return a + l.unit * l.qty; }, 0); }
  function updateCartBtn() {
    var n = cart.reduce(function (a, l) { return a + l.qty; }, 0);
    $('#cartCount').hidden = !n; $('#cartCount').textContent = n;
    $('#cartBtnTotal').textContent = money(cartSubtotal());
  }
  function addCurrentToCart() {
    var errs = validate(current.it.steps, '');
    $$('.step.has-error', $('#productBody')).forEach(function (el) { el.classList.remove('has-error'); });
    if (errs.length) {
      var e = $('#pErr'); e.hidden = false; e.textContent = errs[0].msg;
      var st = $('[data-step="' + errs[0].path + '"]'); if (st) { st.classList.add('has-error'); st.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    var obs = ($('#pObs') || {}).value || '';
    var it = current.it;
    var thumb = it.img;
    var sum = summarize(it.steps, '', 0);
    cart.push({ uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), itemId: it.id, title: trimT(it.t), cat: trimT(current.cat.t), img: thumb, qty: current.qty, unit: unitPrice(), sum: sum, obs: obs.trim() });
    saveCart();
    closeLayer('#productSheet');
    var b = $('#openCart'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    toast(current.qty + '× ' + trimT(it.t) + ' no pedido');
    if (window.FamaFX && window.FamaFX.burst) window.FamaFX.burst();
  }
  var checkout = { mode: S.accept.delivery ? 'entrega' : (S.accept.take ? 'retirada' : 'local'), region: '', name: '', street: '', num: '', comp: '', ref: '', pay: S.pay.money ? 'dinheiro' : 'cartao', change: '', card: '', obs: '' };
  try { Object.assign(checkout, JSON.parse(store('fama-checkout') || '{}')); } catch (e) { /* ignora */ }
  function regionFee() { var r = S.regions.find(function (x) { return x.n === checkout.region; }); return checkout.mode === 'entrega' && r ? r.p : 0; }
  function renderCart() {
    var body = $('#cartBody');
    if (!cart.length) {
      body.innerHTML = '<div class="empty"><img src="assets/img/logo-fama.png" alt="" width="80" height="80" style="border-radius:20px;opacity:.85"><p>Seu pedido está vazio.<br>Escolha algo gostoso no cardápio.</p><button type="button" class="btn btn--mustard" data-close>Ver cardápio</button></div>';
      return;
    }
    var st = storeStatus();
    var sub = cartSubtotal(), fee = regionFee(), total = sub + fee;
    var lines = cart.map(function (l) {
      var det = (l.sum || []).map(function (s) { return '<li>' + esc(s.g) + ': ' + s.opts.map(function (o) { return (o.q > 1 ? o.q + '× ' : '') + esc(o.t); }).join(', ') + '</li>'; }).join('');
      return '<div class="cline">' + (l.img ? '<img src="' + imgSrc(l.img) + '" alt="" width="58" height="58">' : '<div class="cline__ph"></div>') +
        '<div><h4>' + esc(l.title) + '</h4><ul>' + det + '</ul>' + (l.obs ? '<p class="cline__obs">Obs.: ' + esc(l.obs) + '</p>' : '') + '</div>' +
        '<div class="cline__right"><span class="cline__price">' + money(l.unit * l.qty) + '</span><span class="stepper"><button type="button" data-cdec="' + l.uid + '" aria-label="Diminuir">−</button><output>' + l.qty + '</output><button type="button" data-cinc="' + l.uid + '" aria-label="Aumentar">+</button></span><button type="button" class="cline__rm" data-crm="' + l.uid + '">Remover</button></div></div>';
    }).join('');
    var modes = [['entrega', 'Entrega', S.accept.delivery], ['retirada', 'Retirada', S.accept.take], ['local', 'No local', S.accept.local]].filter(function (m) { return m[2]; });
    var regionOpts = '<option value="">Selecione o bairro</option>' + S.regions.slice().sort(function (a, b) { return a.n.localeCompare(b.n, 'pt-BR'); })
      .map(function (r) { return '<option value="' + esc(r.n) + '"' + (r.n === checkout.region ? ' selected' : '') + '>' + esc(r.n) + ' — ' + money(r.p) + '</option>'; }).join('');
    var pays = [];
    if (S.pay.money) pays.push(['dinheiro', 'Dinheiro']);
    if (S.pay.card) pays.push(['cartao', 'Cartão']);
    if (S.pay.pix) pays.push(['pix', 'Pix']);
    var minOk = sub >= S.minOrder;
    var issues = [];
    if (!minOk) issues.push('O pedido mínimo é ' + money(S.minOrder) + '.');
    if (!st.open) issues.push('A loja está fechada agora (' + st.label.replace('Fechado · ', '') + ').');
    body.innerHTML = lines +
      '<div class="totals"><div><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
      (checkout.mode === 'entrega' ? '<div><span>Taxa de entrega' + (checkout.region ? ' (' + esc(checkout.region) + ')' : '') + '</span><span>' + (checkout.region ? money(fee) : 'selecione o bairro') + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span>' + money(total) + '</span></div></div>' +
      '<form class="form" id="coForm" novalidate>' +
      '<h3>Como você quer receber?</h3><div class="seg">' + modes.map(function (m) { return '<label><input type="radio" name="mode" value="' + m[0] + '"' + (checkout.mode === m[0] ? ' checked' : '') + '><span>' + m[1] + '</span></label>'; }).join('') + '</div>' +
      '<div class="field"><label for="coName">Seu nome</label><input id="coName" type="text" autocomplete="name" value="' + esc(checkout.name) + '" required></div>' +
      (checkout.mode === 'entrega' ?
        '<div class="field"><label for="coRegion">Bairro (taxa de entrega)</label><select id="coRegion" required>' + regionOpts + '</select></div>' +
        '<div class="field field--2"><div class="field"><label for="coStreet">Rua</label><input id="coStreet" type="text" autocomplete="address-line1" value="' + esc(checkout.street) + '"></div><div class="field"><label for="coNum">Número</label><input id="coNum" type="text" inputmode="numeric" value="' + esc(checkout.num) + '"></div></div>' +
        '<div class="field field--2"><div class="field"><label for="coComp">Complemento</label><input id="coComp" type="text" value="' + esc(checkout.comp) + '"></div><div class="field"><label for="coRef">Referência</label><input id="coRef" type="text" value="' + esc(checkout.ref) + '"></div></div>'
        : '<p class="note">' + (checkout.mode === 'retirada' ? 'Retire em: ' + esc(S.address) + ' · pronto em ' + S.takeTime[0] + '–' + S.takeTime[1] + ' min.' : 'Consumo no local: ' + esc(S.address) + '.') + '</p>') +
      '<h3>Pagamento</h3><div class="seg">' + pays.map(function (p) { return '<label><input type="radio" name="pay" value="' + p[0] + '"' + (checkout.pay === p[0] ? ' checked' : '') + '><span>' + p[1] + '</span></label>'; }).join('') + '</div>' +
      (checkout.pay === 'dinheiro' ? '<div class="field"><label for="coChange">Troco para quanto? (opcional)</label><input id="coChange" type="text" inputmode="decimal" placeholder="Ex.: 100" value="' + esc(checkout.change) + '"></div>' : '') +
      (checkout.pay === 'cartao' && S.pay.cards.length ? '<div class="field"><label for="coCard">Bandeira</label><select id="coCard"><option value="">Selecione</option>' + S.pay.cards.map(function (c) { return '<option' + (c === checkout.card ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="field"><label for="coObs">Observações do pedido</label><textarea id="coObs" maxlength="200">' + esc(checkout.obs) + '</textarea></div>' +
      (issues.length ? '<p class="note note--warn">' + issues.join(' ') + '</p>' : '') +
      '<p class="pd__err" id="coErr" hidden></p>' +
      '<a class="btn btn--ketchup btn--block" id="sendWhats" href="#" target="_blank" rel="noopener"' + (issues.length ? ' aria-disabled="true"' : '') + '>Enviar pedido pelo WhatsApp · ' + money(total) + '</a>' +
      '<p class="note">O pedido abre no WhatsApp da loja (' + esc(fmtPhone(S.whatsapp)) + ') com todos os itens. A loja confirma o pedido e o total por lá.</p>' +
      '<button type="button" class="link-btn" id="clearCart">Esvaziar pedido</button></form>';
    updateWhatsHref();
  }
  function readCheckout() {
    var f = $('#coForm'); if (!f) return;
    var g = function (id) { var el = $('#' + id); return el ? el.value : undefined; };
    var m = f.querySelector('input[name="mode"]:checked'); if (m) checkout.mode = m.value;
    var p = f.querySelector('input[name="pay"]:checked'); if (p) checkout.pay = p.value;
    [['coName', 'name'], ['coRegion', 'region'], ['coStreet', 'street'], ['coNum', 'num'], ['coComp', 'comp'], ['coRef', 'ref'], ['coChange', 'change'], ['coCard', 'card'], ['coObs', 'obs']].forEach(function (k) {
      var v = g(k[0]); if (v !== undefined) checkout[k[1]] = v;
    });
    store('fama-checkout', JSON.stringify(checkout));
  }
  function orderText() {
    var sub = cartSubtotal(), fee = regionFee();
    var L = ['*Pedido — Fama Burguer e Pizzaria*', ''];
    cart.forEach(function (l) {
      L.push('*' + l.qty + '× ' + l.title + '* — ' + money(l.unit * l.qty));
      (l.sum || []).forEach(function (s) { L.push('   ' + s.g + ': ' + s.opts.map(function (o) { return (o.q > 1 ? o.q + '× ' : '') + o.t; }).join(', ')); });
      if (l.obs) L.push('   Obs.: ' + l.obs);
    });
    L.push('', 'Subtotal: ' + money(sub));
    if (checkout.mode === 'entrega') L.push('Taxa de entrega (' + (checkout.region || '—') + '): ' + money(fee));
    L.push('*Total: ' + money(sub + fee) + '*', '');
    L.push('Tipo: ' + ({ entrega: 'Entrega', retirada: 'Retirada', local: 'Consumo no local' })[checkout.mode]);
    L.push('Nome: ' + checkout.name);
    if (checkout.mode === 'entrega') L.push('Endereço: ' + [checkout.street, checkout.num].filter(Boolean).join(', ') + (checkout.comp ? ' – ' + checkout.comp : '') + ' – ' + checkout.region + (checkout.ref ? ' (Ref.: ' + checkout.ref + ')' : ''));
    var pay = ({ dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix' })[checkout.pay];
    if (checkout.pay === 'dinheiro' && checkout.change) pay += ' (troco para R$ ' + checkout.change + ')';
    if (checkout.pay === 'cartao' && checkout.card) pay += ' – ' + checkout.card;
    L.push('Pagamento: ' + pay);
    if (checkout.obs) L.push('Observações: ' + checkout.obs);
    return L.join('\n');
  }
  function checkoutErrors() {
    var e = [];
    if (!checkout.name.trim()) e.push('Informe seu nome.');
    if (checkout.mode === 'entrega') {
      if (!checkout.region) e.push('Selecione o bairro.');
      if (!checkout.street.trim() || !checkout.num.trim()) e.push('Informe rua e número.');
    }
    return e;
  }
  function updateWhatsHref() { var a = $('#sendWhats'); if (a) a.href = waLink(orderText()); }
  function onCartClick(e) {
    var t = e.target.closest('[data-cinc],[data-cdec],[data-crm],#clearCart,#sendWhats'); if (!t) return;
    if (t.id === 'sendWhats') {
      readCheckout();
      var errs = checkoutErrors();
      if (t.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      if (errs.length) { e.preventDefault(); var ce = $('#coErr'); ce.hidden = false; ce.textContent = errs.join(' '); return; }
      updateWhatsHref();
      toast('Abrindo o WhatsApp da loja…');
      return;
    }
    if (t.id === 'clearCart') { cart = []; saveCart(); renderCart(); return; }
    var uid = t.dataset.cinc || t.dataset.cdec || t.dataset.crm;
    var l = cart.find(function (x) { return x.uid === uid; }); if (!l) return;
    var maxQ = (itemIndex[l.itemId].item.max > 0) ? itemIndex[l.itemId].item.max : 99;
    if (t.dataset.cinc) l.qty = Math.min(maxQ, l.qty + 1);
    if (t.dataset.cdec) l.qty = Math.max(1, l.qty - 1);
    if (t.dataset.crm) cart = cart.filter(function (x) { return x.uid !== uid; });
    saveCart(); renderCart();
  }

  /* ================= busca ================= */
  var searchIndex = [];
  function buildSearch() {
    var seen = {};
    visibleCats().forEach(function (c) {
      visibleItems(c).forEach(function (it) {
        searchIndex.push({ k: 'item', it: it, cat: c, t: it.t, d: it.d, img: it.img, n: norm(it.t + ' ' + it.d + ' ' + c.t) });
        it.steps.forEach(function (s, si) {
          var g = G[s.g]; if (!g) return;
          visOpts(g).forEach(function (o) {
            var key = it.id + '|' + norm(o.t);
            if (seen[key]) return; seen[key] = 1;
            searchIndex.push({ k: 'opt', it: it, cat: c, o: o, first: si === 0, t: o.t, d: o.d, img: it.img, n: norm(o.t + ' ' + o.d + ' ' + g.t) });
          });
        });
      });
    });
  }
  function hl(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      if (!w) return;
      var nt = norm(text), idx = nt.indexOf(w);
      if (idx >= 0) { var orig = text.substr(idx, w.length); out = out.replace(esc(orig), '<mark>' + esc(orig) + '</mark>'); }
    });
    return out;
  }
  function runSearch(q) {
    var res = $('#searchResults');
    var words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      res.innerHTML = '<p class="sr-group">Categorias</p>' + D.categories.map(function (c) { return '<button type="button" class="sr" data-goto="' + c.id + '"><div class="sr__ph"></div><span><b>' + esc(trimT(c.t)) + '</b><small>' + c.items.length + ' produtos</small></span><span></span></button>'; }).join('');
      return;
    }
    var hits = searchIndex.filter(function (e) { return words.every(function (w) { return e.n.indexOf(w) >= 0; }); });
    hits.sort(function (a, b) { return (a.o && a.o.out || a.it.out ? 1 : 0) - (b.o && b.o.out || b.it.out ? 1 : 0) || (a.k === 'item' ? 0 : a.first ? 1 : 2) - (b.k === 'item' ? 0 : b.first ? 1 : 2); });
    var items = hits.filter(function (h) { return h.k === 'item' || h.first; }).slice(0, 40);
    var adds = hits.filter(function (h) { return h.k === 'opt' && !h.first; }).slice(0, 20);
    if (!items.length && !adds.length) { res.innerHTML = '<p class="empty">Nada encontrado para “' + esc(q) + '”. Tente outro nome, como “bacon”, “coca” ou “pizza”.</p>'; return; }
    function row(h) {
      var out = h.it.out || (h.o && h.o.out);
      var price = h.o ? (h.o.p > 0 ? '<span class="price">' + money(h.o.p) + '</span>' : '') : priceHTML(h.it);
      var sub = h.o ? (h.first ? esc(trimT(h.it.t)) : 'Adicional em ' + esc(trimT(h.it.t))) : esc(trimT(h.cat.t));
      return '<button type="button" class="sr' + (out ? ' is-out' : '') + '" data-open="' + h.it.id + '"' + (h.o && h.first ? ' data-pre="' + h.o.id + '"' : '') + '>' +
        (h.img ? '<img src="' + imgSrc(h.img) + '" alt="" loading="lazy" width="52" height="52">' : '<div class="sr__ph"></div>') +
        '<span><b>' + hl(h.t, words) + '</b><small>' + sub + (out ? ' · indisponível no momento' : '') + '</small></span>' + price + '</button>';
    }
    res.innerHTML = (items.length ? '<p class="sr-group">Produtos (' + items.length + ')</p>' + items.map(row).join('') : '') +
      (adds.length ? '<p class="sr-group">Adicionais e opções</p>' + adds.map(row).join('') : '');
  }

  /* ================= camadas (modal, carrinho, busca) ================= */
  var openStack = [];
  var lastFocus = null;
  function openLayer(sel) {
    var el = $(sel); if (!el.hidden) return;
    lastFocus = document.activeElement;
    el.hidden = false; openStack.push(sel);
    document.documentElement.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    setTimeout(function () { var f = el.querySelector(sel === '#searchLayer' ? 'input' : '.sheet__close, button'); if (f) f.focus({ preventScroll: true }); }, 30);
  }
  function closeLayer(sel) {
    var el = $(sel); if (el.hidden) return;
    el.hidden = true; openStack = openStack.filter(function (s) { return s !== sel; });
    if (!openStack.length) { document.documentElement.style.overflow = ''; if (lenis) lenis.start(); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
  }
  function goToCat(id) {
    var target = $('#cat-' + id); if (!target) return;
    openStack.slice().forEach(closeLayer);
    var y = target.getBoundingClientRect().top + window.scrollY - ($('#topbar').offsetHeight + $('#catnav').offsetHeight + 8);
    if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function scrollToSel(sel) {
    var t = $(sel); if (!t) return;
    var y = sel === '#inicio' ? 0 : t.getBoundingClientRect().top + window.scrollY - $('#topbar').offsetHeight;
    if (lenis) lenis.scrollTo(y, { duration: 1.6 }); else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ================= modo leve ================= */
  var liteStored = store('fama-lite');
  var conn = navigator.connection || {};
  var weakDevice = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || conn.saveData;
  var LITE = liteStored ? liteStored === '1' : (reduceMotion || !!weakDevice);
  if (LITE) document.body.classList.add('is-lite');
  else document.body.classList.add('is-intro');

  /* ================= rolagem suave ================= */
  var lenis = null;
  if (!LITE && window.Lenis && window.gsap) {
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true });
    if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    window.gsap.ticker.lagSmoothing(0);
  }

  /* ================= abertura: frames ================= */
  var frames = new Array(CONFIG.heroFrames + 1);
  var loadedCount = 0;
  var canvas = $('#frames'), ctx = canvas.getContext('2d');
  var curFrame = 1, drawnFrame = 0;
  function frameSrc(i) { return CONFIG.heroDir + 'f' + String(i).padStart(3, '0') + '.webp'; }
  function nearestLoaded(i) {
    for (var d = 0; d < CONFIG.heroFrames; d++) {
      if (frames[i - d] && frames[i - d].ok) return i - d;
      if (frames[i + d] && frames[i + d].ok) return i + d;
    }
    return 0;
  }
  function drawFrame(i) {
    var n = frames[i] && frames[i].ok ? i : nearestLoaded(i);
    if (!n || n === drawnFrame) return;
    ctx.drawImage(frames[n].img, 0, 0, canvas.width, canvas.height);
    drawnFrame = n;
  }
  function loadFrames(onFirstPass) {
    var order = [1, CONFIG.heroFrames];
    [16, 8, 4, 2, 1].forEach(function (step) { for (var i = 1; i <= CONFIG.heroFrames; i += step) if (order.indexOf(i) < 0) order.push(i); });
    var firstPass = order.indexOf(9) > 0 ? order.indexOf(9) : 20; // até o passo de 8 frames
    var fired = false, active = 0, idx = 0, MAX = 6;
    function next() {
      while (active < MAX && idx < order.length) {
        (function (fi) {
          active++;
          var im = new Image(); im.decoding = 'async';
          frames[fi] = { img: im, ok: false };
          im.onload = function () {
            frames[fi].ok = true; loadedCount++; active--;
            if (fi === curFrame || drawnFrame === 0) { drawnFrame = 0; drawFrame(curFrame); }
            if (!fired) {
              var pct = Math.min(100, Math.round(loadedCount / firstPass * 100));
              $('#loaderBar').style.width = pct + '%';
              if (loadedCount >= firstPass) { fired = true; onFirstPass(); }
            }
            next();
          };
          im.onerror = function () { active--; next(); };
          im.src = frameSrc(fi);
        })(order[idx++]);
      }
    }
    next();
    setTimeout(function () { if (!fired) { fired = true; onFirstPass(); } }, 6000);
  }

  function setupHero() {
    var intro = $('#heroIntro'), finale = $('#heroFinale'), cam = $('#heroCam'), sweep = $('#heroSweep');
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var heroP = 0;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function ramp(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
    function update(p) {
      heroP = p;
      var fp = ramp(p, 0.03, 0.86);
      curFrame = Math.max(1, Math.min(CONFIG.heroFrames, Math.round(1 + fp * (CONFIG.heroFrames - 1))));
      drawFrame(curFrame);
      var introO = 1 - ramp(p, 0.015, 0.09);
      intro.style.opacity = introO; intro.style.transform = 'translateY(' + (-40 * (1 - introO)) + 'px)';
      intro.style.visibility = introO <= 0.01 ? 'hidden' : '';
      var fin = ramp(p, 0.87, 0.97);
      finale.style.opacity = fin; finale.style.transform = 'translateY(' + (30 * (1 - fin)) + 'px)';
      finale.classList.toggle('is-live', fin > 0.5);
      sweep.style.opacity = ramp(p, 0.82, 0.88) * (1 - ramp(p, 0.95, 1));
      sweep.style.backgroundPosition = (120 - ramp(p, 0.82, 0.97) * 140) + '% 0';
      if (window.FamaFX) window.FamaFX.setProgress(p);
      document.body.classList.toggle('is-intro', p < 0.995);
    }
    function camLoop() {
      pointer.x += (pointer.tx - pointer.x) * 0.06; pointer.y += (pointer.ty - pointer.y) * 0.06;
      var fp = ramp(heroP, 0, 0.86), fin = ramp(heroP, 0.85, 0.97);
      fin = fin * fin * (3 - 2 * fin);
      var wide = innerWidth > 820;
      var scale = 1.14 - 0.14 * fp - fin * (wide ? 0.04 : 0.2);
      var rx = (1 - fp) * 7 + pointer.y * -4, ry = pointer.x * 5 - fin * (wide ? 8 : 0);
      var ty = (1 - fp) * 3 - fin * (wide ? 2 : 13);
      var tx = wide ? fin * Math.min(innerWidth * 0.2, 340) : 0;
      cam.style.transform = 'translate(calc(-50% + ' + tx.toFixed(1) + 'px), ' + (-50 + ty).toFixed(2) + '%) perspective(1400px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')';
      requestAnimationFrame(camLoop);
    }
    window.addEventListener('pointermove', function (e) { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
    if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', function (e) { if (e.gamma == null) return; pointer.tx = clamp(e.gamma / 40, -0.5, 0.5); pointer.ty = clamp((e.beta - 45) / 60, -0.5, 0.5); }, { passive: true });
    if (!reduceMotion) requestAnimationFrame(camLoop);

    if (window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: function (self) { update(self.progress); } });
    } else {
      var h = $('#hero');
      window.addEventListener('scroll', function () { var r = h.getBoundingClientRect(); update(clamp(-r.top / (h.offsetHeight - innerHeight), 0, 1)); }, { passive: true });
    }
    update(0);
    $('#skipIntro').addEventListener('click', function () { scrollToSel('#cardapio'); });
  }

  function setupLiteHero() {
    var v = $('#heroVideo'), c = $('#frames'), rep = $('#heroReplay');
    c.hidden = true; v.hidden = false;
    $('#heroFinale').style.opacity = 1;
    document.body.classList.remove('is-intro');
    rep.hidden = false; rep.className = 'btn btn--ghost hero__replay';
    rep.style.position = 'relative'; rep.style.left = 'auto'; rep.style.bottom = 'auto'; rep.style.transform = 'none'; rep.style.margin = '16px auto 0'; rep.style.display = 'flex';
    rep.addEventListener('click', function () { v.preload = 'auto'; v.currentTime = 0; v.play().catch(function () { }); });
    $('#loader').classList.add('is-done');
    $('#skipIntro').addEventListener('click', function () { scrollToSel('#cardapio'); });
  }

  /* ================= calda de ketchup ================= */
  function setupSauce() {
    var g = $('#drips'); if (!g) return;
    var W = 1440, cols = Math.round(W / 70), html = '';
    var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    html += '<path d="M0 0H1440V38C1380 46 1320 30 1260 40S1140 52 1080 40 960 28 900 42 780 54 720 40 600 30 540 44 420 50 360 38 240 30 180 42 60 52 0 40Z" fill="url(#sauceGrad)"/>';
    var drips = [];
    for (var i = 0; i < cols; i++) {
      if (rnd() < 0.35) continue;
      var x = i * 70 + rnd() * 50 + 10, w = 10 + rnd() * 16, len = 40 + rnd() * 190;
      drips.push({ x: x, w: w, len: len });
      // filete que afina e termina numa gota arredondada (forma de calda escorrendo)
      var top = 26, neck = w * 0.34, bulb = w * 0.62, by = top + len;
      var d = 'M' + (x - w * 1.1).toFixed(1) + ' ' + top +
        ' C' + (x - w * 0.55).toFixed(1) + ' ' + top + ' ' + (x - neck).toFixed(1) + ' ' + (top + len * 0.25).toFixed(1) + ' ' + (x - neck).toFixed(1) + ' ' + (by - bulb * 1.2).toFixed(1) +
        ' C' + (x - neck).toFixed(1) + ' ' + (by - bulb * 0.6).toFixed(1) + ' ' + (x - bulb).toFixed(1) + ' ' + (by - bulb * 0.5).toFixed(1) + ' ' + (x - bulb).toFixed(1) + ' ' + by.toFixed(1) +
        ' A' + bulb.toFixed(1) + ' ' + bulb.toFixed(1) + ' 0 0 0 ' + (x + bulb).toFixed(1) + ' ' + by.toFixed(1) +
        ' C' + (x + bulb).toFixed(1) + ' ' + (by - bulb * 0.5).toFixed(1) + ' ' + (x + neck).toFixed(1) + ' ' + (by - bulb * 0.6).toFixed(1) + ' ' + (x + neck).toFixed(1) + ' ' + (by - bulb * 1.2).toFixed(1) +
        ' C' + (x + neck).toFixed(1) + ' ' + (top + len * 0.25).toFixed(1) + ' ' + (x + w * 0.55).toFixed(1) + ' ' + top + ' ' + (x + w * 1.1).toFixed(1) + ' ' + top + 'Z';
      html += '<g class="drip" style="transform-origin:' + x.toFixed(1) + 'px ' + top + 'px"><path d="' + d + '" fill="url(#sauceGrad)"/>' +
        '</g>' +
        '<circle class="drop" cx="' + x.toFixed(1) + '" cy="' + (by + bulb * 2).toFixed(1) + '" r="' + (bulb * 0.55).toFixed(1) + '" fill="#8f0f07" opacity="0"/>';
    }
    g.innerHTML = html;
    if (!window.ScrollTrigger || LITE) return;
    var dripEls = $$('.drip', g), dropEls = $$('.drop', g);
    window.gsap.set(dripEls, { scaleY: 0.08 });
    var tl = window.gsap.timeline({ scrollTrigger: { trigger: '#sauce', start: 'top 95%', end: '+=' + Math.round(innerHeight * 0.9), scrub: 0.6 } });
    tl.to(dripEls, { scaleY: 1, ease: 'power2.out', stagger: { each: 0.02, from: 'random' }, duration: 1 }, 0);
    tl.fromTo(dropEls, { opacity: 0, y: 0 }, { opacity: 0.95, y: function () { return 60 + Math.random() * 160; }, ease: 'power2.in', stagger: { each: 0.03, from: 'random' }, duration: 0.8 }, 0.45);
  }

  /* ================= ingredientes reais flutuando (recortes do vídeo) ================= */
  function setupFloaters() {
    var box = $('#floaters'); if (!box || LITE) return;
    var mobile = innerWidth < 820;
    var specs = mobile ? [
      { s: 'tomate-1', side: 'l', w: 92, y0: 0.18, sp: 0.32, rot: -14 },
      { s: 'alface', side: 'r', w: 110, y0: 0.62, sp: 0.45, rot: 10 },
      { s: 'cebola', side: 'l', w: 78, y0: 1.05, sp: 0.26, rot: 18, far: true }
    ] : [
      { s: 'tomate-1', side: 'l', w: 150, y0: 0.12, sp: 0.34, rot: -12 },
      { s: 'queijo', side: 'r', w: 150, y0: 0.22, sp: 0.26, rot: -6, far: true },
      { s: 'alface', side: 'r', w: 190, y0: 0.62, sp: 0.48, rot: 8 },
      { s: 'cebola', side: 'l', w: 120, y0: 0.78, sp: 0.24, rot: 16, far: true },
      { s: 'tomate-2', side: 'r', w: 118, y0: 1.18, sp: 0.42, rot: 22 }
    ];
    box.innerHTML = specs.map(function (f) {
      return '<img class="floater' + (f.far ? ' is-far' : '') + '" src="assets/img/ing/' + f.s + '.webp" alt="" width="' + f.w + '" decoding="async">';
    }).join('');
    var els = $$('.floater', box);
    function place() {
      var vw = innerWidth, vh = innerHeight, y = window.scrollY, margin = Math.max(0, (vw - 1240) / 2);
      specs.forEach(function (f, i) {
        var x;
        if (mobile) x = f.side === 'l' ? -f.w * 0.5 : vw - f.w * 0.5;
        else x = f.side === 'l' ? Math.max(-f.w * 0.45, (margin - f.w) / 2) : vw - f.w - Math.max(-f.w * 0.45, (margin - f.w) / 2);
        var range = vh + f.w * 2;
        var yy = ((((f.y0 * vh - y * f.sp) % range) + range) % range) - f.w;
        var r = f.rot + y * 0.025 * (i % 2 ? 1 : -1);
        els[i].style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px,0) rotate(' + r.toFixed(2) + 'deg)';
      });
    }
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { place(); ticking = false; }); } }, { passive: true });
    window.addEventListener('resize', place);
    place();
    box.classList.add('is-on');
  }

  /* ================= revelações e navegação ================= */
  function setupReveal() {
    if (LITE || !('IntersectionObserver' in window)) { $$('.reveal').forEach(function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
    if (window.gsap && window.ScrollTrigger) {
      $$('.cat__drip path').forEach(function (p) {
        window.gsap.fromTo(p, { scaleY: 0.2, transformOrigin: '50% 0%' }, { scaleY: 1, ease: 'elastic.out(1, .5)', duration: 1.6, scrollTrigger: { trigger: p.closest('.cat'), start: 'top 75%' } });
      });
    }
  }
  function setupCatnav() {
    var chips = {}; $$('.chip').forEach(function (c) { chips[c.dataset.goto] = c; });
    var active = null;
    function setActive(id) {
      if (id === active) return; active = id;
      $$('.chip.is-active').forEach(function (c) { c.classList.remove('is-active'); });
      var c = chips[id]; if (!c) return; c.classList.add('is-active');
      var bar = $('#catnavInner');
      bar.scrollTo({ left: c.offsetLeft - bar.clientWidth / 2 + c.clientWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    var secs = $$('.cat');
    function onScroll() {
      var line = $('#topbar').offsetHeight + $('#catnav').offsetHeight + 40;
      var cur = null;
      for (var i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top - line <= 0) cur = secs[i].dataset.cat; else break; }
      setActive(cur || (secs[0] && secs[0].dataset.cat));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ================= 3D (WebGL) ================= */
  function setupFX() {
    if (LITE) return;
    var c = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!c) return;
    import(new URL('assets/js/hero3d.js?v=20261114b', document.baseURI).href).then(function (m) {
      window.FamaFX = m.init($('#fx'), { mobile: innerWidth < 820 });
      $('#fx').classList.add('is-on');
      var lastY = window.scrollY, v = 0;
      (function tick() {
        var y = window.scrollY; v = v * 0.85 + (y - lastY) * 0.15; lastY = y;
        if (window.FamaFX) window.FamaFX.setScroll(y, v, document.body.classList.contains('is-intro'));
        requestAnimationFrame(tick);
      })();
    }).catch(function (e) { console.warn('Efeitos 3D indisponíveis:', e); });
  }

  /* ================= eventos ================= */
  function bind() {
    document.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) {
        if (open.classList.contains('is-out') && !open.dataset.open) return;
        e.preventDefault(); openProduct(open.dataset.open, open.dataset.pre || null); return;
      }
      var go = e.target.closest('[data-goto]');
      if (go) { e.preventDefault(); goToCat(go.dataset.goto); return; }
      var sc = e.target.closest('[data-scroll]');
      if (sc) { e.preventDefault(); scrollToSel(sc.dataset.scroll); return; }
      var close = e.target.closest('[data-close]');
      if (close) { var layer = close.closest('.sheet, .drawer, .search'); if (layer) closeLayer('#' + layer.id); }
    });
    $('#productBody').addEventListener('click', onProductClick);
    $('#productBody').addEventListener('input', function (e) { if (e.target.id === 'pObs' && current) current.obs = e.target.value; });
    $('#openCart').addEventListener('click', function () { renderCart(); openLayer('#cartDrawer'); });
    $('#cartBody').addEventListener('click', onCartClick);
    $('#cartBody').addEventListener('change', function (e) {
      if (e.target.name === 'mode' || e.target.name === 'pay' || e.target.id === 'coRegion') { readCheckout(); renderCart(); }
      else { readCheckout(); updateWhatsHref(); }
    });
    $('#cartBody').addEventListener('input', function () { readCheckout(); updateWhatsHref(); });
    $('#openSearch').addEventListener('click', function () { openLayer('#searchLayer'); runSearch($('#searchInput').value); });
    $('#searchInput').addEventListener('input', function (e) { runSearch(e.target.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openStack.length) closeLayer(openStack[openStack.length - 1]);
      if (e.key === '/' && !openStack.length && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openLayer('#searchLayer'); runSearch(''); }
    });
    $('#toggleLite').textContent = LITE ? 'Ativar modo completo (animações 3D)' : 'Ativar modo leve (menos animações)';
    $('#toggleLite').addEventListener('click', function () { store('fama-lite', LITE ? '0' : '1'); location.reload(); });
    $$('.card__img img, .hl-card__img img').forEach(function (img) {
      if (img.complete) img.classList.add('is-loaded'); else img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
    });
    document.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);
    setInterval(function () {
      renderFacts();
      // categorias com horário especial aparecem/somem como no original
      var sig = visibleCats().map(function (c) { return c.id; }).join();
      if (sig !== renderCatalog.sig) { renderCatalog(); renderHighlights(); searchIndex = []; buildSearch(); setupReveal(); setupCatnav(); }
    }, 60000);
  }

  /* ================= início ================= */
  renderFacts();
  renderFooter();
  renderHighlights();
  renderCatalog();
  buildSearch();
  bind();
  updateCartBtn();
  setupSauce();
  setupFloaters();
  setupReveal();
  setupCatnav();
  if (LITE) setupLiteHero();
  else {
    setupHero();
    loadFrames(function () {
      $('#loader').classList.add('is-done');
      setupFX();
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    });
  }
  window.addEventListener('load', function () { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); });
};
