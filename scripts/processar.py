"""Transforma data/raw em docs/data: vias (alternativas) com os critérios do artigo + camadas do mapa.

Critérios (TCC UNINORTE 2023, versão corrigida — ver METODOLOGIA_PRIORIZACAO_RESUMO.md, seção 5):
  C1 Desenvolvimento Local = Uso do Solo (0–5) + Nível de Ocupação (1–5)
  C2 Vulnerabilidade de Transporte = nº de deficiências (0–5)
  C3 Dificuldade de Projeto e Execução = Relevo + Terreno + UC + Sítio + TI + OAE (0–10, critério de custo)
Uso: python scripts/processar.py
"""
import io, json, math, pathlib, time, zipfile, csv
from collections import defaultdict
import requests, shapefile
from shapely.geometry import shape, LineString, MultiLineString, Point, mapping
from shapely.ops import transform, unary_union, linemerge
from shapely.strtree import STRtree
from shapely.prepared import prep
from shapely.ops import nearest_points

RAIZ = pathlib.Path(__file__).resolve().parent.parent
RAW, OUT = RAIZ / "data" / "raw", RAIZ / "docs" / "data"
OUT.mkdir(parents=True, exist_ok=True)
H = {"User-Agent": "priorizacao-obras-am/1.0 (pesquisa academica)"}

# projeção métrica simples (equiretangular em lat -4°): erro < 2 % no AM, suficiente para buffers de km
KX, KY = 111320 * math.cos(math.radians(-4)), 110574
proj = lambda g: transform(lambda x, y, z=None: (x * KX, y * KY), g)
desproj = lambda g: transform(lambda x, y, z=None: (x / KX, y / KY), g)


def ler(nome):
    return json.loads((RAW / nome).read_text(encoding="utf-8"))


