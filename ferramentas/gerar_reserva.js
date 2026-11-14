/* Gera a cópia de reserva (data/menu.js) a partir do cardápio atual do Supabase.
 * O site só usa essa cópia se o banco não responder em 6 s.
 * Uso: curl ... /rest/v1/rpc/cardapio_publico > cardapio.json && node ferramentas/gerar_reserva.js cardapio.json
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = {};
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!raw || !raw.loja || !Array.isArray(raw.produtos) || !raw.produtos.length) {
  console.error('Resposta do Supabase vazia ou inválida: a reserva NÃO foi alterada.');
  process.exit(1);
}
const dados = require(path.join(ROOT, 'assets/js/fonte-dados.js')).converter(raw);
dados.source = 'reserva';
dados.extractedAt = new Date().toISOString().slice(0, 10);
const txt = '/* Cópia de reserva do cardápio, gerada do Supabase por ferramentas/gerar_reserva.js em ' + dados.extractedAt +
  '.\n * Só é usada se o banco não responder. Não editar à mão: mude no painel (/admin) e gere de novo. */\n' +
  'window.FAMA_DATA = ' + JSON.stringify(dados) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data/menu.js'), txt);
const n = dados.categories.reduce((s, c) => s + c.items.length, 0);
console.log('data/menu.js gerado:', dados.categories.length, 'categorias,', n, 'produtos,', (dados.store.coupons || []).length, 'cupons');
