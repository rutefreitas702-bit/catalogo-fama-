-- Pedidos passam a aceitar pizzas e produtos com sabores combinados (ex.: suco 2 sabores).
-- Regra de preço da etapa (etapas.regra_preco), a mesma usada no site:
--   0 = soma das opções escolhidas
--   1 = cobra a opção de MAIOR valor (ex.: pizza meio a meio)
--   2 = cobra a MÉDIA das opções escolhidas
-- Nada muda para quem já pedia produtos simples.

create or replace function public.criar_pedido(p_slug text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loja public.lojas%rowtype;
  v_mesa public.mesas%rowtype;
  v_cupom public.cupons%rowtype;
  v_origem text := p->>'origem';
  v_modo text;
  v_nome text := left(btrim(coalesce(p->>'nome', '')), 80);
  v_itens jsonb := p->'itens';
  v_it jsonb;
  v_prod record;
  v_etapa record;
  v_opc record;
  v_map jsonb;
  v_k text;
  v_v jsonb;
  v_q int;
  v_soma int;
  v_qtd int;
  v_unit numeric;
  v_opcs jsonb;
  v_vals numeric[];
  v_linhas jsonb := '[]'::jsonb;
  v_sub numeric := 0;
  v_taxa numeric := 0;
  v_taxa_conf boolean := false;
  v_desc numeric := 0;
  v_total numeric;
  v_bairro text;
  v_cod text;
  v_idx int := 0;
  v_numero int;
  v_hoje timestamptz;
  v_pedido_id bigint;
  v_token uuid;
  v_status text;
begin
  select * into v_loja from public.lojas where slug = p_slug;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  if v_loja.fechada_hoje then raise exception 'loja_fechada'; end if;
  if v_origem is null or v_origem not in ('mesa', 'delivery') then raise exception 'origem_invalida'; end if;
  if v_nome = '' then raise exception 'nome_obrigatorio'; end if;
  if v_itens is null or jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 or jsonb_array_length(v_itens) > 40 then
    raise exception 'itens_invalidos';
  end if;

  -- proteção contra envio em massa
  if (select count(*) from public.pedidos where loja_id = v_loja.id and criado_em > now() - interval '2 minutes') >= 30 then
    raise exception 'muitos_pedidos';
  end if;

  if v_origem = 'mesa' then
    select * into v_mesa from public.mesas where codigo = p->>'mesa' and loja_id = v_loja.id and ativa;
    if not found then raise exception 'mesa_invalida'; end if;
    if (select count(*) from public.pedidos where mesa_id = v_mesa.id and criado_em > now() - interval '10 minutes') >= 8 then
      raise exception 'muitos_pedidos';
    end if;
    v_modo := 'mesa';
  else
    v_modo := p->>'modo';
    if v_modo is null or v_modo not in ('entrega', 'retirada', 'local') then raise exception 'modo_invalido'; end if;
    if (v_modo = 'entrega' and not v_loja.aceita_entrega) or (v_modo = 'retirada' and not v_loja.aceita_retirada)
       or (v_modo = 'local' and not v_loja.aceita_local) then
      raise exception 'modo_invalido';
    end if;
  end if;

  for v_it in select value from jsonb_array_elements(v_itens) loop
    if jsonb_typeof(v_it->'qtd') <> 'number' or jsonb_typeof(v_it->'produto') not in ('number', 'string') then
      raise exception 'itens_invalidos';
    end if;
    v_qtd := (v_it->>'qtd')::int;
    if v_qtd < 1 or v_qtd > 30 then raise exception 'quantidade_invalida'; end if;

    select pr.id, pr.nome, pr.preco, pr.preco_promocional, pr.disponivel, pr.max_por_pedido, c.tipo as cat_tipo
      into v_prod
      from public.produtos pr join public.categorias c on c.id = pr.categoria_id
     where pr.id = (v_it->>'produto')::bigint and pr.loja_id = v_loja.id and pr.status = 'ativo' and c.ativa;
    if not found then raise exception 'produto_indisponivel:%', left(coalesce(v_it->>'nome', ''), 80); end if;
    if not v_prod.disponivel then raise exception 'produto_indisponivel:%', v_prod.nome; end if;
    if v_prod.max_por_pedido is not null and v_prod.max_por_pedido > 0 and v_qtd > v_prod.max_por_pedido then
      raise exception 'quantidade_invalida';
    end if;

    v_unit := case when v_prod.preco_promocional is not null and v_prod.preco_promocional > 0 and v_prod.preco > 0
                        and v_prod.preco_promocional < v_prod.preco
                   then v_prod.preco_promocional else v_prod.preco end;
    v_opcs := '[]'::jsonb;

    if v_it ? 'etapas' and jsonb_typeof(v_it->'etapas') <> 'array' then raise exception 'opcoes_invalidas'; end if;
    -- grupos enviados precisam ser do produto
    if exists (select 1 from jsonb_array_elements(coalesce(v_it->'etapas', '[]'::jsonb)) x
                where jsonb_typeof(x->'o') <> 'object'
                   or not exists (select 1 from public.etapas e where e.produto_id = v_prod.id and e.grupo_id::text = x->>'g')) then
      raise exception 'opcoes_invalidas';
    end if;

    for v_etapa in
      select e.grupo_id, e.minimo, e.maximo, e.regra_preco, g.nome as grupo_nome
        from public.etapas e join public.grupos_opcoes g on g.id = e.grupo_id
       where e.produto_id = v_prod.id
       order by e.ordem, e.id
    loop
      select x->'o' into v_map
        from jsonb_array_elements(coalesce(v_it->'etapas', '[]'::jsonb)) x
       where x->>'g' = v_etapa.grupo_id::text
       limit 1;
      v_map := coalesce(v_map, '{}'::jsonb);
      if v_etapa.regra_preco not in (0, 1, 2) then raise exception 'nao_suportado'; end if;
      v_soma := 0;
      v_vals := '{}'::numeric[];
      for v_k, v_v in select key, value from jsonb_each(v_map) loop
        if jsonb_typeof(v_v) <> 'number' or v_k !~ '^[0-9]{1,18}$' then raise exception 'opcoes_invalidas'; end if;
        v_q := (v_v #>> '{}')::int;
        if v_q < 0 then raise exception 'opcoes_invalidas'; end if;
        continue when v_q = 0;
        select o.id, o.nome, o.preco, o.disponivel, o.max_por_item into v_opc
          from public.opcoes o
         where o.id = v_k::bigint and o.grupo_id = v_etapa.grupo_id and o.loja_id = v_loja.id;
        if not found then raise exception 'opcoes_invalidas'; end if;
        if not v_opc.disponivel then raise exception 'opcao_indisponivel:%', v_opc.nome; end if;
        if v_opc.max_por_item is not null and v_opc.max_por_item > 0 and v_q > v_opc.max_por_item then
          raise exception 'opcoes_invalidas';
        end if;
        if exists (select 1 from public.etapas where opcao_id = v_opc.id) then raise exception 'nao_suportado'; end if;
        v_soma := v_soma + v_q;
        if v_etapa.regra_preco = 0 then
          v_unit := v_unit + v_opc.preco * v_q;
        else
          v_vals := v_vals || array_fill(v_opc.preco, array[v_q]);
        end if;
        v_opcs := v_opcs || jsonb_build_array(jsonb_build_object('grupo', v_etapa.grupo_nome, 'nome', v_opc.nome, 'qtd', v_q, 'preco', v_opc.preco));
      end loop;
      if v_soma < v_etapa.minimo or v_soma > v_etapa.maximo then
        raise exception 'escolha_invalida:%', v_etapa.grupo_nome;
      end if;
      if cardinality(v_vals) > 0 then
        v_unit := v_unit + case when v_etapa.regra_preco = 1
                                then (select max(x) from unnest(v_vals) x)
                                else (select avg(x) from unnest(v_vals) x) end;
      end if;
    end loop;

    v_sub := v_sub + v_unit * v_qtd;
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'produto_id', v_prod.id, 'nome', v_prod.nome, 'qtd', v_qtd, 'unit', round(v_unit, 2), 'opcoes', v_opcs,
      'obs', left(nullif(btrim(coalesce(v_it->>'obs', '')), ''), 200), 'ordem', v_idx));
    v_idx := v_idx + 1;
  end loop;

  if v_origem = 'delivery' then
    if v_sub < coalesce(v_loja.pedido_minimo, 0) then raise exception 'pedido_minimo'; end if;
    if v_modo = 'entrega' then
      v_bairro := left(btrim(coalesce(p->>'bairro', '')), 80);
      if v_bairro = '' then raise exception 'endereco_obrigatorio'; end if;
      if exists (select 1 from public.bairros_entrega where loja_id = v_loja.id and ativo) then
        select taxa into v_taxa from public.bairros_entrega where loja_id = v_loja.id and ativo and nome = v_bairro limit 1;
        if not found then raise exception 'bairro_invalido'; end if;
      else
        v_taxa := 0;
        v_taxa_conf := true;
      end if;
    end if;
    v_cod := upper(btrim(coalesce(p->>'cupom', '')));
    if v_cod <> '' then
      select * into v_cupom from public.cupons
       where loja_id = v_loja.id and codigo = v_cod and ativo and (valido_ate is null or valido_ate > now());
      if found and v_sub >= v_cupom.pedido_minimo then
        if v_cupom.aplica_em = 'entrega' then
          if v_modo = 'entrega' then
            v_desc := case when v_cupom.tipo = 'percentual' then v_taxa * v_cupom.valor / 100 else least(v_cupom.valor, v_taxa) end;
          end if;
        else
          v_desc := case when v_cupom.tipo = 'percentual' then v_sub * v_cupom.valor / 100 else least(v_cupom.valor, v_sub) end;
        end if;
        v_desc := round(v_desc, 2);
        if v_desc <= 0 then v_cod := null; end if;
      else
        v_cod := null;
      end if;
    else
      v_cod := null;
    end if;
  end if;

  v_sub := round(v_sub, 2);
  v_total := greatest(0, v_sub + v_taxa - v_desc);
  v_status := case when v_origem = 'mesa' then 'novo' else 'aguardando' end;

  -- número do pedido: recomeça todo dia, no fuso da loja
  perform pg_advisory_xact_lock(hashtextextended('pedidos-loja-' || v_loja.id, 0));
  v_hoje := date_trunc('day', now() at time zone v_loja.fuso) at time zone v_loja.fuso;
  select coalesce(max(numero), 0) + 1 into v_numero from public.pedidos where loja_id = v_loja.id and criado_em >= v_hoje;

  insert into public.pedidos (loja_id, numero, origem, modo, mesa_id, mesa_numero, cliente_nome, endereco, bairro, pagamento,
                              observacao, cupom, subtotal, taxa_entrega, taxa_a_confirmar, desconto, total, status,
                              tempo_estimado_min, confirmado_em)
  values (v_loja.id, v_numero, v_origem, v_modo, v_mesa.id, v_mesa.numero, v_nome,
          case when v_modo = 'entrega' then left(nullif(btrim(coalesce(p->>'endereco', '')), ''), 300) end,
          v_bairro,
          left(nullif(btrim(coalesce(p->>'pagamento', '')), ''), 80),
          left(nullif(btrim(coalesce(p->>'observacao', '')), ''), 300),
          v_cod, v_sub, v_taxa, v_taxa_conf, v_desc, v_total, v_status,
          v_loja.tempo_preparo_min,
          case when v_status = 'novo' then now() end)
  returning id, token into v_pedido_id, v_token;

  insert into public.pedido_itens (pedido_id, loja_id, produto_id, nome, quantidade, preco_unitario, total, opcoes, observacao, ordem)
  select v_pedido_id, v_loja.id, (x->>'produto_id')::bigint, x->>'nome', (x->>'qtd')::int, (x->>'unit')::numeric,
         round((x->>'unit')::numeric * (x->>'qtd')::int, 2), x->'opcoes', x->>'obs', (x->>'ordem')::int
    from jsonb_array_elements(v_linhas) x;

  return jsonb_build_object('numero', v_numero, 'token', v_token, 'total', v_total, 'tempo', v_loja.tempo_preparo_min,
                            'status', v_status, 'taxa_a_confirmar', v_taxa_conf);
end;
$$;
revoke execute on function public.criar_pedido(text, jsonb) from public;
grant execute on function public.criar_pedido(text, jsonb) to anon, authenticated;

-- Mesas do salão da Fama (QR Codes); o dono pode renomear, desativar ou criar mais no painel de gestão
insert into public.mesas (loja_id, numero)
select l.id, n from public.lojas l cross join generate_series(1, 10) n
 where l.slug = 'fama'
on conflict (loja_id, numero) do nothing;
