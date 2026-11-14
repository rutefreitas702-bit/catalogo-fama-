-- Importação inicial concluída: remove a função e o token (não ficam portas abertas).
drop function public.importar_cardapio(uuid, jsonb);
drop table private.token_importacao;
