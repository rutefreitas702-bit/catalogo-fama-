/* Pedidos da Fama: envia o pedido para o sistema (Supabase), guarda o código de acompanhamento
 * no aparelho do cliente e consulta o andamento. O preço é sempre recalculado no servidor.
 */
(function (root) {
  'use strict';

  var CFG = root.FamaDados && root.FamaDados.SUPABASE;
  var CHAVE_LOCAL = 'fama-meus-pedidos';

  function rpc(nome, corpo) {
    return fetch(CFG.url + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { apikey: CFG.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (res) {
      return res.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* resposta sem JSON */ }
        if (!res.ok) {
          var err = new Error((json && json.message) || ('HTTP ' + res.status));
          err.codigo = (json && json.message) || '';
          err.rede = false;
          throw err;
        }
        return json;
      });
    }, function (e) {
      var err = new Error('sem_conexao'); err.codigo = 'sem_conexao'; err.rede = true; throw err;
    });
  }

  /* Mensagens claras para o cliente a partir do código de erro do servidor */
  function erroTexto(codigo) {
    var c = String(codigo || ''), partes = c.split(':'), base = partes[0], extra = partes.slice(1).join(':');
    var M = {
      loja_fechada: 'A loja está fechada agora. Tente de novo no horário de funcionamento.',
      pedido_minimo: 'O pedido ainda não atingiu o valor mínimo.',
      bairro_invalido: 'Esse bairro não está na lista de entrega. Escolha outro bairro.',
      endereco_obrigatorio: 'Informe o bairro e o endereço de entrega.',
      nome_obrigatorio: 'Informe seu nome.',
      itens_invalidos: 'Seu carrinho tem itens antigos. Esvazie o pedido e adicione os produtos de novo.',
      opcoes_invalidas: 'Algum item foi alterado no cardápio. Remova-o do pedido e adicione de novo.',
      quantidade_invalida: 'A quantidade de algum item passou do limite permitido.',
      muitos_pedidos: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.',
      mesa_invalida: 'Esta mesa não está mais ativa. Chame um atendente.',
      modo_invalido: 'Essa forma de recebimento não está disponível agora.',
      nao_suportado: 'Esse item não pode ser pedido por aqui. Envie pelo WhatsApp da loja.',
      loja_nao_encontrada: 'Não foi possível encontrar a loja.',
      sem_conexao: 'Sem conexão com a internet. Confira sua rede e tente de novo.'
    };
    if (base === 'produto_indisponivel') return (extra ? '"' + extra + '"' : 'Um produto') + ' acabou de ficar indisponível. Remova-o do pedido.';
    if (base === 'opcao_indisponivel') return (extra ? '"' + extra + '"' : 'Uma opção') + ' acabou de ficar indisponível. Escolha outra.';
    if (base === 'escolha_invalida') return 'Confira as escolhas em "' + extra + '".';
    return M[base] || 'Não foi possível registrar o pedido agora. Tente de novo.';
  }

  /* ----- códigos de acompanhamento guardados no aparelho ----- */
  function lerLocal() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '[]') || []; } catch (e) { return []; }
  }
  function gravarLocal(lista) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(lista.slice(0, 20))); } catch (e) { /* modo privado */ }
  }
  function guardar(res, extra) {
    var lista = lerLocal().filter(function (x) { return x.token !== res.token; });
    lista.unshift(Object.assign({ token: res.token, numero: res.numero, total: res.total, quando: Date.now() }, extra || {}));
    gravarLocal(lista);
  }
  /* só os pedidos das últimas 24 horas */
  function recentes() {
    var limite = Date.now() - 24 * 3600 * 1000;
    return lerLocal().filter(function (x) { return x && x.token && x.quando > limite; });
  }

  root.FamaPedidos = {
    criar: function (p) { return rpc('criar_pedido', { p_slug: CFG.loja, p: p }); },
    acompanhar: function (tokens) {
      if (!tokens.length) return Promise.resolve([]);
      return rpc('acompanhar_pedidos', { p_tokens: tokens }).then(function (r) { return r || []; });
    },
    mesa: function (codigo) { return rpc('mesa_publica', { p_codigo: codigo }); },
    guardar: guardar,
    recentes: recentes,
    erroTexto: erroTexto
  };
})(window);
