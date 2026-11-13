"""Converte o JSON original da Anota AI (menu-merchant) em data/menu.js para o novo catálogo.

Regra: nenhum nome, descrição ou preço é alterado. Apenas reorganiza a estrutura.
Uso: python3 -I normalize.py <cap_dir> <out_dir>
"""
import hashlib
import json
import sys
from pathlib import Path

cap = Path(sys.argv[1])
out = Path(sys.argv[2])
raw = json.loads(json.loads((cap / "r001.json").read_text())["body"])["data"]
most = json.loads(json.loads((cap / "r004.json").read_text())["body"])

est = raw["establishment"]
menu = raw["menu"]
unit = est["units"][0]

# O sistema original remove da resposta as categorias que estão fora do horário (ex.: PROMOÇÃO PIZZAS só à noite).
# Por isso juntamos com a captura feita à noite: só entram categorias/grupos que faltam na captura atual.
night = cap / "r001-noite.json"
if night.exists():
    nm = json.loads(json.loads(night.read_text())["body"])["data"]["menu"]
    have = {c["_id"] for c in menu["menu"]}
    have_aux = {a["category_id"] for a in menu["menu_aux"]}
    for c in nm["menu"]:
        if c["_id"] not in have and c.get("non_active_weekdays"):
            menu["menu"].append(c)
    for a in nm["menu_aux"]:
        if a["category_id"] not in have_aux:
            menu["menu_aux"].append(a)
(cap / "cardapio-mesclado.json").write_text(json.dumps({"menu": menu}, ensure_ascii=False))

issues = []
images = {}


def img_key(url):
    if not url:
        return None
    k = hashlib.md5(url.encode()).hexdigest()[:12]
    images[k] = url
    return k


aux = {a["category_id"]: a for a in menu["menu_aux"]}


def schedule(nonact):
    return [{"d": x["short_name"], "s": x["start"], "e": x["end"]} for x in nonact or []]


def conv_item(i, ctx):
    steps = []
    for s in i.get("next_steps", []):
        if s["category"] not in aux:
            issues.append({
                "tipo": "etapa_inexistente",
                "onde": ctx + " > " + i["title"],
                "detalhe": "O item aponta para um grupo de opções que não existe mais no cardápio original (id %s, mín %s, máx %s). Etapa ignorada." % (s["category"], s["min"], s["max"]),
            })
            continue
        steps.append({"g": s["category"], "min": s["min"], "max": s["max"], "pm": s["price_model"]})
    o = {
        "id": i["_id"],
        "iid": i["item_id"],
        "t": i["title"],
        "d": i.get("description") or "",
        "p": i["price"],
        "out": bool(i.get("out")),
        "img": img_key(i.get("image")),
        "max": i.get("max", -1),
        "steps": steps,
    }
    if i.get("price_base") not in (None, i["price"]):
        o["pb"] = i["price_base"]
    if i.get("discount"):
        o["disc"] = i["discount"]
        o["discPct"] = i.get("is_discount_percentage", False)
    if i.get("minimal_price"):
        o["minp"] = i["minimal_price"]
    if i.get("minimal_price_per_day"):
        o["minDay"] = {x["short_name"]: x["minimal_price"] for x in i["minimal_price_per_day"]}
    if i.get("non_active_weekdays"):
        o["off"] = schedule(i["non_active_weekdays"])
    if i.get("image") and not o["img"]:
        o["genericImg"] = i["image"]
    return o


groups = {}
for a in menu["menu_aux"]:
    groups[a["category_id"]] = {
        "id": a["category_id"],
        "t": a["title"],
        "type": a["category_type"],
        "opts": [conv_item(i, "Grupo '%s'" % a["title"]) for i in a["itens"]],
    }

cats = []
for c in sorted(menu["menu"], key=lambda c: c["order"]):
    cats.append({
        "id": c["_id"],
        "t": c["title"],
        "type": c["category_type"],
        "order": c["order"],
        "promo": bool(c.get("show_promotion_label")),
        "off": schedule(c.get("non_active_weekdays")),
        "items": [conv_item(i, "Categoria '%s'" % c["title"].strip()) for i in c["itens"]],
    })
    if not c["itens"]:
        issues.append({"tipo": "categoria_vazia", "onde": c["title"], "detalhe": "Categoria sem produtos cadastrados no catálogo original."})

