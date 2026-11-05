"""Coleta os dados brutos das APIs públicas para data/raw (cache: não baixa de novo se já existe).

Uso: python scripts/coletar.py  [--force]
"""
import json, math, sys, time, pathlib, requests

RAIZ = pathlib.Path(__file__).resolve().parent.parent
RAW = RAIZ / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
H = {"User-Agent": "priorizacao-obras-am/1.0 (pesquisa academica)"}
FORCE = "--force" in sys.argv
BBOX_AM = (-73.8, -9.9, -56.0, 2.3)  # lon_min, lat_min, lon_max, lat_max
OVERPASS = ["https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
            "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def salvar(nome, obj):
    (RAW / nome).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def ja_tem(nome):
    return (RAW / nome).exists() and not FORCE


def get(url, **kw):
    for tentativa in range(4):
        try:
            r = requests.get(url, headers=H, timeout=300, **kw)
            r.raise_for_status()
            return r
        except Exception as e:
            print("   falhou", tentativa + 1, e)
            time.sleep(5 * (tentativa + 1))
    raise RuntimeError("sem resposta: " + url)


def js(r):
    """JSON tolerante a servidores que mandam latin1 sem avisar."""
    try:
        return json.loads(r.content.decode("utf-8"))
    except UnicodeDecodeError:
        return json.loads(r.content.decode("latin1"))


def overpass(nome, corpo, saida="out tags geom;"):
    if ja_tem(nome):
        return print("ok (cache)", nome)
    if "->.v;" in corpo:  # consulta em etapas: o corpo já traz os conjuntos
        q = f'[out:json][timeout:600];area["ISO3166-2"="BR-AM"]->.am;{corpo}{saida}'
    else:
        q = f'[out:json][timeout:600];area["ISO3166-2"="BR-AM"]->.am;({corpo});{saida}'
    for url in OVERPASS * 3:
        try:
            r = requests.post(url, data={"data": q}, headers=H, timeout=700)
            r.raise_for_status()
            d = r.json()
            salvar(nome, d)
            return print("ok", nome, len(d["elements"]), "elementos")
        except Exception as e:
            print("   overpass falhou", url, e)
            time.sleep(20)
    raise RuntimeError("overpass sem resposta: " + nome)


def wfs(nome, base, layer, extra=""):
    if ja_tem(nome):
        return print("ok (cache)", nome)
    b = BBOX_AM
    url = (f"{base}?service=WFS&version=1.0.0&request=GetFeature&typeName={layer}"
           f"&outputFormat=application/json&srsName=EPSG:4326&bbox={b[0]},{b[1]},{b[2]},{b[3]},EPSG:4326{extra}")
    d = js(get(url))
    salvar(nome, d)
    print("ok", nome, len(d["features"]), "feições")


# ---------- IBGE ----------
if not ja_tem("ibge_municipios.json"):
    salvar("ibge_municipios.json", js(get("https://servicodados.ibge.gov.br/api/v1/localidades/estados/13/municipios")))
    print("ok ibge_municipios.json")
if not ja_tem("ibge_malha.geojson"):
    salvar("ibge_malha.geojson", get("https://servicodados.ibge.gov.br/api/v3/malhas/estados/13"
                                     "?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=intermediaria").json())
    print("ok ibge_malha.geojson")
if not ja_tem("ibge_pop2022.json"):
    # Censo 2022, tabela 4709, variável 93 = população residente, todos os municípios do AM
    salvar("ibge_pop2022.json", js(get("https://apisidra.ibge.gov.br/values/t/4709/n6/in%20n3%2013/v/93/p/2022")))
    print("ok ibge_pop2022.json")

if not ja_tem("AM_setores_CD2022.zip"):
    # setores censitários do Censo 2022 (com população por setor) — base do Nível de Ocupação
    (RAW / "AM_setores_CD2022.zip").write_bytes(get(
        "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
        "malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/setores/shp/UF/AM_setores_CD2022.zip").content)
    print("ok AM_setores_CD2022.zip")

if not ja_tem("ibge_setores_pop_AM.json"):
    # Agregados por setor (básico, Brasil) → só AM: pessoas (v0001) e domicílios (v0002)
    import zipfile, io, csv
    z = zipfile.ZipFile(io.BytesIO(get("https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/"
                                       "Agregados_por_Setor_csv/Agregados_por_setores_basico_BR_20260520.zip").content))
    nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
    txt = io.TextIOWrapper(z.open(nome), encoding="latin1")
    leitor = csv.DictReader(txt, delimiter=";")
    pop = {}
    for linha in leitor:
        if linha["CD_SETOR"].startswith("13"):
            num = lambda k: float((linha.get(k) or "0").replace(",", ".") or 0) if (linha.get(k) or "X") not in ("X", ".") else 0
            pop[linha["CD_SETOR"]] = [num("v0001"), num("v0002")]
    salvar("ibge_setores_pop_AM.json", pop)
    print("ok ibge_setores_pop_AM.json", len(pop), "setores")

if not ja_tem("ibge_cnefe_AM.json"):
    # CNEFE 2022: endereços do Censo com coordenadas. Domicílios viram contagem por setor numa grade de ~220 m
    # (para ratear a população do setor pelo que cai no raio); escolas, saúde e agropecuária viram pontos.
    import zipfile, io, csv
    zpath = RAW / "cnefe_13_AM.zip"
    if not zpath.exists():
        zpath.write_bytes(get("https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/"
                              "Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/13_AM.zip").content)
    z = zipfile.ZipFile(zpath)
    rd = csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8"), delimiter=";")
    dom, esc, sau, agro = {}, [], [], []
    for l in rd:
        try:
            lat, lon = float(l["LATITUDE"]), float(l["LONGITUDE"])
        except ValueError:
            continue
        esp, setor = l["COD_ESPECIE"], l["COD_SETOR"][:15]  # CNEFE traz sufixo (P) no código do setor
        if esp == "1":
            cel = f"{math.floor(lon / 0.002)},{math.floor(lat / 0.002)}"
            dom.setdefault(setor, {})
            dom[setor][cel] = dom[setor].get(cel, 0) + 1
        elif esp in ("4", "5"):
            (esc if esp == "4" else sau).append([round(lat, 6), round(lon, 6), l["DSC_ESTABELECIMENTO"] or "(sem nome)", l["DSC_LOCALIDADE"]])
        elif esp == "3":
            agro.append([round(lat, 5), round(lon, 5)])
    salvar("ibge_cnefe_AM.json", {"celula_graus": 0.002, "dom": dom, "escolas": esc, "saude": sau, "agro": agro})
    print("ok ibge_cnefe_AM.json", len(dom), "setores com domicílios;", len(esc), "escolas;", len(sau), "saúde;", len(agro), "agropecuários")

if not ja_tem("cnes_AM.json"):
    # CNES (Ministério da Saúde): estabelecimentos de saúde do AM com coordenadas; a API devolve 20 por página
    lista, off = [], 0
    while True:
        r = get("https://apidadosabertos.saude.gov.br/cnes/estabelecimentos", params={"codigo_uf": 13, "limit": 20, "offset": off})
        pag = js(r).get("estabelecimentos", [])
        lista += [{k: e.get(k) for k in ("codigo_cnes", "nome_fantasia", "codigo_tipo_unidade", "codigo_municipio",
                                         "latitude_estabelecimento_decimo_grau", "longitude_estabelecimento_decimo_grau")} for e in pag]
        if len(pag) < 20:
            break
        off += 20
        time.sleep(0.2)
    salvar("cnes_AM.json", lista)
    print("ok cnes_AM.json", len(lista), "estabelecimentos")

# ---------- INPE TerraBrasilis ----------
TB = "https://terrabrasilis.dpi.inpe.br/geoserver/ows"
wfs("inpe_ucs.geojson", TB, "prodes-legal-amz:conservation_units_legal_amazon")
wfs("inpe_tis.geojson", TB, "prodes-legal-amz:indigenous_area_legal_amazon")

# ---------- IPHAN ----------
wfs("iphan_sitios.geojson", "https://geoserver.iphan.gov.br/geoserver/ows", "SICG:sitios")

# ---------- OpenStreetMap ----------
overpass("osm_ramais.json", 'way["highway"]["name"~"^(Ramal|Estrada|Vicinal|Rodovia Vicinal)",i](area.am);')
overpass("osm_rodovias.json", 'way["highway"]["ref"~"AM[- ]?[0-9]"](area.am);')
overpass("osm_aeroportos.json", 'nwr["aeroway"~"^(aerodrome|airstrip)$"](area.am);')
overpass("osm_portos.json", 'nwr["amenity"="ferry_terminal"](area.am);nwr["man_made"~"^(pier|floating_pier)$"](area.am);'
                            'nwr["harbour"](area.am);nwr["landuse"="port"](area.am);nwr["floating"="yes"](area.am);')
overpass("osm_servicos.json", 'nwr["amenity"~"^(school|hospital|clinic|doctors|townhall|police|community_centre)$"](area.am);'
                              'nwr["healthcare"](area.am);')
overpass("osm_lugares.json", 'node["place"~"^(city|town|village|hamlet|isolated_dwelling|locality|neighbourhood)$"](area.am);')
overpass("osm_usosolo.json", 'nwr["landuse"~"^(farmland|farmyard|meadow|orchard|plantation|industrial|quarry)$"](area.am);'
                             'nwr["tourism"](area.am);nwr["man_made"="works"](area.am);nwr["craft"](area.am);')
VIAS = ('(way["highway"]["name"~"^(Ramal|Estrada|Vicinal|Rodovia Vicinal)",i](area.am);'
        'way["highway"]["ref"~"AM[- ]?[0-9]"](area.am);)->.v;')
# conexões = vias que compartilham nós com os ramais/rodovias (entroncamentos e pontes no próprio traçado)
if not ja_tem("osm_conexoes.json"):
    juntos = {}
    for k, filtro in (("r", '["name"~"^(Ramal|Estrada|Vicinal|Rodovia Vicinal)",i]'), ("d", '["ref"~"AM[- ]?[0-9]"]')):
        overpass(f"con_{k}.json", f'way["highway"]{filtro}(area.am)->.v;node(w.v)->.n;way(bn.n)["highway"];', saida="out body geom;")
        for e in json.loads((RAW / f"con_{k}.json").read_text(encoding="utf-8"))["elements"]:
            juntos[e["id"]] = e
    salvar("osm_conexoes.json", {"elements": list(juntos.values())})
    print("ok osm_conexoes.json", len(juntos))

# água, várzea e pontes: IBGE BC250 (2025), só nas células de 1° tocadas pelas vias
BC = "https://geoservicos.ibge.gov.br/geoserver/wfs"
CAMADAS_BC = {"drenagem": "CCAR:BC250_2025_hid_trecho_drenagem_l", "inundacao": "CCAR:BC250_2025_hid_terreno_sujeito_inundacao_a",
              "ponte_l": "CCAR:BC250_2025_tra_ponte_l", "ponte_p": "CCAR:BC250_2025_tra_ponte_p"}
if not ja_tem("ibge_bc250.json"):
    celulas = set()
    for arq in ("osm_ramais.json", "osm_rodovias.json"):
        for e in json.loads((RAW / arq).read_text(encoding="utf-8"))["elements"]:
            for p in e.get("geometry", []):
                if p:
                    celulas.add((math.floor(p["lon"]), math.floor(p["lat"])))
    print("   células BC250:", len(celulas))
    saida = {k: [] for k in CAMADAS_BC}
    for k, layer in CAMADAS_BC.items():
        vistos = set()
        for x, y in sorted(celulas):
            url = (f"{BC}?service=WFS&version=1.0.0&request=GetFeature&typeName={layer}&outputFormat=application/json"
                   f"&srsName=EPSG:4326&bbox={x},{y},{x + 1},{y + 1},EPSG:4326")
            for f in js(get(url))["features"]:
                chave = f.get("id") or json.dumps(f["geometry"])[:200]
                if chave not in vistos and f.get("geometry"):
                    vistos.add(chave); saida[k].append(f)
        print("   ", k, len(saida[k]))
    salvar("ibge_bc250.json", saida)
    print("ok ibge_bc250.json")
print("coleta concluída")
