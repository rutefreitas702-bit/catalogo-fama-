-- Importação inicial do cardápio (uso único). Removida pela migração seguinte.
-- Só funciona com um token gerado no banco e é apagada depois de usada.
create table private.token_importacao (token uuid primary key default gen_random_uuid(), usado boolean not null default false);
alter table private.token_importacao enable row level security;

create or replace function public.importar_cardapio(p_token uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loja bigint;
begin
  update private.token_importacao set usado = true where token = p_token and not usado;
  if not found then
    raise exception 'token de importação inválido ou já usado';
  end if;

  insert into public.lojas (slug, nome, whatsapp, telefones, endereco, cidade, uf, fuso, pedido_minimo,
    entrega_min, entrega_max, retirada_min, retirada_max, aceita_entrega, aceita_retirada, aceita_local,
    pagamentos, bandeiras, link_pedido_online)
  select x.slug, x.nome, x.whatsapp, x.telefones, x.endereco, x.cidade, x.uf, x.fuso, x.pedido_minimo,
    x.entrega_min, x.entrega_max, x.retirada_min, x.retirada_max, x.aceita_entrega, x.aceita_retirada, x.aceita_local,
    x.pagamentos, x.bandeiras, x.link_pedido_online
  from jsonb_to_record(p->'loja') as x(slug text, nome text, whatsapp text, telefones text[], endereco text, cidade text, uf text,
    fuso text, pedido_minimo numeric, entrega_min int, entrega_max int, retirada_min int, retirada_max int,
    aceita_entrega boolean, aceita_retirada boolean, aceita_local boolean, pagamentos jsonb, bandeiras text[], link_pedido_online text)
  returning id into v_loja;

  insert into public.horarios (loja_id, dia, abre, fecha)
  select v_loja, x.dia, x.abre::time, x.fecha::time from jsonb_to_recordset(p->'horarios') as x(dia smallint, abre text, fecha text);

  insert into public.bairros_entrega (loja_id, nome, taxa, ordem)
  select v_loja, x.nome, x.taxa, x.ordem from jsonb_to_recordset(p->'bairros') as x(nome text, taxa numeric, ordem int);

  insert into public.categorias (loja_id, nome, tipo, ordem, mostrar_selo_promocao, fora_do_ar, origem_id)
  select v_loja, x.nome, x.tipo, x.ordem, x.promo, x.fora, x.origem
  from jsonb_to_recordset(p->'categorias') as x(origem text, nome text, tipo text, ordem int, promo boolean, fora jsonb);

  insert into public.grupos_opcoes (loja_id, nome, tipo, origem_id)
  select v_loja, x.nome, x.tipo, x.origem from jsonb_to_recordset(p->'grupos') as x(origem text, nome text, tipo text);

  insert into public.opcoes (loja_id, grupo_id, nome, descricao, preco, disponivel, max_por_item, foto, ordem, origem_id)
  select v_loja, g.id, x.nome, x.descricao, x.preco, x.disponivel, x.max, x.foto, x.ordem, x.origem
  from jsonb_to_recordset(p->'opcoes') as x(origem text, grupo text, nome text, descricao text, preco numeric,
       disponivel boolean, max int, foto text, ordem int)
  join public.grupos_opcoes g on g.loja_id = v_loja and g.origem_id = x.grupo;

  insert into public.produtos (loja_id, categoria_id, nome, descricao, preco, disponivel, max_por_pedido, ordem,
    preco_minimo, preco_minimo_dia, fora_do_ar, destaque, destaque_ordem, descricao_origem, origem_id)
  select v_loja, c.id, x.nome, x.descricao, x.preco, x.disponivel, x.max, x.ordem,
    x.minp, x.minday, x.fora, x.destaque, x.destaque_ordem, 'importada', x.origem
  from jsonb_to_recordset(p->'produtos') as x(origem text, categoria text, nome text, descricao text, preco numeric,
       disponivel boolean, max int, ordem int, minp numeric, minday jsonb, fora jsonb, destaque boolean, destaque_ordem int)
  join public.categorias c on c.loja_id = v_loja and c.origem_id = x.categoria;

  insert into public.produto_midias (loja_id, produto_id, tipo, caminho, ordem)
  select v_loja, pr.id, 'foto', x.caminho, x.ordem
  from jsonb_to_recordset(p->'midias') as x(produto text, caminho text, ordem int)
  join public.produtos pr on pr.loja_id = v_loja and pr.origem_id = x.produto;

  insert into public.etapas (loja_id, produto_id, opcao_id, grupo_id, ordem, minimo, maximo, regra_preco)
  select v_loja, pr.id, o.id, g.id, x.ordem, x.min, x.max, x.pm
  from jsonb_to_recordset(p->'etapas') as x(produto text, opcao text, grupo text, ordem int, min int, max int, pm smallint)
  join public.grupos_opcoes g on g.loja_id = v_loja and g.origem_id = x.grupo
  left join public.produtos pr on pr.loja_id = v_loja and pr.origem_id = x.produto
  left join public.opcoes o on o.loja_id = v_loja and o.origem_id = x.opcao;

  return jsonb_build_object(
    'loja', v_loja,
    'horarios', (select count(*) from public.horarios where loja_id = v_loja),
    'bairros', (select count(*) from public.bairros_entrega where loja_id = v_loja),
    'categorias', (select count(*) from public.categorias where loja_id = v_loja),
    'produtos', (select count(*) from public.produtos where loja_id = v_loja),
    'midias', (select count(*) from public.produto_midias where loja_id = v_loja),
    'grupos', (select count(*) from public.grupos_opcoes where loja_id = v_loja),
    'opcoes', (select count(*) from public.opcoes where loja_id = v_loja),
    'etapas', (select count(*) from public.etapas where loja_id = v_loja));
end;
$$;
revoke execute on function public.importar_cardapio(uuid, jsonb) from public, authenticated;
grant execute on function public.importar_cardapio(uuid, jsonb) to anon;
