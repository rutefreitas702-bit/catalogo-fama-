-- Linha de segmentos exibida na abertura do site (ex.: "Pizzaria · Lancheria · ...")
alter table public.lojas add column segmentos text[] not null default '{}';
update public.lojas set segmentos = array['Pizzaria','Lancheria','Restaurante','Hamburgueria','Açaiteria'] where slug = 'fama';