# Itens sem foto própria no original (ou com o desenho genérico de pizza da plataforma):
# usa uma foto REAL da própria loja que já está no original, nesta ordem de preferência:
#   1) a foto mais usada entre as opções obrigatórias do próprio item (ex.: sabores da pizza);
#   2) a foto de um item da mesma categoria cujo nome é o início deste (mesmo prato, ex.: "Supremo De Frango" → "Supremo De Frango Individual").
# A origem fica registrada em "imgFrom" para a conferência.
GENERIC = {k for k, u in images.items() if "anotaai.s3" in u}
for c in cats:
    for it in c["items"]:
        if it["img"] and it["img"] not in GENERIC:
            continue
        cand = {}
        for s in it["steps"]:
            if s["min"] < 1:
                continue
            for o in groups[s["g"]]["opts"]:
                if o["img"] and not o["out"]:
                    cand[o["img"]] = cand.get(o["img"], 0) + 1
        if cand:
            it["img"] = max(cand, key=cand.get)
            it["imgFrom"] = "opcao"
            continue
        fam = [x for x in c["items"] if x is not it and x["img"] and x["img"] not in GENERIC and it["t"].strip().lower().startswith(x["t"].strip().lower())]
        if fam:
            it["img"] = fam[0]["img"]
            it["imgFrom"] = "mesmo_prato:" + fam[0]["t"].strip()

# Destaques = "mais pedidos" na mesma ordem do original
by_iid = {}
for c in menu["menu"]:
    for i in c["itens"]:
        # a lista "mais pedidos" usa o category_item_id do produto
        by_iid.setdefault(i["category_item_id"], (c["_id"], i["_id"]))
        by_iid.setdefault(i["item_id"], (c["_id"], i["_id"]))
highlights = []
for m in most.get("mostOrdered", {}).get("items", []):
    if m["item_id"] in by_iid and len(highlights) < 6:
        highlights.append(by_iid[m["item_id"]])

addr = unit["address"]
store = {
    "name": "Fama Burguer e Pizzaria",
    "systemName": est["page"]["name"],
    "slug": est["page_name_id"],
    "orderUrl": "https://pedido.anota.ai/loja/" + est["page_name_id"],
    "whatsapp": est["whatsapp"],
    "phones": [p["number"] for p in unit["phones"]],
    "address": addr["addressFormated"],
    "addressParts": {k: addr[k] for k in ("name", "num", "neighborhood", "city", "state", "postal_code")},
    "geo": addr["location"]["coordinates"],
    "tz": unit["timezone"],
    "week": {w["short_name"]: [{"s": s["start"], "e": s["end"]} for s in w["schedules"]] for w in unit["week"]},
    "minOrder": est["minimum_order_amount"],
    "deliveryTime": [unit["time_delivery_min"], unit["time_delivery_max"]],
    "takeTime": [unit["time_take_min"], unit["time_take_max"]],
    "accept": {"delivery": unit["acceptDelivery"], "take": unit["acceptTake"], "local": unit["acceptLocal"]},
    "pay": {
        "money": unit["payment_method"]["money"],
        "card": unit["payment_method"]["creditcard"],
        "pix": unit["payment_method"]["pix"],
        "online": unit["payment_method"].get("ifood_payin", False),
        "cards": [c["name"] for c in unit.get("credit_cards", [])],
    },
    "regions": [{"n": r["name"], "p": r["price"]} for r in unit["regions"] if r.get("active")],
    "segments": [s["name"] for s in est.get("page_segments", [])],
    "menuVersion": menu.get("version_menu"),
    "menuUpdatedAt": menu.get("updated_at"),
}

data = {"store": store, "categories": cats, "groups": groups, "highlights": highlights, "issues": issues,
        "extractedAt": json.loads((cap / "r001.json").read_text()).get("fetchedAt") or "2026-11-11"}

out.mkdir(parents=True, exist_ok=True)
(out / "menu.js").write_text("/* Gerado automaticamente a partir do cardápio original (Anota AI). Não editar preços aqui sem conferir o original. */\nwindow.FAMA_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
(out / "images.json").write_text(json.dumps(images, indent=0))

n_items = sum(len(c["items"]) for c in cats)
n_opts = sum(len(g["opts"]) for g in groups.values())
print("categorias", len(cats), "itens", n_items, "grupos", len(groups), "opcoes", n_opts, "imagens", len(images), "issues", len(issues))
for i in issues:
    print(" -", i)
