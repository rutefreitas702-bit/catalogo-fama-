-- Cupons de desconto (ex.: Black November): o dono cria no painel e o cliente aplica no carrinho do site.
-- Um cupom por pedido. O desconto é calculado no site e vai descrito na mensagem do WhatsApp;
-- a loja confirma o total na conversa (o site não cobra nada online).

create table public.cupons (
  id              bigint generated always as identity primary key,
  loja_id         bigint not null references public.lojas (id) on delete cascade,
  codigo          text not null check (codigo ~ '^[A-Z0-9]{3,20}$'),
  descricao       text not null default '' check (char_length(descricao) <= 120),
  tipo            text not null check (tipo in ('valor', 'percentual')),
  valor           numeric(10, 2) not null check (valor > 0),
  aplica_em       text not null default 'pedido' check (aplica_em in ('pedido', 'entrega')),
  pedido_minimo   numeric(10, 2) not null default 0 check (pedido_minimo >= 0),
  primeiro_pedido boolean not null default false,
  valido_ate      timestamptz,
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint cupons_percentual_ate_100 check (tipo <> 'percentual' or valor <= 100),
  constraint cupons_codigo_unico unique (loja_id, codigo)
);
comment on table public.cupons is 'Cupons de desconto da loja; visitante só enxerga os ativos e dentro da validade.';

-- o índice da unique (loja_id, codigo) já cobre buscas por loja

create trigger cupons_atualizacao before update on public.cupons
  for each row execute function private.marcar_atualizacao();

alter table public.cupons enable row level security;
grant select on public.cupons to anon, authenticated;
grant insert, update, delete on public.cupons to authenticated;

create policy "visitante le cupons validos" on public.cupons for select to anon
  using (ativo and (valido_ate is null or valido_ate > now()));
create policy "logado le cupons" on public.cupons for select to authenticated
  using ((ativo and (valido_ate is null or valido_ate > now())) or loja_id in (select private.lojas_do_admin()));
create policy "admin cria cupom" on public.cupons for insert to authenticated
  with check (loja_id in (select private.lojas_do_admin()));
create policy "admin altera cupom" on public.cupons for update to authenticated
  using (loja_id in (select private.lojas_do_admin()))
  with check (loja_id in (select private.lojas_do_admin()));
create policy "admin apaga cupom" on public.cupons for delete to authenticated
  using (loja_id in (select private.lojas_do_admin()));

-- cardápio público passa a trazer os cupons válidos (só os que o visitante pode ver, pelas políticas acima)
create or replace function public.cardapio_publico(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with l as (select * from public.lojas where slug = p_slug)
  select jsonb_build_object(
    'loja', (select to_jsonb(l) from l),
    'horarios', coalesce((select jsonb_agg(to_jsonb(h) order by h.dia, h.abre) from public.horarios h where h.loja_id = (select id from l)), '[]'),
    'bairros', coalesce((select jsonb_agg(to_jsonb(b) order by b.ordem, b.nome) from public.bairros_entrega b where b.loja_id = (select id from l)), '[]'),
    'categorias', coalesce((select jsonb_agg(to_jsonb(c) order by c.ordem) from public.categorias c where c.loja_id = (select id from l)), '[]'),
    'produtos', coalesce((select jsonb_agg(to_jsonb(p) order by p.ordem) from public.produtos p where p.loja_id = (select id from l)), '[]'),
    'midias', coalesce((select jsonb_agg(to_jsonb(m) order by m.produto_id, m.ordem) from public.produto_midias m where m.loja_id = (select id from l)), '[]'),
    'grupos', coalesce((select jsonb_agg(to_jsonb(g)) from public.grupos_opcoes g where g.loja_id = (select id from l)), '[]'),
    'opcoes', coalesce((select jsonb_agg(to_jsonb(o) order by o.grupo_id, o.ordem) from public.opcoes o where o.loja_id = (select id from l)), '[]'),
    'etapas', coalesce((select jsonb_agg(to_jsonb(e) order by e.ordem) from public.etapas e where e.loja_id = (select id from l)), '[]'),
    'cupons', coalesce((select jsonb_agg(to_jsonb(k) order by k.ordem, k.id) from public.cupons k
                        where k.loja_id = (select id from l) and k.ativo and (k.valido_ate is null or k.valido_ate > now())), '[]')
  );
$$;
revoke execute on function public.cardapio_publico(text) from public;
grant execute on function public.cardapio_publico(text) to anon, authenticated;

-- Cupons da Black November, iguais aos que a loja publicou (válidos até 30/11 às 23h59, horário de Brasília)
insert into public.cupons (loja_id, codigo, descricao, tipo, valor, aplica_em, pedido_minimo, primeiro_pedido, valido_ate, ordem)
select l.id, c.codigo, c.descricao, c.tipo, c.valor, c.aplica_em, c.minimo, c.primeiro, '2026-11-30 23:59:59-03', c.ordem
from public.lojas l
cross join (values
  ('BLACKNOVO',  'R$10 no pedido acima de R$50 de novos clientes',  'valor',      10, 'pedido',  50, true,  1),
  ('BLACK10',    'Pedidos acima de R$ 30 com 10% off',              'percentual', 10, 'pedido',  30, false, 2),
  ('FRETEBLACK', 'R$5 desconto no frete, pedidos acima de R$ 30',   'valor',       5, 'entrega', 30, false, 3)
) as c (codigo, descricao, tipo, valor, aplica_em, minimo, primeiro, ordem)
where l.slug = 'fama';