def salvar(nome, obj):
    (OUT / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def arred(g, nd=5):
    return json.loads(json.dumps(mapping(g)), parse_float=lambda v: round(float(v), nd))


def ponto_osm(e):
    if e["type"] == "node":
        return Point(e["lon"], e["lat"])
    b = e.get("bounds")
    if b:
        return Point((b["minlon"] + b["maxlon"]) / 2, (b["minlat"] + b["maxlat"]) / 2)
    if e.get("geometry"):
        g = [p for p in e["geometry"] if p]
        return Point(sum(p["lon"] for p in g) / len(g), sum(p["lat"] for p in g) / len(g))
    return None


def linha_osm(e):
    g = [(p["lon"], p["lat"]) for p in e.get("geometry", []) if p]
    return LineString(g) if len(g) >= 2 else None


class Pontos:
    """Índice espacial de pontos com atributos, em metros."""
    def __init__(self, itens):  # itens: [(Point lonlat, dict)]
        self.itens = itens
        self.geoms = [proj(p) for p, _ in itens]
        self.arvore = STRtree(self.geoms) if self.geoms else None

    def perto(self, geom_m, dist):
        if not self.arvore:
            return []
        idx = self.arvore.query(geom_m.buffer(dist))
        return [(self.itens[i][1], geom_m.distance(self.geoms[i])) for i in idx if geom_m.distance(self.geoms[i]) <= dist]


# ---------------- IBGE ----------------
print("IBGE…")
nomes_mun = {str(m["id"]): m["nome"] for m in ler("ibge_municipios.json")}
pop_mun = {r["D1C"]: int(r["V"]) for r in ler("ibge_pop2022.json")[1:] if r["V"].isdigit()}
malha = ler("ibge_malha.geojson")["features"]
muns = [(shape(f["geometry"]), f["properties"]["codarea"]) for f in malha]
arv_mun = STRtree([g for g, _ in muns])
estado = unary_union([g for g, _ in muns])


def municipio(pt):
    for i in arv_mun.query(pt):
        if muns[i][0].contains(pt):
            return muns[i][1]
    return min(muns, key=lambda m: m[0].distance(pt))[1]


pop_setor = ler("ibge_setores_pop_AM.json")
z = zipfile.ZipFile(RAW / "AM_setores_CD2022.zip")
sf = shapefile.Reader(shp=io.BytesIO(z.read("AM_setores_CD2022.shp")), dbf=io.BytesIO(z.read("AM_setores_CD2022.dbf")), encoding="latin1")
setores = []
for sr in sf.iterShapeRecords():
    p = pop_setor.get(sr.record["CD_SETOR"])
    if p and p[0] > 0:
        g = proj(shape(sr.shape.__geo_interface__)).buffer(0)
        if g.area > 0:
            setores.append((g, p[0], p[1], sr.record["CD_SETOR"], sr.record["SITUACAO"]))
arv_set = STRtree([s_[0] for s_ in setores])
cnefe = ler("ibge_cnefe_AM.json")
CEL, dom_cel = cnefe["celula_graus"], cnefe["dom"]
tot_dom = {k: sum(v.values()) for k, v in dom_cel.items()}
print("  setores com população:", len(setores))


def populacao(geom_m, raio=2000):
    """Pessoas e domicílios do Censo 2022 no raio. Cada setor entra com a fração dos seus domicílios (CNEFE)
    que cai dentro do raio; sem endereços no CNEFE, usa a fração da área do setor."""
    buf = geom_m.buffer(raio)
    dentro_buf = prep(desproj(buf))
    pes = dom = 0.0
    detalhe = []
    for i in arv_set.query(buf):
        g, p, d, cd, sit = setores[i]
        cels = dom_cel.get(cd)
        if cels and tot_dom.get(cd):
            n_dentro = sum(n for k, n in cels.items()
                           if dentro_buf.contains(Point((int(k.split(",")[0]) + .5) * CEL, (int(k.split(",")[1]) + .5) * CEL)))
            f, metodo = n_dentro / tot_dom[cd], "domicílios CNEFE"
        else:
            n_dentro, f, metodo = None, g.intersection(buf).area / g.area, "área do setor"
        if f <= 0:
            continue
        pes, dom = pes + p * f, dom + d * f
        detalhe.append({"setor": cd, "situacao": sit, "pessoas": int(p), "domicilios": int(d), "dom_cnefe_raio": n_dentro,
                        "dom_cnefe_setor": tot_dom.get(cd), "fracao": round(f, 4), "pessoas_raio": round(p * f), "metodo": metodo})
    detalhe.sort(key=lambda x: -x["pessoas_raio"])
    return round(pes), round(dom), detalhe


# ---------------- camadas ambientais / patrimônio ----------------
print("INPE / IPHAN…")
def poligonos(nome, rotulo):
    out = []
    for f in ler(nome)["features"]:
        g = shape(f["geometry"])
        if g.is_valid is False:
            g = g.buffer(0)
        if g.intersects(estado):
            out.append((g, rotulo(f["properties"]), f["properties"]))
    return out

ucs = poligonos("inpe_ucs.geojson", lambda p: f'{p.get("nome")} ({p.get("categoria")}, {p.get("esfera")})')
tis = poligonos("inpe_tis.geojson", lambda p: f'TI {p.get("terrai_nom")} — {p.get("etnia_nome")} ({p.get("fase_ti")})')
arv_uc, arv_ti = STRtree([g for g, _, _ in ucs]), STRtree([g for g, _, _ in tis])
sitios = [(shape(f["geometry"]), f["properties"]) for f in ler("iphan_sitios.geojson")["features"] if f.get("geometry")]
sitios = [(p, a) for p, a in sitios if estado.contains(p)]
idx_sitios = Pontos([(p, {"nome": a.get("identificacao_bem"), "codigo": a.get("co_iphan"), "classe": a.get("ds_classificacao")}) for p, a in sitios])


def toca(geom_ll, arv, lista):
    return [lista[i][1] for i in arv.query(geom_ll) if lista[i][0].intersects(geom_ll)]


# ---------------- OSM: pontos ----------------
print("OSM pontos…")
def pontos_osm(nome, classifica):
    out = []
    for e in ler(nome)["elements"]:
        t = e.get("tags", {})
        c = classifica(t)
        p = ponto_osm(e)
        if c and p and estado.contains(p):
            out.append((p, {"nome": t.get("name") or t.get("official_name") or "(sem nome)", "tipo": c, "osm": f'{e["type"]}/{e["id"]}'}))
    return out

aeroportos = pontos_osm("osm_aeroportos.json", lambda t: "Aeroporto" if t.get("aeroway") == "aerodrome" else "Pista de pouso")
def tipo_porto(t):
    if t.get("floating") == "yes" or t.get("man_made") == "floating_pier":
        return "Porto flutuante"
    if t.get("amenity") == "ferry_terminal":
        return "Terminal hidroviário"
    if t.get("landuse") == "port" or t.get("harbour"):
        return "Porto"
    return "Píer / atracadouro"
portos = pontos_osm("osm_portos.json", tipo_porto)
escolas = [(Point(lon, lat), {"nome": n.title(), "tipo": "Escola", "fonte": "IBGE CNEFE 2022", "local": loc.title()})
           for lat, lon, n, loc in cnefe["escolas"]]
cnes = [(Point(float(e["longitude_estabelecimento_decimo_grau"]), float(e["latitude_estabelecimento_decimo_grau"])),
         {"nome": (e["nome_fantasia"] or "(sem nome)").title(), "tipo": "Saúde", "fonte": f'CNES {e["codigo_cnes"]}'})
        for e in ler("cnes_AM.json") if e.get("latitude_estabelecimento_decimo_grau") and e.get("longitude_estabelecimento_decimo_grau")]
cnes = [(p, a) for p, a in cnes if estado.contains(p)]
saude_cnefe = [(Point(lon, lat), {"nome": n.title(), "tipo": "Saúde", "fonte": "IBGE CNEFE 2022", "local": loc.title()})
               for lat, lon, n, loc in cnefe["saude"]]
servicos = escolas + cnes + saude_cnefe
agro_cnefe = [(Point(lon, lat), {"nome": "Estabelecimento agropecuário", "tipo": "agricola", "fonte": "IBGE CNEFE 2022"})
              for lat, lon in cnefe["agro"]]
producao = [(Point(lon, lat), {"nome": nome.title() if nome and not nome.startswith(("SEM NOME", "SN", "SD", "NAO ", "S/N")) else "Estabelecimento agropecuário", "tipo": "agropecuário" if esp == "3" else "outras finalidades", "fonte": "IBGE CNEFE 2022"})
            for lat, lon, esp, nome in ler("ibge_cnefe_producao_AM.json")]
lugares = pontos_osm("osm_lugares.json", lambda t: t.get("place"))
def tipo_uso(t):
    if t.get("tourism"):
        return "turismo"
    if t.get("landuse") in ("industrial", "quarry") or t.get("man_made") == "works" or t.get("craft"):
        return "industrial"
    return "agricola"
usos = pontos_osm("osm_usosolo.json", tipo_uso)
assent = [x for x in lugares + usos if any(k in x[1]["nome"].lower() for k in ("assentamento", "p.a.", "pa ", "pds ", "paex"))]
I = {k: Pontos(v) for k, v in dict(aero=aeroportos, porto=portos, serv=servicos, lugar=lugares, assent=assent,
                                    agric=[u for u in usos if u[1]["tipo"] == "agricola"] + agro_cnefe,
                                    prod=producao, tur=[u for u in usos if u[1]["tipo"] == "turismo"],
                                    ind=[u for u in usos if u[1]["tipo"] == "industrial"]).items()}
print("  escolas", len(escolas), "saúde CNES", len(cnes), "saúde CNEFE", len(saude_cnefe), "agropecuários", len(agro_cnefe))
print("  aeroportos", len(aeroportos), "portos", len(portos), "serviços", len(servicos), "lugares", len(lugares), "assentamentos", len(assent))

# ---------------- água, várzea e pontes: IBGE BC250 + pontes do OSM ----------------
print("BC250…")
bc = ler("ibge_bc250.json")
def tipo_rio(p):  # "river" = curso d'água relevante (nomeado, navegável ou com largura), resto = igarapé
    return "river" if (p.get("nome") or p.get("navegavel") == "Sim" or str(p.get("larguramedia")) not in ("0", "None", "")) else "stream"
rios = []
for f in bc["drenagem"]:
    g = shape(f["geometry"])
    if not g.is_empty:
        rios.append((proj(g), tipo_rio(f["properties"]), f["properties"].get("nome") or None))
arv_rio = STRtree([g for g, _, _ in rios])
alagados = [(proj(shape(f["geometry"])), "inundacao") for f in bc["inundacao"]]
arv_alag = STRtree([g for g, _ in alagados]) if alagados else None
con = ler("osm_conexoes.json")["elements"]
pontes = [proj(l) for e in con if e.get("tags", {}).get("bridge") and (l := linha_osm(e))]
pontes += [proj(shape(f["geometry"])).buffer(30) for f in bc["ponte_l"] + bc["ponte_p"]]
arv_ponte = STRtree(pontes) if pontes else None
print("  trechos de drenagem", len(rios), "pontes", len(pontes))
outras = {f"osm-{e['id']}": proj(l) for e in con if (l := linha_osm(e))}
# ---------------- montar alternativas (vias) ----------------
print("vias…")
EXCLUI = {"path", "footway", "cycleway", "steps", "pedestrian", "bridleway", "construction", "proposed"}
PAVIMENTO = {"asphalt", "paved", "concrete", "paving_stones", "chipseal", "concrete:plates", "sett", "cobblestone"}
PAV_PADRAO = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"}
import re
grupos = defaultdict(dict)
for nome_arq, tipo in (("osm_rodovias.json", "Rodovia estadual"),):
    for e in ler(nome_arq)["elements"]:
        t = e["tags"]
        if t.get("highway") in EXCLUI or not (l := linha_osm(e)):
            continue
        refs = re.findall(r"AM[- ]?(\d+)", t.get("ref", ""))
        if refs:
            chave = ("Rodovia estadual", f"AM-{int(refs[0]):03d}")
        elif re.search(r"BR[- ]?\d", t.get("ref", "")):
            continue  # rodovia federal (ex.: BR-319 "Estrada Manaus–Porto Velho") fica fora do escopo estadual
        elif tipo.startswith("Ramal"):
            chave = (tipo, t["name"].strip())
        else:
            continue
        grupos[chave][f'osm-{e["id"]}'] = (l, t)

alternativas = []
for (tipo, nome), ways in grupos.items():
    ids = list(ways)
    pai = {i: i for i in ids}
    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    pm = {i: proj(ways[i][0]) for i in ids}
    arv = STRtree([pm[i] for i in ids])
    for a in ids:  # une trechos do mesmo nome que se tocam ou distam < 300 m
        for j in arv.query(pm[a].buffer(300)):
            b = ids[j]
            if b != a and pm[a].distance(pm[b]) < 300:
                pai[raiz(a)] = raiz(b)
    comp = defaultdict(list)
    for i in ids:
        comp[raiz(i)].append(i)
    for membros in comp.values():
        alternativas.append((tipo, nome, {i: ways[i] for i in membros}))

SHP_RAMAIS = RAIZ.parent / "3-RAMAIS" / "1-TRAÇADO RAMAIS" / "RAMAIS - TRAÇADO REV06 - 16-05-2025" / "VICINAIS-RAMAIS-ESTRADAS - SEINFRA 2025.shp"
sf_r = shapefile.Reader(str(SHP_RAMAIS), encoding="utf-8")
nomes_campos = [re.sub(r"[^A-Za-z/ ]", "", f[0]) for f in sf_r.fields[1:]]  # nomes vêm truncados no meio do acento
def campo(prefixo):
    return next(i for i, n in enumerate(nomes_campos) if n.startswith(prefixo))
C = {k: campo(v) for k, v in dict(cod="CDIGO", num="Nmero", desc="Descri", acesso="Rodovia/Es", ref="Ponto de r", mun="Munic",
                                   ext="Extens", rev="Revestimen", sit="Situa", custo="Custo Esti", ct="N CT", resumo="RESUMO").items()}
assert C["num"] == C["cod"] + 1, nomes_campos[:5]
MINUSC = {"de", "do", "da", "dos", "das", "e", "a", "o"}
def titulo(t):
    # siglas de rodovia (AM-352, BR-174) e abreviações com ponto (S.I) ficam em maiúsculas
    return " ".join(w if re.search(r"\d|\.", w) and w.isupper() else w.lower() if (k and w.lower() in MINUSC) else w.capitalize()
                    for k, w in enumerate(t.split()))
def numero(v):
    try:
        return float(str(v).replace(".", "").replace(",", ".")) if "," in str(v) else float(v)
    except (TypeError, ValueError):
        return None
for k, sr in enumerate(sf_r.iterShapeRecords()):
    partes = [[(x, y) for x, y, *_ in sr.shape.points[a:b]] for a, b in zip(sr.shape.parts, list(sr.shape.parts[1:]) + [len(sr.shape.points)])]
    linhas = [LineString(p) for p in partes if len(p) >= 2]
    if not linhas:
        continue
    r = sr.record
    rev = str(r[C["rev"]]).strip().upper()
    sit = str(r[C["sit"]]).strip().upper()
    contrato = str(r[C["ct"]] or "").strip()
    # premissa do estudo: ramal com obra na coluna Situação (concluída ou em andamento) está pavimentado; os demais, em leito natural e sem ponte
    obra = "CONCLU" in sit or "EM OBRA" in sit
    tags = {"surface": "paved" if obra else "unpaved", "highway": "unclassified"}
    ways = {f"seinfra-{k}-{j}": (l, tags) for j, l in enumerate(linhas)}
    for wid, (l, _) in ways.items():
        outras[wid] = proj(l)
    info = {"codigo": f'{r[C["cod"]]}-{r[C["num"]]}', "acesso": r[C["acesso"]], "referencia": r[C["ref"]],
            "municipio_seinfra": r[C["mun"]], "extensao_km": numero(r[C["ext"]]), "revestimento": rev.title(),
            "situacao": str(r[C["sit"]]).strip().title(), "custo_estimado": numero(r[C["custo"]]),
            "obra": obra, "contrato": contrato or None, "resumo_obra": " ".join(str(r[C["resumo"]] or "").split()) or None}
    alternativas.append(("Ramal / estrada vicinal", titulo(str(r[C["desc"]]).strip()), ways, info))
alternativas = [a if len(a) == 4 else (*a, None) for a in alternativas]
print("  alternativas:", len(alternativas), "(ramais SEINFRA:", sum(1 for a in alternativas if a[3]), ")")
arv_outras_ids = list(outras)
arv_outras = STRtree([outras[i] for i in arv_outras_ids])

# ---------------- elevação (OpenTopoData SRTM 90 m) ----------------
cache_path = RAW / "elevacao_cache.json"
elev = json.loads(cache_path.read_text()) if cache_path.exists() else {}
def amostras(geom_ll, n):
    linhas = list(geom_ll.geoms) if geom_ll.geom_type == "MultiLineString" else [geom_ll]
    total = sum(l.length for l in linhas)
    pts = []
    for l in linhas:
        k = max(1, round(n * l.length / total)) if total else 1
        pts += [l.interpolate(t / max(k - 1, 1), normalized=True) for t in range(k)]
    return [(round(p.y, 4), round(p.x, 4)) for p in pts]

def busca_elevacao(pontos):
    falta = [p for p in dict.fromkeys(pontos) if f"{p[0]},{p[1]}" not in elev]
    for i in range(0, len(falta), 100):
        lote = falta[i:i + 100]
        for tentativa in range(5):
            try:
                r = requests.get("https://api.opentopodata.org/v1/srtm90m",
                                 params={"locations": "|".join(f"{a},{b}" for a, b in lote)}, headers=H, timeout=60)
                if r.status_code == 429:
                    time.sleep(5); continue
                r.raise_for_status()
                for p, res in zip(lote, r.json()["results"]):
                    elev[f"{p[0]},{p[1]}"] = res["elevation"]
                break
            except Exception as ex:
                print("   elevação falhou", ex); time.sleep(3)
        time.sleep(1.1)  # limite público: 1 requisição/s
        cache_path.write_text(json.dumps(elev))

# ---------------- critérios ----------------
def nota_pop(p):
    return 1 if p < 1000 else 2 if p < 2500 else 3 if p < 5000 else 4 if p < 10000 else 5

def nota_sub(n):
    return 1 if n <= 2 else 2 if n <= 5 else 3 if n <= 7 else 4 if n <= 9 else 5

def nota_relevo(h):
    return 1 if h < 60 else 2 if h < 120 else 3

def lista(itens, k=6):
    vistos, out = set(), []
    for a, d in sorted(itens, key=lambda x: x[1]):
        if a["nome"] not in vistos:
            vistos.add(a["nome"]); out.append({**a, "dist_km": round(d / 1000, 2)})
    return out[:k]

feats, prontas = [], []
for tipo, nome, ways, info in alternativas:
    geom_ll = linemerge(MultiLineString([l for l, _ in ways.values()]))
    gm = proj(geom_ll)
    km = gm.length / 1000
    if km < 1 and not info:  # trechos OSM menores são em geral fragmentos de ruas urbanas; ramais SEINFRA entram todos
        continue
    prontas.append((tipo, nome, ways, geom_ll, gm, km, info))

todos_pts = []
for *_, geom_ll, gm, km, info in prontas:
    todos_pts += amostras(geom_ll, int(min(40, max(5, km))))
print("elevação: pontos a consultar", len([p for p in set(todos_pts) if f"{p[0]},{p[1]}" not in elev]))
busca_elevacao(todos_pts)

contagem_id = defaultdict(int)
def entroncamentos(gm, proprias):
    """Pontos onde outras vias encostam (até 30 m) no traçado. Via que corre junto por mais de 300 m é a mesma estrada."""
    pts = []
    for j in arv_outras.query(gm.buffer(30)):
        oid = arv_outras_ids[j]
        if oid in proprias:
            continue
        c = outras[oid]
        if c.distance(gm) > 30 or c.intersection(gm.buffer(30)).length > 300:
            continue
        p = nearest_points(gm, c)[0]
        if all(p.distance(q) > 50 for q in pts):
            pts.append(p)
    return pts

for tipo, nome, ways, geom_ll, gm, km, info in prontas:
    meio = geom_ll.interpolate(0.5, normalized=True)
    cod = municipio(meio)
    base_id = info["codigo"].lower() if info else re.sub(r"[^a-z0-9]+", "-", f"{nome}-{nomes_mun.get(cod, cod)}".lower()
                     .translate(str.maketrans("áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ", "aaaaeeiooouc" * 2))).strip("-")
    contagem_id[base_id] += 1
    vid = base_id if contagem_id[base_id] == 1 else f"{base_id}-{contagem_id[base_id]}"

    # --- C1 Uso do solo
    com = I["lugar"].perto(gm, 2000)
    ass = I["assent"].perto(gm, 2000) + ([({"nome": nome, "tipo": "nome da via"}, 0)] if "assentamento" in nome.lower() else [])
    agr, tur, ind = I["agric"].perto(gm, 1000), I["tur"].perto(gm, 2000), I["ind"].perto(gm, 2000)
    uso = {"comunidade": int(bool(com)), "assentamento": int(bool(ass)), "agricola": int(bool(agr)),
           "turismo": int(bool(tur)), "industrial": int(bool(ind))}
    # --- Nível de ocupação
    pes, dom, det_setores = populacao(gm)
    # população dos setores cruzados pelo traçado (perfis); sem cruzamento com setor habitado, setores a até 2 km
    cruz, cruz_metodo = list(arv_set.query(gm, predicate="intersects")), "setores cruzados pelo traçado"
    if not cruz:
        cruz, cruz_metodo = list(arv_set.query(gm, predicate="dwithin", distance=2000)), "setores a até 2 km (o traçado não cruza setor habitado)"
    prod = I["prod"].perto(gm, 1000)
    own = set(ways)
    pj = entroncamentos(gm, own)
    juncoes = pj
    espalhamento = max((a.distance(b) for a in pj for b in pj), default=0)
    n_pop, n_sub = nota_pop(pes), nota_sub(len(juncoes))
    # --- C2 Vulnerabilidade (1 = deficiência presente)
    aer, por = I["aero"].perto(gm, 10000), I["porto"].perto(gm, 10000)
    serv = I["serv"].perto(gm, 2000)
    pavimentada = lambda t: t["surface"] in PAVIMENTO if t.get("surface") else t.get("highway") in PAV_PADRAO
    comp_unp = sum(proj(l).length for l, t in ways.values() if not pavimentada(t))
    frac_unp = comp_unp / gm.length if gm.length else 0
    travessias, sem_ponte, igarapes = 0, 0, 0
    pontes_proprias = [proj(l) for l, t in ways.values() if t.get("bridge")]
    madeira = sum(1 for l, t in ways.values() if t.get("bridge") and ("wood" in (t.get("surface", "") + t.get("bridge:material", ""))))
    rios_cruzados = set()
    for i in arv_rio.query(gm):
        rg, rt, rn = rios[i]
        x = gm.intersection(rg)
        if x.is_empty:
            continue
        for p in (list(x.geoms) if hasattr(x, "geoms") else [x]):
            p = p.representative_point()
            travessias += 1
            if rt != "river":  # igarapé sem nome: em geral resolvido com bueiro, não com ponte
                igarapes += 1
                continue
            if rn:
                rios_cruzados.add(rn)
            sem_obra = info is not None and not info["obra"]
            perto_ponte = not sem_obra and any(p.distance(b) < 40 for b in pontes_proprias) or not sem_obra and (
                arv_ponte is not None and any(pontes[j].distance(p) < 40 for j in arv_ponte.query(p.buffer(40))))
            if not perto_ponte:
                sem_ponte += 1
    vul = {"sem_intermodal": int(not (aer or por)), "sem_rota_alternativa": int(espalhamento < 1000),
           "trafegabilidade_ruim": int(frac_unp > 0.5), "infra_acesso_deficiente": int(sem_ponte > 0 or madeira > 0),
           "sem_servicos_publicos": int(not serv)}
    # --- C3 Dificuldade
    pts = amostras(geom_ll, int(min(40, max(5, km))))
    alts = [elev.get(f"{a},{b}") for a, b in pts]
    alts = [a for a in alts if a is not None]
    h_med = sum(alts) / len(alts) if alts else 0
    alag = [alagados[i][1] for i in arv_alag.query(gm.buffer(500)) if alagados[i][0].distance(gm) <= 500] if arv_alag else []
    rio_grande = any(rios[i][1] == "river" and rios[i][0].distance(gm) <= 2000 for i in arv_rio.query(gm.buffer(2000)))
    terreno = 1 if (alag or (h_med <= 30 and rio_grande)) else 0  # igapó (2) só por vistoria
    uc_l, ti_l = toca(geom_ll, arv_uc, ucs), toca(geom_ll, arv_ti, tis)
    sit = idx_sitios.perto(gm, 1000)
    oae = 3 if sem_ponte else 2 if madeira else 1 if (pontes_proprias or travessias - igarapes) else 0
    dif = {"relevo": nota_relevo(h_med), "terreno": terreno, "uc": int(bool(uc_l)), "sitio": int(bool(sit)),
           "ti": int(bool(ti_l)), "oae": oae}

    props = {
        "id": vid, "tipo": tipo, "nome": nome, "seinfra": info, "municipio": nomes_mun.get(cod, cod), "cod_mun": cod,
        "pop_mun": pop_mun.get(cod), "km": round(km, 2),
        "uso": uso, "pop": pes, "dom": dom, "juncoes": len(juncoes), "n_pop": n_pop, "n_sub": n_sub,
        "vul": vul, "dif": dif,
        "pop_setores": int(sum(setores[i][1] for i in cruz)), "n_setores_cruzados": len(cruz), "pop_setores_metodo": cruz_metodo,
        "producao": len(prod),
        "ev": {  # evidências mostradas no relatório
            "comunidades": lista([(a, d) for a, d in com]), "assentamentos": lista(ass), "agricola": lista(agr),
            "producao": lista(prod), "turismo": lista(tur), "industrial": lista(ind), "aeroportos": lista(aer, 3), "portos": lista(por, 3),
            "servicos": lista(serv, 8), "ucs": uc_l, "tis": ti_l, "sitios": lista(sit, 8),
            "frac_nao_pavimentada": round(frac_unp, 2), "travessias": travessias, "igarapes": igarapes, "sem_ponte": sem_ponte,
            "pontes_madeira": madeira, "rios": sorted(rios_cruzados)[:8], "alagados": len(alag),
            "alt_media": round(h_med, 1), "alt_min": min(alts, default=None), "alt_max": max(alts, default=None),
            "perfil": alts, "superficies": [("Pavimentado (premissa: ramal com obra)" if info["obra"] else "Leito natural (premissa: ramal sem obra)")] if info else sorted({t.get("surface", "não informado") for _, t in ways.values()}),
            "setores": det_setores[:25], "n_setores": len(det_setores),
            "trechos": len(own), "fonte_tracado": "SEINFRA-AM 2025 (REV06)" if info else "OpenStreetMap",
        },
    }
    feats.append({"type": "Feature", "geometry": arred(geom_ll.simplify(0.0001)), "properties": props})

# ---------------- índice padrão (pesos do artigo) ----------------
W = {"vul": 0.648, "des": 0.230, "dif": 0.122}
def indice(p):
    V = sum(p["vul"].values()) / 5
    D = (sum(p["uso"].values()) + (p["n_pop"] + p["n_sub"]) / 2) / 10
    F = 1 - min(sum(p["dif"].values()), 10) / 10
    return W["vul"] * V + W["des"] * D + W["dif"] * F
feats.sort(key=lambda f: -indice(f["properties"]))
salvar("vias.geojson", {"type": "FeatureCollection", "features": feats})
with open(OUT / "ranking_padrao.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh, delimiter=";")
    w.writerow(["posicao", "id", "tipo", "nome", "municipio", "km", "C2_vulnerabilidade", "C1_desenvolvimento", "C3_dificuldade", "indice"])
    for k, f in enumerate(feats, 1):
        p = f["properties"]
        w.writerow([k, p["id"], p["tipo"], p["nome"], p["municipio"], p["km"], sum(p["vul"].values()),
                    sum(p["uso"].values()) + (p["n_pop"] + p["n_sub"]) / 2, sum(p["dif"].values()), round(indice(p), 4)])

# ---------------- camadas do mapa ----------------
def fc_pontos(itens):
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": arred(p), "properties": a} for p, a in itens]}
salvar("aeroportos.geojson", fc_pontos(aeroportos))
salvar("portos.geojson", fc_pontos(portos))
salvar("escolas.geojson", fc_pontos(escolas))
salvar("saude.geojson", fc_pontos(cnes + saude_cnefe))
salvar("sitios.geojson", fc_pontos([(p, {"nome": a.get("identificacao_bem"), "codigo": a.get("co_iphan"), "classe": a.get("ds_classificacao")}) for p, a in sitios]))
def fc_poli(lista_, campos):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": arred(g.intersection(estado).simplify(0.005), 4), "properties": {"nome": r, **{k: p.get(k) for k in campos}}}
        for g, r, p in lista_]}
salvar("ucs.geojson", fc_poli(ucs, ["categoria", "esfera", "grupo"]))
salvar("tis.geojson", fc_poli(tis, ["etnia_nome", "fase_ti"]))
salvar("municipios.geojson", {"type": "FeatureCollection", "features": [
    {"type": "Feature", "geometry": arred(g.simplify(0.003), 4), "properties": {"cod": c, "nome": nomes_mun.get(c), "pop2022": pop_mun.get(c)}}
    for g, c in muns]})
salvar("meta.json", {"gerado_em": time.strftime("%d/%m/%Y %H:%M"), "n_vias": len(feats),
                     "n_aeroportos": len(aeroportos), "n_portos": len(portos), "n_sitios": len(sitios),
                     "n_escolas": len(escolas), "n_saude": len(cnes) + len(saude_cnefe), "n_ucs": len(ucs), "n_tis": len(tis), "n_setores": len(setores)})
print("pronto:", len(feats), "vias")
