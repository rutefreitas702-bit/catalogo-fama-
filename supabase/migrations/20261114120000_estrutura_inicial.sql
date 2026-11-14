-- =====================================================================
-- Catálogo Fama — estrutura inicial (Etapa 1)
-- Loja(s), horários, bairros, categorias, produtos, mídias,
-- grupos de opções (tamanhos, sabores, adicionais), administradores.
-- Segurança: RLS em todas as tabelas. Visitante (anon) só LÊ o que é público;
-- só administradores da loja ESCREVEM.
-- =====================================================================

create schema if not exists private;

-- ---------- Tabelas ----------
create table public.lojas (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  whatsapp text not null,
  telefones text[] not null default '{}',
  endereco text,
  cidade text,
  uf text,
  fuso text not null default 'America/Sao_Paulo',
  pedido_minimo numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  entrega_min int, entrega_max int,
  retirada_min int, retirada_max int,
  aceita_entrega boolean not null default true,
  aceita_retirada boolean not null default true,
  aceita_local boolean not null default true,
  pagamentos jsonb not null default '{}'::jsonb,
  bandeiras text[] not null default '{}',
  fechada_hoje boolean not null default false,
  mostrar_esgotados boolean not null default false,
  link_pedido_online text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.horarios (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  dia smallint not null check (dia between 0 and 6), -- 0 = domingo
  abre time not null,
  fecha time not null
);
create index horarios_loja_idx on public.horarios (loja_id);

create table public.bairros_entrega (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  nome text not null,
  taxa numeric(10,2) not null default 0 check (taxa >= 0),
  ativo boolean not null default true,
  ordem int not null default 0
);
create index bairros_loja_idx on public.bairros_entrega (loja_id);

create table public.categorias (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'simples' check (tipo in ('simples', 'pizza')),
  ordem int not null default 0,
  ativa boolean not null default true,
  mostrar_selo_promocao boolean not null default false,
  -- janelas em que a categoria NÃO aparece: [{"d":"mon","s":0,"e":64740}, ...] (segundos do dia)
  fora_do_ar jsonb not null default '[]'::jsonb,
  origem_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index categorias_loja_idx on public.categorias (loja_id, ordem);

create table public.produtos (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  categoria_id bigint not null references public.categorias(id) on delete restrict,
  nome text not null check (char_length(nome) between 1 and 160),
  chamada text,
  descricao text,
  ingredientes text[] not null default '{}',
  diferenciais text[] not null default '{}',
  info_adicional text,
  preco numeric(10,2) not null default 0 check (preco >= 0),
  preco_promocional numeric(10,2) check (preco_promocional is null or preco_promocional >= 0),
  preco_minimo numeric(10,2),                 -- "a partir de" fixo (ex.: pizzas)
  preco_minimo_dia jsonb,                     -- {"wed": 29.9, ...} igual ao original
  status text not null default 'ativo' check (status in ('ativo', 'arquivado')),
  disponivel boolean not null default true,   -- false = esgotado hoje
  destaque boolean not null default false,
  destaque_ordem int,
  novidade boolean not null default false,
  novidade_ate date,
  max_por_pedido int,                         -- null = sem limite
  fora_do_ar jsonb not null default '[]'::jsonb,
  ordem int not null default 0,
  descricao_origem text not null default 'manual' check (descricao_origem in ('manual', 'importada', 'ia')),
  origem_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
create index produtos_loja_status_idx on public.produtos (loja_id, status, ordem);
create index produtos_categoria_idx on public.produtos (categoria_id);
create index produtos_atualizado_por_idx on public.produtos (atualizado_por);

create table public.produto_midias (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  produto_id bigint not null references public.produtos(id) on delete cascade,
  tipo text not null default 'foto' check (tipo in ('foto', 'video', 'link')),
  -- 'foto'/'video': caminho no Storage (bucket cardapio) OU caminho do site (assets/...) para as importadas
  caminho text not null,
  ordem int not null default 0,   -- 0 = capa
  legenda text,
  criado_em timestamptz not null default now()
);
create index midias_produto_idx on public.produto_midias (produto_id, ordem);
create index midias_loja_idx on public.produto_midias (loja_id);

create table public.grupos_opcoes (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  nome text not null,           -- ex.: "Escolha o tamanho", "Adicionais"
  tipo text not null default 'simples' check (tipo in ('simples', 'pizza')),
  origem_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index grupos_loja_idx on public.grupos_opcoes (loja_id);

create table public.opcoes (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  grupo_id bigint not null references public.grupos_opcoes(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null default 0 check (preco >= 0),
  disponivel boolean not null default true,
  max_por_item int,
  foto text,
  ordem int not null default 0,
  origem_id text
);
create index opcoes_grupo_idx on public.opcoes (grupo_id, ordem);
create index opcoes_loja_idx on public.opcoes (loja_id);

-- Etapas de escolha: liga um produto (ou uma opção, para escolhas aninhadas) a um grupo.
-- Mínimo, máximo e regra de preço ficam na ligação, como no sistema original.
create table public.etapas (
  id bigint generated always as identity primary key,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  produto_id bigint references public.produtos(id) on delete cascade,
  opcao_id bigint references public.opcoes(id) on delete cascade,
  grupo_id bigint not null references public.grupos_opcoes(id) on delete cascade,
  ordem int not null default 0,
  minimo int not null default 0 check (minimo >= 0),
  maximo int not null default 1 check (maximo >= 1),
  regra_preco smallint not null default 0 check (regra_preco in (0, 1, 2)), -- 0 soma, 1 maior, 2 média
  check ((produto_id is null) <> (opcao_id is null)),
  check (maximo >= minimo)
);
create index etapas_produto_idx on public.etapas (produto_id, ordem);
create index etapas_opcao_idx on public.etapas (opcao_id, ordem);
create index etapas_grupo_idx on public.etapas (grupo_id);
create index etapas_loja_idx on public.etapas (loja_id);

create table public.administradores (
  user_id uuid not null references auth.users(id) on delete cascade,
  loja_id bigint not null references public.lojas(id) on delete cascade,
  papel text not null default 'dono' check (papel in ('dono', 'funcionario')),
  criado_em timestamptz not null default now(),
  primary key (user_id, loja_id)
);
create index administradores_loja_idx on public.administradores (loja_id);

-- ---------- Funções auxiliares (schema privado, não exposto) ----------
create or replace function private.lojas_do_admin()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select a.loja_id from public.administradores a where a.user_id = (select auth.uid());
$$;
revoke execute on function private.lojas_do_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.lojas_do_admin() to authenticated;

create or replace function private.marcar_atualizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  if tg_table_name = 'produtos' then
    new.atualizado_por := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function private.marcar_atualizacao() from public, anon, authenticated;

create trigger lojas_atualizacao before update on public.lojas for each row execute function private.marcar_atualizacao();
create trigger categorias_atualizacao before update on public.categorias for each row execute function private.marcar_atualizacao();
create trigger produtos_atualizacao before update on public.produtos for each row execute function private.marcar_atualizacao();
create trigger grupos_atualizacao before update on public.grupos_opcoes for each row execute function private.marcar_atualizacao();

-- ---------- Permissões (Data API) + RLS ----------
do $$
declare t text;
begin
  foreach t in array array['horarios','bairros_entrega','categorias','produtos','produto_midias','grupos_opcoes','opcoes','etapas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    -- administradores da loja: veem e alteram tudo da própria loja
    execute format($p$create policy "admin le tudo da loja" on public.%I for select to authenticated
                     using (loja_id in (select private.lojas_do_admin()))$p$, t);
    execute format($p$create policy "admin cria na loja" on public.%I for insert to authenticated
                     with check (loja_id in (select private.lojas_do_admin()))$p$, t);
    execute format($p$create policy "admin altera na loja" on public.%I for update to authenticated
                     using (loja_id in (select private.lojas_do_admin()))
                     with check (loja_id in (select private.lojas_do_admin()))$p$, t);
    execute format($p$create policy "admin apaga na loja" on public.%I for delete to authenticated
                     using (loja_id in (select private.lojas_do_admin()))$p$, t);
  end loop;
end $$;

-- lojas usa "id" (não loja_id): admin só altera a própria loja; criar/apagar loja não é feito pelo site
alter table public.lojas enable row level security;
grant select on public.lojas to anon, authenticated;
grant update on public.lojas to authenticated;
create policy "admin altera a propria loja" on public.lojas for update to authenticated
  using (id in (select private.lojas_do_admin()))
  with check (id in (select private.lojas_do_admin()));

-- Leitura pública (o que o catálogo mostra)
create policy "publico le lojas" on public.lojas for select to anon, authenticated using (true);
create policy "publico le horarios" on public.horarios for select to anon, authenticated using (true);
create policy "publico le bairros ativos" on public.bairros_entrega for select to anon, authenticated using (ativo);
create policy "publico le categorias ativas" on public.categorias for select to anon, authenticated using (ativa);
create policy "publico le produtos ativos" on public.produtos for select to anon, authenticated using (status = 'ativo');
create policy "publico le midias de produtos ativos" on public.produto_midias for select to anon, authenticated
  using (exists (select 1 from public.produtos p where p.id = produto_id and p.status = 'ativo'));
create policy "publico le grupos" on public.grupos_opcoes for select to anon, authenticated using (true);
create policy "publico le opcoes" on public.opcoes for select to anon, authenticated using (true);
create policy "publico le etapas" on public.etapas for select to anon, authenticated using (true);

-- Administradores: cada um vê só o próprio vínculo; ninguém altera pelo site
alter table public.administradores enable row level security;
grant select on public.administradores to authenticated;
create policy "admin ve o proprio vinculo" on public.administradores for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Cardápio público numa chamada só ----------
-- SECURITY INVOKER: respeita as políticas acima (visitante só recebe o que é público).
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
    'etapas', coalesce((select jsonb_agg(to_jsonb(e) order by e.ordem) from public.etapas e where e.loja_id = (select id from l)), '[]')
  );
$$;
revoke execute on function public.cardapio_publico(text) from public;
grant execute on function public.cardapio_publico(text) to anon, authenticated;

-- ---------- Armazenamento de fotos e vídeos ----------
-- Bucket público para leitura (sem listagem); só administradores enviam/alteram/apagam
-- Caminho: {loja_id}/produtos/{produto_id}/{arquivo}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cardapio', 'cardapio', true, 20971520,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create policy "admin envia midia da loja" on storage.objects for insert to authenticated
  with check (bucket_id = 'cardapio' and (storage.foldername(name))[1] in (select l::text from private.lojas_do_admin() l));
create policy "admin ve midia da loja" on storage.objects for select to authenticated
  using (bucket_id = 'cardapio' and (storage.foldername(name))[1] in (select l::text from private.lojas_do_admin() l));
create policy "admin substitui midia da loja" on storage.objects for update to authenticated
  using (bucket_id = 'cardapio' and (storage.foldername(name))[1] in (select l::text from private.lojas_do_admin() l))
  with check (bucket_id = 'cardapio' and (storage.foldername(name))[1] in (select l::text from private.lojas_do_admin() l));
create policy "admin apaga midia da loja" on storage.objects for delete to authenticated
  using (bucket_id = 'cardapio' and (storage.foldername(name))[1] in (select l::text from private.lojas_do_admin() l));
