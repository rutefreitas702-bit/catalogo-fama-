-- Uma política de leitura por papel (evita avaliar duas políticas permissivas por consulta).
-- anon: só o que é público. authenticated: o público + tudo da(s) própria(s) loja(s).

-- Tabelas em que tudo é público para leitura
drop policy "admin le tudo da loja" on public.horarios;
drop policy "publico le horarios" on public.horarios;
create policy "leitura horarios" on public.horarios for select to anon, authenticated using (true);

drop policy "admin le tudo da loja" on public.grupos_opcoes;
drop policy "publico le grupos" on public.grupos_opcoes;
create policy "leitura grupos" on public.grupos_opcoes for select to anon, authenticated using (true);

drop policy "admin le tudo da loja" on public.opcoes;
drop policy "publico le opcoes" on public.opcoes;
create policy "leitura opcoes" on public.opcoes for select to anon, authenticated using (true);

drop policy "admin le tudo da loja" on public.etapas;
drop policy "publico le etapas" on public.etapas;
create policy "leitura etapas" on public.etapas for select to anon, authenticated using (true);

-- Tabelas com itens ocultos (arquivados/inativos): visitante vê só os públicos, admin vê todos da loja
drop policy "admin le tudo da loja" on public.bairros_entrega;
drop policy "publico le bairros ativos" on public.bairros_entrega;
create policy "visitante le bairros ativos" on public.bairros_entrega for select to anon using (ativo);
create policy "logado le bairros" on public.bairros_entrega for select to authenticated
  using (ativo or loja_id in (select private.lojas_do_admin()));

drop policy "admin le tudo da loja" on public.categorias;
drop policy "publico le categorias ativas" on public.categorias;
create policy "visitante le categorias ativas" on public.categorias for select to anon using (ativa);
create policy "logado le categorias" on public.categorias for select to authenticated
  using (ativa or loja_id in (select private.lojas_do_admin()));

drop policy "admin le tudo da loja" on public.produtos;
drop policy "publico le produtos ativos" on public.produtos;
create policy "visitante le produtos ativos" on public.produtos for select to anon using (status = 'ativo');
create policy "logado le produtos" on public.produtos for select to authenticated
  using (status = 'ativo' or loja_id in (select private.lojas_do_admin()));

drop policy "admin le tudo da loja" on public.produto_midias;
drop policy "publico le midias de produtos ativos" on public.produto_midias;
create policy "visitante le midias de produtos ativos" on public.produto_midias for select to anon
  using (exists (select 1 from public.produtos p where p.id = produto_id and p.status = 'ativo'));
create policy "logado le midias" on public.produto_midias for select to authenticated
  using (loja_id in (select private.lojas_do_admin())
         or exists (select 1 from public.produtos p where p.id = produto_id and p.status = 'ativo'));
