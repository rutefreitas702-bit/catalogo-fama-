"""Converte data/menu.js (cardápio atual do site) no formato das tabelas do Supabase.

Uso: python3 -I ferramentas/preparar_importacao.py data/menu.js saida.json
Nada é inventado: cada campo vem do cardápio já conferido com o original.
"""
import json
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
txt = open(src, encoding="utf-8").read()
D = json.loads(re.search(r"window\.FAMA_DATA\s*=\s*(\{.*\});?\s*$", txt, re.S).group(1))
S = D["store"]
DIAS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


def foto(k):
    return f"assets/img/p/{k}.webp" if k else None


loja = {
    "slug": "fama",
    "nome": S["name"],
    "whatsapp": S["whatsapp"],
    "telefones": S["phones"],
    "endereco": S["address"],
    "cidade": S["addressParts"]["city"],
    "uf": S["addressParts"]["state"],
    "fuso": S["tz"],
    "pedido_minimo": S["minOrder"],
    "entrega_min": S["deliveryTime"][0], "entrega_max": S["deliveryTime"][1],
    "retirada_min": S["takeTime"][0], "retirada_max": S["takeTime"][1],
    "aceita_entrega": S["accept"]["delivery"], "aceita_retirada": S["accept"]["take"], "aceita_local": S["accept"]["local"],
    "pagamentos": {k: S["pay"][k] for k in ("money", "card", "pix", "online")},
    "bandeiras": S["pay"]["cards"],
    "link_pedido_online": S["orderUrl"],
}
horarios = [{"dia": DIAS.index(d), "abre": w["s"], "fecha": w["e"]} for d, ws in S["week"].items() for w in ws]
bairros = [{"nome": r["n"], "taxa": r["p"], "ordem": i} for i, r in enumerate(S["regions"])]

categorias, produtos, midias, etapas = [], [], [], []
destaque = {h[1]: i for i, h in enumerate(D["highlights"])}
for ci, c in enumerate(D["categories"]):
    categorias.append({"origem": c["id"], "nome": c["t"].strip(), "tipo": "pizza" if c["type"] == "pizza" else "simples",
                       "ordem": ci, "promo": bool(c.get("promo")), "fora": c.get("off") or []})
    for pi, it in enumerate(c["items"]):
        produtos.append({
            "origem": it["id"], "categoria": c["id"], "nome": it["t"].strip(), "descricao": it.get("d") or None,
            "preco": it["p"], "disponivel": not it["out"], "max": it["max"] if it.get("max", -1) > 0 else None,
            "ordem": pi, "minp": it.get("minp"), "minday": it.get("minDay"), "fora": it.get("off") or [],
            "destaque": it["id"] in destaque, "destaque_ordem": destaque.get(it["id"]),
        })
        if it.get("img"):
            midias.append({"produto": it["id"], "caminho": foto(it["img"]), "ordem": 0})
        for si, s in enumerate(it["steps"]):
            etapas.append({"produto": it["id"], "opcao": None, "grupo": s["g"], "ordem": si, "min": s["min"], "max": s["max"], "pm": s["pm"]})

grupos, opcoes = [], []
for gid, g in D["groups"].items():
    grupos.append({"origem": gid, "nome": g["t"].strip(), "tipo": "pizza" if g["type"] == "pizza" else "simples"})
    for oi, o in enumerate(g["opts"]):
        opcoes.append({"origem": o["id"], "grupo": gid, "nome": o["t"].strip(), "descricao": o.get("d") or None, "preco": o["p"],
                       "disponivel": not o["out"], "max": o["max"] if o.get("max", -1) > 0 else None, "foto": foto(o.get("img")), "ordem": oi})
        for si, s in enumerate(o.get("steps") or []):
            etapas.append({"produto": None, "opcao": o["id"], "grupo": s["g"], "ordem": si, "min": s["min"], "max": s["max"], "pm": s["pm"]})

# as origens precisam ser únicas para a importação ligar tudo certo
for nome, lst in (("categorias", categorias), ("produtos", produtos), ("grupos", grupos), ("opcoes", opcoes)):
    ids = [x["origem"] for x in lst]
    assert len(ids) == len(set(ids)), f"origem repetida em {nome}"

out = {"loja": loja, "horarios": horarios, "bairros": bairros, "categorias": categorias, "produtos": produtos,
       "midias": midias, "grupos": grupos, "opcoes": opcoes, "etapas": etapas}
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
print({k: (len(v) if isinstance(v, list) else 1) for k, v in out.items()})
