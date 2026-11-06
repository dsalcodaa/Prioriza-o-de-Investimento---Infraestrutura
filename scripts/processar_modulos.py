"""Módulos além dos ramais: REGIC, núcleos do Censo 2022, terminais hidroviários, aeródromos e cobertura de saúde.

Lê data/raw (coletar.py), a pasta "REGIC IBGE" e saídas do processar.py (vias, portos) e grava em docs/data.
Uso: python scripts/processar_modulos.py
"""
import csv, io, json, math, pathlib, re, sys, zipfile
from collections import defaultdict, Counter
import numpy as np
import openpyxl, shapefile
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
import shapely

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
RAW, OUT = RAIZ / "data" / "raw", RAIZ / "docs" / "data"
REGIC = RAIZ.parent / "REGIC IBGE"
KX, KY = 111320 * math.cos(math.radians(-4)), 110574
proj = lambda g: shapely.transform(g, lambda c: c * [KX, KY])
ler = lambda n: json.loads((RAW / n).read_text(encoding="utf-8"))
lerdoc = lambda n: json.loads((OUT / n).read_text(encoding="utf-8"))
def salvar(nome, obj):
    (OUT / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
def num(v):
    try:
        return float(str(v).replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None

# ---------------------------------------------------------------- REGIC 2018
print("REGIC…")
def planilha(arq, aba=0):
    wb = openpyxl.load_workbook(REGIC / arq, read_only=True)
    ws = wb.worksheets[aba] if isinstance(aba, int) else wb[aba]
    it = ws.iter_rows(values_only=True)
    cab = next(it)
    return [dict(zip(cab, r)) for r in it]

NIVEL = {"1A": 1.0, "1B": 1.0, "1C": 1.0, "2A": 0.9, "2B": 0.85, "2C": 0.8, "3A": 0.7, "3B": 0.65, "4A": 0.5, "4B": 0.45, "5": 0.25}
mun = {}
for r in planilha("REGIC2018_Municipios_Hierarquia_e_regiao.xlsx"):
    if r["siguf"] == "AM":
        mun[int(r["codmun"])] = {"cod": str(r["codmun"]), "nome": r["Município"], "hierarquia": r["Hierarquia"], "nivel": str(r["Hierarquia 3"]),
                                 "grupo": r["Hierarquia - grupo"], "regiao_imediata": next(v for c, v in r.items() if c and c.startswith("Região de influência - v"))}
for r in planilha("REGIC2018_Municipios_Ligacoes_e_atracao_xlsx/REGIC2018_Quest_Atracao_Municipios.xlsx"):
    m = mun.get(r["CODMUN"])
    if m:
        m.update(pop2018=r["POP2018"], ia=r["IA"] or 0, ia_saude_bm=r["IA_Q3"] or 0, ia_saude_alta=r["IA_Q4"] or 0, ia_aeroporto=r["IA_Q8"] or 0,
                 ia_transporte=r["IA_Q10"] or 0)
for r in planilha("REGIC2018_Cidades_v2.xlsx"):
    m = mun.get(int(r["COD_CIDADE"])) if r["UF"] == "AM" else None
    if m:
        m.update(pib=r["VAR03"], classe_saude=r["VAR93"], complexidade_saude=r["VAR94"], leitos_mil=num(r["VAR95"]))

# deslocamentos (questionário): destino principal e distância média por tema
TEMAS = {"Q3": "saude_bm", "Q4": "saude_alta", "Q5": "ensino_superior", "Q8": "aeroporto", "Q10": "transporte"}
sede = {}
lig = defaultdict(lambda: defaultdict(list))
for r in planilha("REGIC2018_Municipios_Ligacoes_e_atracao_xlsx/REGIC2018_Quest_Ligacoes_entre_Municipios.xlsx"):
    o, d = r["MUN_OR"], r["MUN_DEST"]
    if None in (r["X_ORIGEM"], r["Y_ORIGEM"], r["X_DESTINO"], r["Y_DESTINO"]):
        continue  # ligação sem coordenada de sede
    sede[o] = (r["X_ORIGEM"], r["Y_ORIGEM"]); sede[d] = (r["X_DESTINO"], r["Y_DESTINO"])
    if o in mun:
        dist = math.hypot((r["X_ORIGEM"] - r["X_DESTINO"]) * KX, (r["Y_ORIGEM"] - r["Y_DESTINO"]) * KY) / 1000
        for q, tema in TEMAS.items():
            if r[q]:
                lig[o][tema].append((r[q], r["NOME_DESTINO"], r["UF_DESTINO"], dist))
for c, m in mun.items():
    m["sede"] = [round(sede[c][0], 5), round(sede[c][1], 5)] if c in sede else None
    m["deslocamentos"] = {}
    for tema in TEMAS.values():
        l = sorted(lig[c][tema], reverse=True)
        tot = sum(x[0] for x in l)
        if tot:
            m["deslocamentos"][tema] = {"destino": f"{l[0][1]} ({l[0][2]})", "pct_destino": round(l[0][0], 1),
                                        "dist_media_km": round(sum(x[0] * x[3] for x in l) / tot), "n_destinos": len(l)}
ia_max = max(m.get("ia", 0) for m in mun.values())
for m in mun.values():
    h = NIVEL.get(m["nivel"], 0.25)
    m["nota_hierarquia"] = h
    # importância REGIC (0–1): 70 % posição na hierarquia + 30 % atração exercida sobre outros municípios (escala log)
    m["importancia"] = round(0.7 * h + 0.3 * math.log1p(m.get("ia", 0)) / math.log1p(ia_max), 4)

ligacoes = []
for r in planilha("REGIC2018_Ligacoes_entre_Cidades.xlsx"):
    if r["uf_ori"] == "AM" and r["vinculo"] == "sim":
        o, d = int(r["cod_ori"]), int(r["cod_dest"])
        if o in sede and d in sede:
            ligacoes.append({"o": r["nome_ori"], "d": r["nome_dest"], "nivel_d": r["nivel_dest"], "km": round(float(r["dist_km"])),
                             "coords": [list(map(lambda v: round(v, 4), sede[o])), list(map(lambda v: round(v, 4), sede[d]))]})
print("  municípios", len(mun), "vínculos", len(ligacoes))

# ---------------------------------------------------------------- bases espaciais
print("bases…")
pop_set = ler("ibge_setores_pop_AM.json")
cnefe = ler("ibge_cnefe_AM.json")
CEL, dom_cel = cnefe["celula_graus"], cnefe["dom"]
z = zipfile.ZipFile(RAW / "AM_setores_CD2022.zip")
sf = shapefile.Reader(shp=io.BytesIO(z.read("AM_setores_CD2022.shp")), dbf=io.BytesIO(z.read("AM_setores_CD2022.dbf")), encoding="utf-8")
setores = []
for sr in sf.iterShapeRecords():
    r = sr.record.as_dict()
    p = pop_set.get(r["CD_SETOR"])
    if not p or not p[0]:
        continue
    setores.append({"cd": r["CD_SETOR"], "sit": r["CD_SIT"], "tipo": r["CD_TIPO"], "mun": r["CD_MUN"], "nm_mun": r["NM_MUN"], "dist": r["NM_DIST"],
                    "aglom": r["NM_AGLOM"], "nu": r["NM_NU"], "pes": int(p[0]), "dom": int(p[1] or 0), "g": shape(sr.shape.__geo_interface__)})
print("  setores com moradores", len(setores))

# unidades de população: células de 220 m com domicílios do CNEFE (pessoas do setor rateadas pelos domicílios)
up_xy, up_pes, up_set = [], [], []
for i, s in enumerate(setores):
    cels = dom_cel.get(s["cd"])
    tot = sum(cels.values()) if cels else 0
    if tot:
        for k, n in cels.items():
            a, b = k.split(",")
            up_xy.append(((int(a) + .5) * CEL, (int(b) + .5) * CEL)); up_pes.append(s["pes"] * n / tot); up_set.append(i)
    else:
        q = s["g"].representative_point(); up_xy.append((q.x, q.y)); up_pes.append(s["pes"]); up_set.append(i)
up_xy, up_pes, up_set = np.array(up_xy), np.array(up_pes), np.array(up_set)
up_m = up_xy * [KX, KY]
print("  unidades de população", len(up_pes), "pessoas", round(up_pes.sum()))

def indice(pontos_lonlat):
    pts = shapely.points(np.array(pontos_lonlat) * [KX, KY]) if len(pontos_lonlat) else np.array([])
    return STRtree(pts), pts
def mais_proximo(arv, xy_m):
    """Para cada ponto (metros), índice e distância (km) do item mais próximo da árvore."""
    idx, dist = arv.query_nearest(shapely.points(xy_m), return_distance=True, all_matches=False)
    o = np.full(len(xy_m), -1); d = np.full(len(xy_m), np.inf)
    o[idx[0]] = idx[1]; d[idx[0]] = dist / 1000
    return o, d

# saúde (CNES): atenção primária e hospitais
PRIM = {1: "Posto de saúde", 2: "Unidade básica de saúde", 15: "Unidade mista", 32: "UBS fluvial", 71: "Apoio à saúde da família", 72: "Atenção à saúde indígena"}
HOSP = {5: "Hospital geral", 7: "Hospital especializado", 15: "Unidade mista"}
nomes_mun = {str(m["id"]): m["nome"] for m in ler("ibge_municipios.json")}
cnes = [e for e in ler("cnes_AM.json") if e.get("latitude_estabelecimento_decimo_grau") and e.get("longitude_estabelecimento_decimo_grau")
        and -10.5 < float(e["latitude_estabelecimento_decimo_grau"]) < 2.5 and -74 < float(e["longitude_estabelecimento_decimo_grau"]) < -56]
def unid(e, tipos):
    return {"cnes": e["codigo_cnes"], "nome": (e["nome_fantasia"] or "(sem nome)").title(), "tipo": tipos[e["codigo_tipo_unidade"]],
            "lon": float(e["longitude_estabelecimento_decimo_grau"]), "lat": float(e["latitude_estabelecimento_decimo_grau"])}
prim = [unid(e, PRIM) for e in cnes if e["codigo_tipo_unidade"] in PRIM]
hosp = [unid(e, HOSP) for e in cnes if e["codigo_tipo_unidade"] in HOSP]
arv_prim, _ = indice([(u["lon"], u["lat"]) for u in prim])
arv_hosp, _ = indice([(u["lon"], u["lat"]) for u in hosp])
print("  atenção primária", len(prim), "hospitais", len(hosp))

# aeródromos (ANAC)
def anac(nome, publico):
    t = (RAW / nome).read_bytes().decode("latin1").splitlines()[1:]
    out = []
    for r in csv.DictReader(t, delimiter=";"):
        if (r.get("UF") or "").strip() not in ("AM", "Amazonas"):
            continue
        la, lo = num(r.get("LATGEOPOINT")), num(r.get("LONGEOPOINT"))
        if la is None or lo is None:
            continue
        out.append({"oaci": r.get("Código OACI") or r.get("CIAD"), "ciad": r.get("CIAD"), "nome": r["Nome"].strip(), "municipio": r["Município"].strip().title(),
                    "publico": publico, "lat": la, "lon": lo, "superficie": (r.get("Superfície 1") or "").strip() or None,
                    "comprimento_m": num(r.get("Comprimento 1")), "noturno": bool((r.get("Operação Noturna") or "").strip())})
    return out
aero_pub, aero_priv = anac("anac_publicos.csv", True), anac("anac_privados.csv", False)
# pistas mapeadas no OSM a mais de 3 km de qualquer aeródromo da ANAC entram como "pista sem registro"
_anac = [(a["lon"], a["lat"]) for a in aero_pub + aero_priv]
for f in lerdoc("aeroportos.geojson")["features"]:
    lo, la = f["geometry"]["coordinates"]
    if all(math.hypot((lo - x) * KX, (la - y) * KY) > 3000 for x, y in _anac):
        aero_priv.append({"oaci": None, "ciad": None, "nome": f["properties"]["nome"], "municipio": "", "publico": False, "osm": True,
                          "lat": la, "lon": lo, "superficie": None, "comprimento_m": None, "noturno": False})
arv_pub, _ = indice([(a["lon"], a["lat"]) for a in aero_pub])
arv_aer, _ = indice([(a["lon"], a["lat"]) for a in aero_pub + aero_priv])
print("  aeródromos ANAC públicos", len(aero_pub), "privados + pistas OSM", len(aero_priv))

# portos e terminais (OSM), vias (SEINFRA + rodovias + OSM), massas d'água (BC250)
portos = [(f["geometry"]["coordinates"], f["properties"]) for f in lerdoc("portos.geojson")["features"]]
arv_porto, _ = indice([c for c, _ in portos])
linhas = [proj(shape(f["geometry"])) for f in lerdoc("vias.geojson")["features"]]
for e in ler("osm_conexoes.json")["elements"]:
    g = [(p["lon"], p["lat"]) for p in e.get("geometry", []) if p]
    if len(g) >= 2:
        linhas.append(proj(LineString(g)))
arv_via = STRtree(linhas)
agua = [(proj(shape(f["geometry"])), f["properties"].get("nome")) for f in ler("ibge_massa_dagua.json")["features"]]
arv_agua = STRtree([g for g, _ in agua])
print("  portos", len(portos), "linhas de via", len(linhas), "massas d'água", len(agua))

# distâncias de cada unidade de população
_, up_d_prim = mais_proximo(arv_prim, up_m)
_, up_d_hosp = mais_proximo(arv_hosp, up_m)
up_aero_pub, up_d_pub = mais_proximo(arv_pub, up_m)
_, up_d_aer = mais_proximo(arv_aer, up_m)
up_mun = np.array([setores[i]["mun"] for i in up_set])

# ---------------------------------------------------------------- núcleos (aglomerados do Censo 2022)
print("núcleos…")
ELEG = {"1": "urbano", "2": "urbano", "3": "núcleo urbano", "5": "povoado", "6": "núcleo rural", "7": "lugarejo"}
por_mun = defaultdict(list)
for i, s in enumerate(setores):
    if s["sit"] in ELEG:
        por_mun[s["mun"]].append(i)
nucleos = []
for cm, idx in por_mun.items():
    geoms = [proj(setores[i]["g"]).buffer(150) for i in idx]
    uni = unary_union(geoms)
    partes = list(getattr(uni, "geoms", [uni]))
    arv = STRtree(partes)
    grupos = defaultdict(list)
    for i, g in zip(idx, geoms):
        grupos[int(arv.query(g.centroid, predicate="intersects")[0]) if len(arv.query(g.centroid, predicate="intersects")) else int(arv.nearest(g.centroid))].append(i)
    for k, membros in grupos.items():
        ss = [setores[i] for i in membros]
        pes = sum(s["pes"] for s in ss)
        nm_mun = ss[0]["nm_mun"]
        cand = Counter()
        for s in ss:
            if s["sit"] in ("1", "2"):
                cand[f"Cidade de {nm_mun}" if s["dist"] == nm_mun else f"Vila de {s['dist']}"] += s["pes"]
            elif s["aglom"] or s["nu"]:
                cand[s["aglom"] or s["nu"]] += s["pes"]
        nome = cand.most_common(1)[0][0] if cand else f"Aglomerado sem nome ({ss[0]['cd']})"
        sit = Counter()
        for s in ss:
            sit[ELEG[s["sit"]]] += s["pes"]
        tipo = sit.most_common(1)[0][0]
        if nome.startswith("Cidade de"):
            tipo = "sede municipal"
        sel = np.isin(up_set, membros)
        w = up_pes[sel]
        cx, cy = (np.average(up_xy[sel], axis=0, weights=w) if w.sum() else (partes[k].centroid.x / KX, partes[k].centroid.y / KY))
        indig = sum(s["pes"] for s in ss if s["tipo"] == "5") > pes / 2
        nucleos.append({"id": f"n{ss[0]['cd']}", "nome": nome, "municipio": nomes_mun.get(cm, nm_mun), "cod_mun": cm, "tipo": tipo, "indigena": indig,
                        "pessoas": pes, "domicilios": sum(s["dom"] for s in ss), "setores": sorted(s["cd"] for s in ss), "lon": round(float(cx), 5), "lat": round(float(cy), 5)})
# só a maior mancha urbana do distrito-sede é a cidade; pedaços soltos (ex.: bairro de Manaus separado por rio) viram área urbana isolada
maior = {}
for n in nucleos:
    if n["tipo"] == "sede municipal" and n["pessoas"] > maior.get(n["cod_mun"], {"pessoas": -1})["pessoas"]:
        maior[n["cod_mun"]] = n
for n in nucleos:
    if n["tipo"] == "sede municipal" and maior[n["cod_mun"]] is not n:
        n["nome"], n["tipo"] = f"Área urbana isolada de {n['municipio']}", "núcleo urbano"
# comunidades fora dos aglomerados do IBGE (setores "área rural"): domicílios do CNEFE a até ~440 m uns dos outros
rural = np.array([setores[i]["sit"] == "8" for i in up_set])
cel = {}
for j in np.flatnonzero(rural):
    cel[(int(math.floor(up_xy[j, 0] / CEL)), int(math.floor(up_xy[j, 1] / CEL)))] = j
pai = {c: c for c in cel}
def raiz(c):
    while pai[c] != c:
        pai[c] = pai[pai[c]]; c = pai[c]
    return c
for (a, b) in cel:
    for da in (-2, -1, 0, 1, 2):
        for db in (-2, -1, 0, 1, 2):
            v = (a + da, b + db)
            if v in cel and setores[up_set[cel[v]]]["mun"] == setores[up_set[cel[(a, b)]]]["mun"]:
                pai[raiz(v)] = raiz((a, b))
grupos_r = defaultdict(list)
for c, j in cel.items():
    grupos_r[raiz(c)].append(j)
esc_pts = [(lo, la, loc or nome) for la, lo, nome, loc in cnefe["escolas"]]
arv_esc, _ = indice([(x, y) for x, y, _ in esc_pts])
lug = [(e["lon"], e["lat"], e["tags"]["name"]) for e in ler("osm_lugares.json")["elements"] if e.get("lon") and e.get("tags", {}).get("name")]
arv_lug, _ = indice([(x, y) for x, y, _ in lug])
n_rural = 0
for js_ in grupos_r.values():
    js_ = np.array(js_)
    pes = float(up_pes[js_].sum())
    if pes < 100:
        continue
    cx, cy = np.average(up_xy[js_], axis=0, weights=up_pes[js_])
    q = shapely.Point(cx * KX, cy * KY)
    ie, de = arv_esc.query_nearest(q, return_distance=True); il, dl = arv_lug.query_nearest(q, return_distance=True)
    if de[0] <= 2000:
        nome = esc_pts[ie[0]][2].strip().title()
    elif dl[0] <= 3000:
        nome = lug[il[0]][2]
    else:
        nome = "Comunidade sem nome"
    ss = sorted({setores[up_set[j]]["cd"] for j in js_})
    s0 = setores[up_set[js_[0]]]
    dom = sum(dom_cel.get(setores[up_set[j]]["cd"], {}).get(f"{math.floor(up_xy[j, 0] / CEL)},{math.floor(up_xy[j, 1] / CEL)}", 0) for j in js_)
    nucleos.append({"id": f"c{ss[0]}-{len(nucleos)}", "nome": nome, "municipio": nomes_mun.get(s0["mun"], s0["nm_mun"]), "cod_mun": s0["mun"],
                    "tipo": "comunidade rural (domicílios do CNEFE)", "indigena": sum(setores[up_set[j]]["tipo"] == "5" for j in js_) > len(js_) / 2,
                    "pessoas": round(pes), "domicilios": int(dom), "setores": ss, "lon": round(float(cx), 5), "lat": round(float(cy), 5)})
    n_rural += 1
print("  núcleos", len(nucleos), f"(comunidades rurais do CNEFE: {n_rural})", "pessoas", sum(n["pessoas"] for n in nucleos))

nu_m = np.array([(n["lon"] * KX, n["lat"] * KY) for n in nucleos])
def dist_linhas(arv, xy_m):
    idx, dist = arv.query_nearest(shapely.points(xy_m), return_distance=True, all_matches=False)
    d = np.full(len(xy_m), np.inf); o = np.full(len(xy_m), -1)
    d[idx[0]] = dist / 1000; o[idx[0]] = idx[1]
    return o, d
i_porto, d_porto = mais_proximo(arv_porto, nu_m)
_, d_via = dist_linhas(arv_via, nu_m)
i_agua, d_agua = dist_linhas(arv_agua, nu_m)
i_prim, d_prim = mais_proximo(arv_prim, nu_m)
i_hosp, d_hosp = mais_proximo(arv_hosp, nu_m)
i_pub, d_pub = mais_proximo(arv_pub, nu_m)
i_aer, d_aer = mais_proximo(arv_aer, nu_m)
for k, n in enumerate(nucleos):
    m = mun.get(int(n["cod_mun"]), {})
    sd = m.get("sede")
    n.update(dist_porto_km=round(float(d_porto[k]), 2), porto=portos[i_porto[k]][1]["nome"] if i_porto[k] >= 0 else None,
             dist_via_km=round(float(d_via[k]), 2), dist_agua_km=round(float(d_agua[k]), 2), agua=agua[i_agua[k]][1] if i_agua[k] >= 0 else None,
             dist_prim_km=round(float(d_prim[k]), 2), prim=prim[i_prim[k]]["nome"],
             dist_hosp_km=round(float(d_hosp[k]), 2), hosp=hosp[i_hosp[k]]["nome"],
             dist_aero_pub_km=round(float(d_pub[k]), 1), aero_pub=aero_pub[i_pub[k]]["nome"],
             dist_aero_km=round(float(d_aer[k]), 1), aero=(aero_pub + aero_priv)[i_aer[k]]["nome"],
             dist_sede_km=round(math.hypot((n["lon"] - sd[0]) * KX, (n["lat"] - sd[1]) * KY) / 1000, 1) if sd else None)

# ---------------------------------------------------------------- terminais hidroviários
print("terminais…")
def faixa(v, lim):
    return 1 + sum(v >= l for l in lim)
def regic_dep(m, tema, km):
    d = m.get("deslocamentos", {}).get(tema)
    return d is not None and d["dist_media_km"] > km
# terminais flutuantes do cadastro da SEINFRA-AM (os nomes vêm com dupla codificação no DBF)
def texto_dbf(s):
    for _ in range(3):
        try:
            s = s.encode("latin1").decode("utf-8")
        except UnicodeError:
            break
    return " ".join(s.split())
MINUSC = {"Do", "Da", "De", "Dos", "Das"}
sf_ter = shapefile.Reader(str(RAIZ.parent / "8-TERMINAIS FLUTUANTES" / "TERMINAIS FLUTUANTES.shp"), encoding="latin1")
ter_seinfra = [{"nome": texto_dbf(r[1]), "municipio": " ".join(w.lower() if w in MINUSC else w for w in texto_dbf(r[0]).title().split()),
                "tipo": "Terminal flutuante (SEINFRA-AM)", "fonte": "Cadastro de terminais flutuantes da SEINFRA-AM",
                "lon": s.points[0][0], "lat": s.points[0][1]} for s, r in zip(sf_ter.shapes(), sf_ter.records())]
# já tem terminal: terminal flutuante da SEINFRA ou porto, porto flutuante ou terminal hidroviário do OSM a até 2 km (píer não conta)
R_TEM = 2
existentes_ter = ter_seinfra + [{"nome": p.get("nome") or "Sem nome", "tipo": p["tipo"] + " (OpenStreetMap)", "lon": c[0], "lat": c[1]}
                                for c, p in portos if p.get("tipo") in ("Terminal hidroviário", "Porto", "Porto flutuante")]
i_ex, d_ex = mais_proximo(indice([(e["lon"], e["lat"]) for e in existentes_ter])[0], nu_m)
i_ts, d_ts = mais_proximo(indice([(e["lon"], e["lat"]) for e in ter_seinfra])[0], nu_m)
terminais, ja_atendidos = [], []
for k, n in enumerate(nucleos):
    if n["dist_agua_km"] > 1 or n["pessoas"] < 50 or n["tipo"] == "sede municipal" and n["pessoas"] > 200000:
        continue
    if d_ts[k] < n["dist_porto_km"]:
        n.update(dist_porto_km=round(float(d_ts[k]), 2), porto=f"{ter_seinfra[i_ts[k]]['nome']} (terminal flutuante da SEINFRA-AM)")
    if d_ex[k] <= R_TEM:
        e = existentes_ter[i_ex[k]]
        ja_atendidos.append({"nome": n["nome"], "municipio": n["municipio"], "pessoas": n["pessoas"], "terminal": e["nome"],
                             "tipo_terminal": e["tipo"], "dist_km": round(float(d_ex[k]), 2)})
        continue
    m = mun.get(int(n["cod_mun"]), {})
    vul = {"sem_terminal": int(n["dist_porto_km"] > 5), "sem_via": int(n["dist_via_km"] > 2),
           "longe_sede": int((n["dist_sede_km"] or 0) > 30), "sem_saude": int(n["dist_prim_km"] > 5),
           "regic_saude_longe": int(regic_dep(m, "saude_bm", 200))}
    terminais.append({**n, "vul": vul, "n_demanda": faixa(n["pessoas"], [200, 500, 1000, 5000]), "importancia_regic": m.get("importancia", 0.25),
                      "hierarquia": m.get("hierarquia")})
print("  candidatos a terminal", len(terminais), "| retirados por já terem terminal a até", R_TEM, "km:", len(ja_atendidos))

# ---------------------------------------------------------------- aeródromos
print("aeródromos…")
R_AERO = 50  # km: raio de atendimento de um aeródromo
sem_pub = up_d_pub > R_AERO
arv_up = STRtree(shapely.points(up_m))
aerodromos = []
for k, n in enumerate(nucleos):
    if n["pessoas"] < 1000:
        continue
    m = mun.get(int(n["cod_mun"]), {})
    perto = arv_up.query(shapely.Point(nu_m[k]).buffer(R_AERO * 1000))
    demanda = float(up_pes[perto][sem_pub[perto]].sum())
    vul = {"sem_publico": int(n["dist_aero_pub_km"] > R_AERO), "sem_nenhum": int(n["dist_aero_km"] > R_AERO),
           "sem_via": int(n["dist_via_km"] > 5), "hospital_longe": int(n["dist_hosp_km"] > 100),
           "regic_aeroporto_longe": int(regic_dep(m, "aeroporto", 150))}
    aerodromos.append({**n, "vul": vul, "demanda_sem_aerodromo": round(demanda), "n_demanda": faixa(demanda, [2000, 5000, 10000, 20000]),
                       "importancia_regic": m.get("importancia", 0.25), "hierarquia": m.get("hierarquia")})
print("  candidatos a aeródromo", len(aerodromos))

# demanda atendida por aeródromo público existente
existentes = []
for j, a in enumerate(aero_pub):
    sel = (up_aero_pub == j) & (up_d_pub <= R_AERO)
    existentes.append({**a, "pessoas_atendidas": round(float(up_pes[sel].sum()))})
priv = [{**a, "pessoas_atendidas": None} for a in aero_priv]

# ---------------------------------------------------------------- saúde: demanda por unidade e lacunas
print("saúde…")
REF_EQUIPE = 3500  # pessoas por equipe de Saúde da Família (teto da PNAB 2017)
up_prim, _ = mais_proximo(arv_prim, up_m)
dem = np.bincount(up_prim[up_prim >= 0], weights=up_pes[up_prim >= 0], minlength=len(prim))
longe = np.bincount(up_prim[(up_prim >= 0) & (up_d_prim > 5)], weights=up_pes[(up_prim >= 0) & (up_d_prim > 5)], minlength=len(prim))
unidades = []
for j, u in enumerate(prim):
    unidades.append({**u, "pessoas_atribuidas": round(float(dem[j])), "pessoas_a_mais_de_5km": round(float(longe[j])),
                     "equipes_referencia": max(1, math.ceil(dem[j] / REF_EQUIPE))})
up_hosp, _ = mais_proximo(arv_hosp, up_m)
dem_h = np.bincount(up_hosp[up_hosp >= 0], weights=up_pes[up_hosp >= 0], minlength=len(hosp))
for j, u in enumerate(hosp):
    unidades.append({**u, "hospital": True, "pessoas_atribuidas": round(float(dem_h[j]))})

# indicadores por município
indic = {}
for cm in sorted(set(up_mun)):
    sel = up_mun == cm
    p = float(up_pes[sel].sum())
    m = mun.get(int(cm), {})
    leitos = (m.get("leitos_mil") or 0) * (m.get("pop2018") or 0) / 1000
    indic[cm] = {"pessoas": round(p), "sem_atencao_primaria_5km": round(float(up_pes[sel & (up_d_prim > 5)].sum())),
                 "sem_hospital_100km": round(float(up_pes[sel & (up_d_hosp > 100)].sum())),
                 "sem_aerodromo_publico_50km": round(float(up_pes[sel & (up_d_pub > R_AERO)].sum())),
                 "sem_aerodromo_50km": round(float(up_pes[sel & (up_d_aer > R_AERO)].sum())),
                 "unidades_primarias": sum(1 for u in unidades if not u.get("hospital") and str(u["cnes"]) and False),
                 "leitos_estimados": round(leitos), "leitos_necessarios_2_5": round(2.5 * p / 1000),
                 "deficit_leitos": max(0, round(2.5 * p / 1000 - leitos))}
cod_up_prim = np.array([setores[i]["mun"] for i in up_set])
for cm in indic:
    sel = cod_up_prim == cm
    indic[cm]["unidades_primarias"] = len(set(up_prim[sel & (up_prim >= 0)].tolist()))
for c, m in mun.items():
    m["indicadores"] = indic.get(str(c), {})

# ---------------------------------------------------------------- saída
def fc(itens, props):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(i["lon"], 5), round(i["lat"], 5)]},
         "properties": {k: v for k, v in i.items() if k in props or props == "*"} if props != "*" else {k: v for k, v in i.items() if k not in ("lon", "lat")}}
        for i in itens]}
