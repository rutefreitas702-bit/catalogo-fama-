-- Login separado para a equipe da cozinha (aplicada no Supabase em 21/11/2026).
-- papel 'cozinha': só vê os pedidos da própria loja e muda o andamento (status e tempo).
alter table public.administradores drop constraint if exists administradores_papel_check;
alter table public.administradores add constraint administradores_papel_check
  check (papel = any (array['dono'::text, 'funcionario'::text, 'cozinha'::text]));
create or replace function private.lojas_do_admin() returns setof bigint language sql stable security definer set search_path = ''
as $$ select a.loja_id from public.administradores a where a.user_id = (select auth.uid()) and a.papel <> 'cozinha'; $$;
create or replace function private.lojas_da_equipe() returns setof bigint language sql stable security definer set search_path = ''
as $$ select a.loja_id from public.administradores a where a.user_id = (select auth.uid()); $$;
revoke execute on function private.lojas_da_equipe() from public, anon;
grant execute on function private.lojas_da_equipe() to authenticated;
drop policy if exists "admin le pedidos" on public.pedidos;
drop policy if exists "admin altera pedidos" on public.pedidos;
drop policy if exists "admin le itens" on public.pedido_itens;
create policy "equipe le pedidos" on public.pedidos for select to authenticated using (loja_id in (select private.lojas_da_equipe()));
create policy "equipe altera pedidos" on public.pedidos for update to authenticated
  using (loja_id in (select private.lojas_da_equipe())) with check (loja_id in (select private.lojas_da_equipe()));
create policy "equipe le itens" on public.pedido_itens for select to authenticated using (loja_id in (select private.lojas_da_equipe()));
