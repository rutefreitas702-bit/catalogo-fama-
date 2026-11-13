# Fama Burguer e Pizzaria — catálogo digital

Nova apresentação do cardápio oficial da loja (Anota AI: `pedido.anota.ai/loja/fama-lanches-e-pizzaria`).
O conteúdo comercial (categorias, produtos, descrições, preços, opções, adicionais, horários, taxas de entrega,
formas de pagamento e contatos) vem **exclusivamente** do cardápio original. Nada foi inventado ou alterado.

## O que tem

- **Abertura cinematográfica**: o hambúrguer do vídeo enviado é montado conforme o cliente rola a página
  (151 quadros controlados pela rolagem), com câmera em 3D que reage ao mouse/inclinação do celular,
  nomes dos ingredientes sincronizados, brilho de luz e partículas 3D (gergelim, faíscas, gotas de molho) em WebGL.
- **Calda de ketchup** escorrendo na transição para o cardápio e ingredientes 3D (cebola, tomate, queijo,
  alface, bacon) flutuando nas margens durante a navegação, reagindo à velocidade da rolagem.
- **Catálogo completo**: 19 categorias, 112 produtos e 479 opções/adicionais, com fotos originais aprimoradas.
  Produtos que abrem escolhas (ex.: "Sanduíches Carne De Hambúguer") mostram cada sanduíche como um card próprio,
  com foto, ingredientes e preço. Pizzas têm tabela de sabores por tamanho.
- **Detalhe do produto** com todas as etapas do original (mínimo/máximo, obrigatórios, quantidades, opções
  aninhadas), cálculo do preço em tempo real e observação.
- **Carrinho** com entrega/retirada/consumo no local, bairro com a taxa original, pagamento, troco e
  envio do pedido completo pelo **WhatsApp oficial da loja**. Link para o cardápio oficial (pagamento online).
- **Busca** por produtos e opções (sem acento, ex.: "acai", "coca", "heineken").
- **Horários**: status aberto/fechado no fuso da loja; categorias com horário especial (ex.: PROMOÇÃO PIZZAS)
  mostram quando estão disponíveis e bloqueiam pedido fora do horário.
- **Modo leve** automático para aparelhos simples, economia de dados ou "reduzir movimento"
  (sem WebGL; o vídeo da montagem toca sob demanda). Pode ser trocado no rodapé.

## Como publicar

É um site estático. Envie a pasta inteira para qualquer hospedagem (Netlify, Vercel, GitHub Pages, Hostinger…).
Para testar no computador, rode um servidor local na pasta (abrir o `index.html` direto do disco desativa a camada 3D):

```bash
python3 -m http.server 8765
```

Depois abra `http://localhost:8765`.

## Estrutura

```
index.html                 página
assets/css/fama.css        visual
assets/js/app.js           catálogo, detalhe, carrinho, busca, abertura
assets/js/hero3d.js        camada 3D (three.js)
assets/vendor/             three.js, GSAP + ScrollTrigger, Lenis (cópias locais)
assets/hero/               quadros da abertura + vídeo para o modo leve
assets/img/p/              fotos dos produtos aprimoradas (Real-ESRGAN 4x)
data/menu.js               cardápio convertido do original
fonte-original/            resposta original da API do cardápio (fonte de verdade)
ferramentas/               conferência automática
CONFERENCIA.md             relatório produto a produto
```

## Atualizar o cardápio

1. Salve a nova resposta do cardápio em `fonte-original/r001.json` (mesmo formato).
2. Gere `data/menu.js` com o script de conversão (`ferramentas/normalize.py`).
3. Rode a conferência: `node ferramentas/conferencia.js http://localhost:8765/index.html`
   e confira o `CONFERENCIA.md` (precisa dar 0 divergências).

## Regra de preço da pizza com 2 sabores

O sistema original usa uma regra própria para pizzas meio a meio. O catálogo está configurado para cobrar
pelo **sabor de maior valor**. Se a loja usa a média, troque `priceModel1: 'maior'` por `'media'`
no início de `assets/js/app.js`.