salvar("regic.json", {"municipios": sorted(mun.values(), key=lambda m: -m["importancia"]), "ligacoes": ligacoes,
                      "notas": {"importancia": "0,7 × nota da hierarquia + 0,3 × índice de atração (log, relativo ao maior do AM)",
                                "nota_hierarquia": NIVEL}})
salvar("terminais.geojson", fc(terminais, "*"))
salvar("terminais_existentes.geojson", fc(ter_seinfra, "*"))
salvar("aerodromos_candidatos.geojson", fc(aerodromos, "*"))
salvar("aerodromos_existentes.geojson", fc(existentes + priv, "*"))
salvar("saude_unidades.geojson", fc(unidades, "*"))
lacunas = sorted([n for n in nucleos if n["dist_prim_km"] > 5], key=lambda n: -n["pessoas"])
salvar("saude_lacunas.geojson", fc(lacunas, "*"))
salvar("modulos_meta.json", {"raio_aerodromo_km": R_AERO, "ref_equipe": REF_EQUIPE, "n_nucleos": len(nucleos),
                             "pessoas_total": round(float(up_pes.sum())),
                             "pessoas_sem_prim_5km": round(float(up_pes[up_d_prim > 5].sum())),
                             "pessoas_sem_hosp_100km": round(float(up_pes[up_d_hosp > 100].sum())),
                             "pessoas_sem_aero_pub": round(float(up_pes[up_d_pub > R_AERO].sum())),
                             "raio_terminal_existente_km": R_TEM, "n_terminais_seinfra": len(ter_seinfra),
                             "terminais_ja_atendidos": sorted(ja_atendidos, key=lambda x: -x["pessoas"]),
                             "n_prim": len(prim), "n_hosp": len(hosp), "n_aero_pub": len(aero_pub), "n_aero_priv": len(aero_priv)})
print("pronto:", len(terminais), "terminais,", len(aerodromos), "aeródromos,", len(lacunas), "lacunas de saúde")
