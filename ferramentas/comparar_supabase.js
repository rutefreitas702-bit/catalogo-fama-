/* Compara o cardápio vindo do Supabase (convertido por fonte-dados.js) com data/menu.js.
 * Uso: node ferramentas/comparar_supabase.js cardapio.json
 * cardapio.json = resposta de rpc/cardapio_publico. Deve dar 0 diferenças.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'data/menu.js'));
const A = window.FAMA_DATA;
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const B = require(path.join(ROOT, 'assets/js/fonte-dados.js')).converter(raw);

// mapa id do banco → id original (origem_id)
const orig = {};
['categorias', 'produtos', 'grupos', 'opcoes'].forEach(k => (raw[k] || []).forEach(x => { orig[k[0] + x.id] = x.origem_id; }));
const diffs = [];
// compara valores ignorando a ordem das chaves dos objetos (o banco guarda JSON com chaves ordenadas)
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v);
const eq = (a, b, onde) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) diffs.push(`${onde}: original=${JSON.stringify(a)} supabase=${JSON.stringify(b)}`); };
const img = k => (k ? `assets/img/p/${k}.webp` : null);
const steps = (ss) => (ss || []).map(s => ({ g: s.g, min: s.min, max: s.max, pm: s.pm }));
const stepsB = (ss) => (ss || []).map(s => ({ g: orig['g' + s.g], min: s.min, max: s.max, pm: s.pm }));

eq(A.categories.length, B.categories.length, 'qtd categorias');
A.categories.forEach((ca, i) => {
  const cb = B.categories[i]; if (!cb) return;
  const w = `cat ${ca.t.trim()}`;
  eq(ca.id, orig['c' + cb.id], w + ' id'); eq(ca.t.trim(), cb.t, w + ' nome'); eq(ca.type, cb.type, w + ' tipo');
  eq(!!ca.promo, cb.promo, w + ' promo'); eq(ca.off || [], cb.off, w + ' horario');
  eq(ca.items.length, cb.items.length, w + ' qtd itens');
  ca.items.forEach((ia, j) => {
    const ib = cb.items[j]; if (!ib) return;
    const v = `${w} > ${ia.t.trim()}`;
    eq(ia.id, orig['p' + ib.id], v + ' id'); eq(ia.t.trim(), ib.t, v + ' nome'); eq(ia.d || '', ib.d, v + ' descricao');
    eq(ia.p, ib.p, v + ' preco'); eq(!!ia.out, ib.out, v + ' esgotado'); eq(img(ia.img), ib.img, v + ' foto');
    eq(ia.max > 0 ? ia.max : -1, ib.max, v + ' max'); eq(steps(ia.steps), stepsB(ib.steps), v + ' etapas');
    eq(ia.minp == null ? null : ia.minp, ib.minp == null ? null : ib.minp, v + ' a partir de');
    eq(ia.minDay || null, ib.minDay || null, v + ' preco por dia'); eq(ia.off || [], ib.off || [], v + ' horario');
  });
});
eq(Object.keys(A.groups).length, Object.keys(B.groups).length, 'qtd grupos');
Object.values(B.groups).forEach(gb => {
  const ga = A.groups[orig['g' + gb.id]]; if (!ga) { diffs.push('grupo sem par: ' + gb.t); return; }
  const w = `grupo ${ga.t}`;
  eq(ga.t.trim(), gb.t, w + ' nome'); eq(ga.type, gb.type, w + ' tipo'); eq(ga.opts.length, gb.opts.length, w + ' qtd opcoes');
  ga.opts.forEach((oa, j) => {
    const ob = gb.opts[j]; if (!ob) return;
    const v = `${w} > ${oa.t.trim()}`;
    eq(oa.id, orig['o' + ob.id], v + ' id'); eq(oa.t.trim(), ob.t, v + ' nome'); eq(oa.d || '', ob.d, v + ' descricao');
    eq(oa.p, ob.p, v + ' preco'); eq(!!oa.out, ob.out, v + ' esgotado'); eq(img(oa.img), ob.img, v + ' foto');
    eq(oa.max > 0 ? oa.max : -1, ob.max, v + ' max'); eq(steps(oa.steps), stepsB(ob.steps), v + ' etapas');
  });
});
eq(A.highlights.map(h => h[1]), B.highlights.map(h => orig['p' + h[1]]), 'destaques');
const SA = A.store, SB = B.store;
['name', 'whatsapp', 'phones', 'address', 'tz', 'week', 'minOrder', 'deliveryTime', 'takeTime', 'accept', 'pay', 'regions', 'segments', 'orderUrl']
  .forEach(k => eq(SA[k], SB[k], 'loja ' + k));
eq(SA.addressParts.city, SB.addressParts.city, 'loja cidade'); eq(SA.addressParts.state, SB.addressParts.state, 'loja uf');

console.log(`categorias ${B.categories.length} · produtos ${B.categories.reduce((a, c) => a + c.items.length, 0)} · grupos ${Object.keys(B.groups).length} · opcoes ${Object.values(B.groups).reduce((a, g) => a + g.opts.length, 0)}`);
console.log(diffs.length ? `DIFERENÇAS (${diffs.length}):\n` + diffs.slice(0, 40).join('\n') : 'Nenhuma diferença: o Supabase tem exatamente o mesmo cardápio do site.');
process.exitCode = diffs.length ? 1 : 0;
