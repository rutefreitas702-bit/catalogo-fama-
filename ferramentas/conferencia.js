/* Conferência automática: cardápio original (Anota AI) × novo catálogo renderizado.
 * Regra: o novo catálogo mostra exatamente o que o original mostra — nada a mais, nada a menos.
 *   - O original esconde itens e opções esgotados, categorias sem itens e categorias fora do horário.
 * Uso: node ferramentas/conferencia.js http://localhost:8765/index.html
 * Gera CONFERENCIA.md e ferramentas/conferencia.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const url = process.argv[2] || 'http://localhost:8765/index.html';
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'fonte-original/cardapio-mesclado.json'), 'utf8')).menu;
const aux = {}; raw.menu_aux.forEach(a => { aux[a.category_id] = a; });
const money = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v).replace(/ /g, ' ');
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

// horário da loja (America/Sao_Paulo)
const parts = {};
new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  .formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
const DOW = parts.weekday.slice(0, 3).toLowerCase();
const SECS = (parseInt(parts.hour, 10) % 24) * 3600 + parseInt(parts.minute, 10) * 60 + parseInt(parts.second, 10);
const active = off => !(off || []).some(o => o.short_name === DOW && SECS >= o.start && SECS <= o.end);
const visItem = it => !it.out && active(it.non_active_weekdays);
const visItems = c => active(c.non_active_weekdays) ? c.itens.filter(visItem) : [];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('fama-lite', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);

  const rows = [], problems = [];
  let checks = 0;
  const cats = raw.menu.slice().sort((a, b) => a.order - b.order);
  const shownCats = cats.filter(c => visItems(c).length);
  const hiddenCats = cats.filter(c => !visItems(c).length);

  // 1) categorias: as mesmas, na mesma ordem
  const domCats = await p.$$eval('.cat', els => els.map(e => ({ id: e.dataset.cat, t: e.querySelector('.cat__title').textContent.replace(/\s+/g, ' ').trim() })));
  checks++;
  if (domCats.map(c => c.id).join() !== shownCats.map(c => c._id).join()) problems.push('Categorias diferentes do original. Original: ' + shownCats.map(c => clean(c.title)).join(', ') + ' | Novo: ' + domCats.map(c => c.t).join(', '));
  shownCats.forEach(c => { checks++; const d = domCats.find(x => x.id === c._id); if (!d || d.t.toLowerCase() !== clean(c.title).toLowerCase()) problems.push('Nome de categoria diferente: ' + c.title); });

  // 2) nada que o original esconde aparece
  for (const c of cats) for (const it of c.itens) {
    if (visItems(c).includes(it)) continue;
    checks++;
    if (await p.$(`[data-open="${it._id}"]`)) problems.push(`Aparece no novo, mas o original esconde: ${c.title} > ${it.title}`);
  }

  // 3) produto por produto
  for (const c of shownCats) {
    for (const it of visItems(c)) {
      checks++;
      if (!(await p.$(`#cat-${c._id} [data-open="${it._id}"]`))) { problems.push(`Produto não encontrado: ${c.title} > ${it.title}`); rows.push({ cat: clean(c.title), item: clean(it.title), orig: money(it.price), novo: 'NÃO ENCONTRADO', ok: false }); continue; }
      await p.evaluate(id => document.querySelector(`[data-open="${id}"]`).click(), it._id);
      await p.waitForSelector('#productSheet:not([hidden])');
      const modal = clean(await p.$eval('#productBody', e => e.textContent));
      const title = clean(await p.$eval('#pTitle', e => e.textContent));
      const priceTxt = clean(await p.evaluate(() => { const e = document.querySelector('#productBody .pd__price .price'); return e ? e.textContent : ''; }));
      let ok = true; const miss = [];
      checks++; if (title.toLowerCase() !== clean(it.title).toLowerCase()) { ok = false; miss.push('nome'); }
      if (it.description) { checks++; if (!modal.includes(clean(it.description))) { ok = false; miss.push('descrição'); } }
      if (it.price > 0) { checks++; if (priceTxt !== money(it.price)) { ok = false; miss.push(`preço (${priceTxt})`); } }
      else if (!(it.minimal_price_per_day || []).some(x => x.minimal_price > 0) && !(it.minimal_price > 0)) {
        const s0 = (it.next_steps || [])[0], g0 = s0 && aux[s0.category];
        const ps = g0 ? g0.itens.filter(o => !o.out && o.price > 0).map(o => o.price) : [];
        if (ps.length) {
          checks++;
          const lo = Math.min(...ps), hi = Math.max(...ps);
          const want = (lo !== hi ? 'A partir de' : '') + money(lo);
          if (priceTxt.replace(/\s+/g, '') !== want.replace(/\s+/g, '')) { ok = false; miss.push(`preço a partir de (${priceTxt} ≠ ${want})`); }
        }
      }
      let optCount = 0;
      for (const s of it.next_steps || []) {
        const g = aux[s.category]; if (!g) continue;
        checks++; if (!modal.includes(clean(g.title))) { ok = false; miss.push('grupo ' + g.title); }
        const shownTitles = await p.$$eval(`#productBody .opt .opt__t`, els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
        for (const o of g.itens) {
          checks++;
          if (o.out) { // o original esconde opção esgotada
            const twin = g.itens.some(x => !x.out && clean(x.title) === clean(o.title));
            if (!twin && shownTitles.includes(clean(o.title))) { ok = false; miss.push('opção esgotada aparecendo: ' + o.title); }
            continue;
          }
          optCount++;
          if (!shownTitles.includes(clean(o.title))) { ok = false; miss.push('opção ' + o.title); continue; }
          if (o.price > 0) { checks++; if (!modal.includes('+ ' + money(o.price))) { ok = false; miss.push('preço da opção ' + o.title); } }
          if (o.description) { checks++; if (!modal.includes(clean(o.description))) { ok = false; miss.push('descrição da opção ' + o.title); } }
        }
      }
      await p.evaluate(() => document.querySelector('#productSheet .sheet__close').click());
      if (!ok) problems.push(`${c.title} > ${it.title}: ${miss.join(', ')}`);
      rows.push({ cat: clean(c.title), item: clean(it.title), orig: it.price > 0 ? money(it.price) : '(pelas escolhas)', novo: priceTxt || '(pelas escolhas)', ok, opts: optCount });
    }
  }

  // 3b) mesma ordem do original e a foto de cada card é a foto do próprio item no original
  const crypto = require('crypto');
  const fotosDoOriginal = [], semFoto = [];
  const keyOf = u => u ? crypto.createHash('md5').update(u).digest('hex').slice(0, 12) : null;
  for (const c of shownCats) {
    const dom = await p.$$eval(`#cat-${c._id} .grid > .card`, els => els.map(e => ({ id: e.dataset.open, img: (e.querySelector('img') || {}).getAttribute ? e.querySelector('img').getAttribute('src') : null })));
    checks++;
    if (dom.map(d => d.id).join() !== visItems(c).map(i => i._id).join()) problems.push(`Ordem/quantidade de itens diferente do original em ${c.title}`);
    for (const it of visItems(c)) {
      checks++;
      const d = dom.find(x => x.id === it._id); if (!d) continue;
      let want = keyOf(it.image);
      const real = it.image && it.image.includes('client-assets');
      if (!real) {
        const got0 = d.img ? d.img.replace(/^.*\/p\//, '').replace('.webp', '') : null;
        const fromOpts = (it.next_steps || []).filter(s => s.min >= 1).flatMap(s => (aux[s.category] || { itens: [] }).itens).filter(o => !o.out && o.image).map(o => keyOf(o.image));
        const fromSame = c.itens.filter(x => x !== it && x.image && x.image.includes('client-assets') && clean(it.title).toLowerCase().startsWith(clean(x.title).toLowerCase())).map(x => keyOf(x.image));
        if (got0 && (fromOpts.includes(got0) || fromSame.includes(got0))) { want = got0; fotosDoOriginal.push(`${clean(it.title)} → foto real ${fromOpts.includes(got0) ? 'das opções do próprio item' : 'do mesmo prato (' + c.itens.find(x => keyOf(x.image) === got0).title.trim() + ')'}`); }
        else if (!got0) { want = null; semFoto.push(clean(it.title)); }
      }
      const got = d.img ? d.img.replace(/^.*\/p\//, '').replace('.webp', '') : null;
      if (want !== got) problems.push(`Foto diferente da original: ${c.title} > ${it.title}`);
    }
  }

  // 4) opções mostradas como cards no catálogo: só disponíveis, com o preço original
  const optById = {}; raw.menu_aux.forEach(a => a.itens.forEach(o => { optById[o._id] = o; }));
  const cards = await p.$$eval('[data-pre]', els => els.map(e => ({ o: e.dataset.pre, txt: e.textContent.replace(/\s+/g, ' ').trim() })));
  let cardOk = 0;
  for (const cc of cards) {
    const o = optById[cc.o]; if (!o) continue;
    checks++;
    if (o.out) problems.push('Card de opção esgotada aparecendo: ' + o.title);
    else if (!cc.txt.includes(clean(o.title)) || (o.price > 0 && !cc.txt.includes(money(o.price)))) problems.push('Card de opção divergente: ' + o.title);
    else cardOk++;
  }

  const totalShownItems = shownCats.reduce((a, c) => a + visItems(c).length, 0);
  const report = { url, date: new Date().toISOString(), horaLoja: `${DOW} ${parts.hour}:${parts.minute}`, categoriasExibidas: shownCats.length, categoriasOcultasNoOriginal: hiddenCats.map(c => clean(c.title)), produtosExibidos: totalShownItems, verificacoes: checks, cardsDeOpcao: cardOk, problemas: problems, linhas: rows };
  fs.writeFileSync(path.join(__dirname, 'conferencia.json'), JSON.stringify(report, null, 1));

  let md = '# Conferência do cardápio — Fama Burguer e Pizzaria\n\n';
  md += 'O novo catálogo mostra **exatamente o que o cardápio original mostra**: os mesmos produtos, nomes, descrições, preços e opções.\n';
  md += 'Como no original, itens esgotados, categorias vazias e categorias fora do horário ficam ocultos.\n\n';
  md += `Conferido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário da loja).\n\n`;
  md += `- Categorias exibidas: **${shownCats.length}** (${shownCats.map(c => clean(c.title)).join(', ')})\n`;
  md += `- Categorias ocultas, como no original: ${hiddenCats.map(c => clean(c.title) + (c.non_active_weekdays && c.non_active_weekdays.length ? ' (só no horário dela)' : c.itens.length ? ' (tudo esgotado)' : ' (vazia)')).join(', ')}\n`;
  md += `- Produtos exibidos e conferidos um a um: **${rows.filter(r => r.ok).length} de ${totalShownItems}**\n`;
  md += `- Verificações (nome, descrição, preço, cada opção e preço de opção, e itens ocultos que não podem aparecer): **${checks}**\n`;
  md += `- Divergências: **${problems.length}**\n\n`;
  if (problems.length) md += '## Divergências\n\n' + problems.map(x => '- ' + x).join('\n') + '\n\n';
  md += '## Preços e fotos\n\n- Itens cujo preço depende da escolha mostram "A partir de" o menor preço real das opções disponíveis (ou o preço direto quando todas custam o mesmo).\n- Destaques sem preço.\n';
  fotosDoOriginal.forEach(x => { md += '- ' + x + '\n'; });
  if (semFoto.length) md += '- Sem nenhuma foto no cardápio original: ' + semFoto.join(', ') + '\n';
  md += '\n## Pontos do original para a loja revisar (mantidos como estão)\n\n';
  md += '- **Cheddar Bacon Búrguer artesanal R$24,90 (PROMOÇÃO)**: o nome diz R$ 24,90, mas o preço cadastrado é R$ 25,90.\n';
  md += '- **Pizza com 2 sabores**: o catálogo cobra pelo sabor de maior valor. Confirme a regra (`CONFIG.priceModel1` em `assets/js/app.js`).\n\n';
  md += '## Produto por produto\n\n| Categoria | Produto | Preço original | Preço exibido | Opções conferidas | Conferido |\n|---|---|---|---|---:|:---:|\n';
  rows.forEach(r => { md += `| ${r.cat} | ${r.item.replace(/\|/g, '/')} | ${r.orig} | ${r.novo} | ${r.opts || 0} | ${r.ok ? 'OK' : 'ERRO'} |\n`; });
  fs.writeFileSync(path.join(ROOT, 'CONFERENCIA.md'), md);
  console.log(JSON.stringify({ horaLoja: report.horaLoja, categoriasExibidas: shownCats.length, ocultas: report.categoriasOcultasNoOriginal, produtosExibidos: totalShownItems, verificacoes: checks, cardsDeOpcao: cardOk, problemas: problems }, null, 1));
  await b.close();
})();
