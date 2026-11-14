-- Defesa em dobro: além das políticas RLS, visitante (anon) não tem permissão de escrita em nenhuma tabela,
-- e não enxerga a tabela de administradores. Novas tabelas também não nascem liberadas.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke all on public.administradores from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, delete on public.lojas from authenticated;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate on tables from anon;
