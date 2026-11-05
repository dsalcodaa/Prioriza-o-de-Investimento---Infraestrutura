/* Plataforma de priorização de obras viárias — Amazonas
   Modelo: TCC UNINORTE 2023 (AHP) com as correções da revisão (ver aba Método). */
"use strict";

const NOMES = { V: "Vulnerabilidade de transporte", D: "Desenvolvimento local", F: "Dificuldade de projeto e execução" };
const PADRAO = { vd: 3, vf: 5, df: 2 }; // matriz do artigo → 0,648 / 0,230 / 0,122
const RI3 = 0.58;

// Itens de cada critério: chave, rótulo, escala (opções), se é estimativa a confirmar em campo
const ITENS = {
  D: [
    ["uso.comunidade", "Acesso a comunidade ou distrito (até 2 km)", [0, 1]],
    ["uso.assentamento", "Assentamento oficial (INCRA)", [0, 1], true],
    ["uso.agricola", "Zona agrícola ou agropecuária (até 1 km)", [0, 1], true],
    ["uso.turismo", "Zona ou ponto turístico (até 2 km)", [0, 1]],
    ["uso.industrial", "Atividade extrativista ou industrial (até 2 km)", [0, 1]],
    ["n_pop", "Nota de população (Censo 2022, raio 2 km)", [1, 2, 3, 4, 5], true],
    ["n_sub", "Nota de entroncamentos / sub-ramais", [1, 2, 3, 4, 5]],
  ],
  V: [
    ["vul.sem_intermodal", "Sem porto ou aeroporto a até 10 km", [0, 1]],
    ["vul.sem_rota_alternativa", "Sem rota terrestre alternativa", [0, 1]],
    ["vul.trafegabilidade_ruim", "Maior parte sem pavimento", [0, 1], true],
    ["vul.infra_acesso_deficiente", "Travessia sem ponte ou ponte de madeira", [0, 1], true],
    ["vul.sem_servicos_publicos", "Sem escola ou saúde a até 2 km", [0, 1]],
  ],
  F: [
    ["dif.relevo", "Relevo (altitude média SRTM)", [1, 2, 3]],
    ["dif.terreno", "Terreno: 0 terra firme · 1 várzea · 2 igapó", [0, 1, 2], true],
    ["dif.uc", "Unidade de conservação (INPE)", [0, 1]],
    ["dif.sitio", "Sítio arqueológico até 1 km (IPHAN)", [0, 1]],
    ["dif.ti", "Terra indígena (INPE)", [0, 1]],
    ["dif.oae", "Obras de arte especiais: 0 nenhuma · 1 possui · 2 precisa intervenção · 3 implantar", [0, 1, 2, 3], true],
  ],
};

const fmt = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = (s) => document.querySelector(s);
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
const recuperar = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };

let VIAS = [], META = {}, pares = recuperar("pares", { ...PADRAO }), ajustes = recuperar("ajustes", {});
let W = { V: 0.648, D: 0.23, F: 0.122 }, CR = 0, ordem = [], filtradas = [], selecionada = null, limite = 60;
let REGIC = {}, RPESO = recuperar("rpeso", 0.15), subFicha = "notas"; // RPESO: parte do índice dada à importância REGIC do município

/* ---------- AHP ---------- */
function ahp() {
  const A = [[1, pares.vd, pares.vf], [1 / pares.vd, 1, pares.df], [1 / pares.vf, 1 / pares.df, 1]];
  let w = [1 / 3, 1 / 3, 1 / 3];
  for (let k = 0; k < 100; k++) { // método da potência → autovetor principal
    const n = A.map((l) => l.reduce((s, a, j) => s + a * w[j], 0));
    const s = n.reduce((a, b) => a + b, 0);
    w = n.map((x) => x / s);
  }
  const Aw = A.map((l) => l.reduce((s, a, j) => s + a * w[j], 0));
  const lmax = Aw.reduce((s, x, i) => s + x / w[i], 0) / 3;
  const CI = (lmax - 3) / 2;
  return { w: { V: w[0], D: w[1], F: w[2] }, lmax, CI, CR: CI / RI3, A };
}

/* ---------- notas ---------- */
function auto(p, chave) {
  const [g, k] = chave.split(".");
  return k ? p[g][k] : p[g];
}
function valor(p, chave) {
  const a = ajustes[p.id];
  return a && a[chave] !== undefined ? a[chave] : auto(p, chave);
}
function notas(p) {
  const s = (lista) => lista.reduce((t, [c]) => t + valor(p, c), 0);
  const uso = ITENS.D.slice(0, 5).reduce((t, [c]) => t + valor(p, c), 0);
  const ocup = (valor(p, "n_pop") + valor(p, "n_sub")) / 2;
  const V = s(ITENS.V), D = uso + ocup, F = Math.min(10, s(ITENS.F));
  const k = 1 - RPESO, R = REGIC[p.cod_mun]?.importancia ?? 0;
  const pv = k * W.V * V / 5, pd = k * W.D * D / 10, pf = k * W.F * (1 - F / 10), pr = RPESO * R;
  return { V, D, F, uso, ocup, R, pv, pd, pf, pr, ip: pv + pd + pf + pr };
}

function recalcular() {
  const r = ahp();
  if (r.CR < 0.1) { W = r.w; CR = r.CR; } // matriz inconsistente não altera o ranking
  VIAS.forEach((v) => (v.n = notas(v.p)));
  ordem = [...VIAS].sort((a, b) => (b.n.ip - a.n.ip) || (b.p.pop - a.p.pop)); // empate: mais população no entorno primeiro
  ordem.forEach((v, i) => (v.pos = i + 1));
  filtrar();
}

/* ---------- filtros e lista ---------- */
function filtrar() {
  const q = $("#busca").value.trim().toLowerCase();
  const mun = $("#f-mun").value;
  const okR = $("#f-ramal").checked, okRod = $("#f-rodovia").checked;
  filtradas = ordem.filter((v) => {
    const p = v.p;
    if (p.tipo.startsWith("Ramal") ? !okR : !okRod) return false;
    if (mun && p.municipio !== mun) return false;
    return !q || (p.nome + " " + p.municipio).toLowerCase().includes(q);
  });
  filtradas.forEach((v, i) => (v.posf = i + 1));
  desenharLista();
  estilizarMapa();
}

function corPorPosicao(i, n) {
  const f = i / Math.max(n, 1);
  return f < 0.1 ? "--p1" : f < 0.25 ? "--p2" : f < 0.5 ? "--p3" : f < 0.75 ? "--p4" : "--p5";
}
const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

function desenharLista() {
  const filtro = filtradas.length !== ordem.length;
  $("#resumo").textContent = `${fmt(filtradas.length)} vias${filtro ? ` de ${fmt(ordem.length)}` : ""} · posição no ranking geral à esquerda`;
  const max = filtradas[0]?.n.ip || 1;
  $("#lista").innerHTML = filtradas.slice(0, limite).map((v) => {
    const n = v.n, p = v.p, larg = (x) => (100 * x / max).toFixed(1) + "%";
    return `<li data-id="${esc(p.id)}" class="${selecionada === v ? "ativo" : ""}" tabindex="0">
      <span class="pos">${v.pos}</span>
      <span class="nome">${esc(p.nome)}</span>
      <span class="ip" title="Índice de prioridade (0–100)">${fmt(n.ip * 100, 1)}</span>
      <span class="sub">${esc(p.municipio)} · ${esc(p.tipo === "Rodovia estadual" ? "rodovia" : "ramal")} · ${fmt(p.km, 1)} km</span>
      <span class="faixa" title="Parcelas: vulnerabilidade, desenvolvimento, facilidade, REGIC"><i class="v" style="width:${larg(n.pv)}"></i><i class="d" style="width:${larg(n.pd)}"></i><i class="f" style="width:${larg(n.pf)}"></i><i class="r" style="width:${larg(n.pr)}"></i></span>
    </li>`;
  }).join("") + (filtradas.length > limite ? `<li class="mais-li"><button class="mais" id="btn-mais">Mostrar mais ${Math.min(60, filtradas.length - limite)}</button></li>` : "");
}

/* ---------- mapa ---------- */
const mapa = L.map("mapa", { preferCanvas: true, zoomControl: true }).setView([-3.6, -61.5], 6);
const atrib = {
  osm: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  esri: "Tiles © Esri",
  topo: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), SRTM',
};
const fundos = {
  relevo: L.layerGroup([
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo + " · " + atrib.osm }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, opacity: 0.35, attribution: atrib.esri }),
  ]),
  satelite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: atrib.esri }),
  osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: atrib.osm }),
};
let fundo = fundos.relevo.addTo(mapa);
const camadas = {};
let camadaVias;

function estilizarMapa() {
  if (!camadaVias) return;
  const visiveis = new Set(filtradas);
  const n = filtradas.length;
  camadaVias.eachLayer((l) => {
    const v = l.via;
    const vis = visiveis.has(v);
    l.setStyle({
      color: vis ? cor(corPorPosicao(v.posf - 1, n)) : "#8a8f86",
      weight: (v === selecionada ? 7 : v.p.tipo === "Rodovia estadual" ? 4.5 : 3.2),
      opacity: vis ? 0.95 : 0.15,
    });
    if (vis && v.posf <= Math.ceil(n * 0.1)) l.bringToFront();
  });
  if (selecionada) selecionada.layer.bringToFront();
}

const iconeCirculo = (estilo) => (f, ll) => L.circleMarker(ll, estilo);
async function carregar(nome) { const r = await fetch("data/" + nome, { cache: "no-cache" }); if (!r.ok) throw new Error(nome + ": " + r.status); return r.json(); }

function popupLista(titulo, props, extra = "") {
  return `<div class="popup-tit">${esc(props.nome || "(sem nome)")}</div><div>${esc(titulo)}${extra}</div>`;
}

async function iniciar() {
  try {
    const [vias, meta, regic] = await Promise.all([carregar("vias.geojson"), carregar("meta.json"), carregar("regic.json").catch(() => null)]);
    META = meta;
    if (regic) { REGIC = Object.fromEntries(regic.municipios.map((m) => [m.cod, m])); window.REGIC_DADOS = regic; }
    camadaVias = L.geoJSON(vias, {
      onEachFeature: (f, l) => {
        const v = { p: f.properties, layer: l };
        l.via = v; VIAS.push(v);
        l.on("click", () => selecionar(v, false));
        l.bindTooltip(() => `${esc(v.p.nome)} · ${v.pos}º`, { sticky: true });
      },
    }).addTo(mapa);
  } catch (e) {
    $("#lista").innerHTML = `<li>Não foi possível carregar os dados (${esc(e.message)}). Abra a plataforma por um servidor web, não pelo arquivo local.</li>`;
    return;
  }
  [...new Set(VIAS.map((v) => v.p.municipio))].sort((a, b) => a.localeCompare(b, "pt")).forEach((m) =>
    $("#f-mun").insertAdjacentHTML("beforeend", `<option>${esc(m)}</option>`));
  $("#meta").textContent = `Dados gerados em ${META.gerado_em}: ${fmt(META.n_vias)} vias, ${fmt(META.n_aeroportos)} aeroportos e pistas, ${fmt(META.n_portos)} portos, ${fmt(META.n_sitios)} sítios arqueológicos, ${fmt(META.n_ucs)} unidades de conservação, ${fmt(META.n_tis)} terras indígenas, ${fmt(META.n_setores)} setores censitários.`;
  montarPares();
  recalcular();
  abrirPorHash();

  // camadas secundárias carregam depois, sem travar o ranking
  const defs = {
    aeroportos: ["aeroportos.geojson", { pointToLayer: iconeCirculo({ radius: 6, color: "#fff", weight: 1.5, fillColor: cor("--rio"), fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(popupLista(f.properties.tipo, f.properties)) }],
    portos: ["portos.geojson", { pointToLayer: iconeCirculo({ radius: 5, color: cor("--rio"), weight: 3, fillColor: "#fff", fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(popupLista(f.properties.tipo, f.properties)) }],
    escolas: ["escolas.geojson", { pointToLayer: iconeCirculo({ radius: 3.5, color: "#fff", weight: 1, fillColor: cor("--p3"), fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(popupLista("Escola", f.properties, `<br>${esc(f.properties.fonte)}`)) }],
    saude: ["saude.geojson", { pointToLayer: iconeCirculo({ radius: 3.5, color: "#fff", weight: 1, fillColor: cor("--p1"), fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(popupLista("Saúde", f.properties, `<br>${esc(f.properties.fonte)}`)) }],
    ucs: ["ucs.geojson", { style: { color: cor("--mata"), weight: 1, fillOpacity: 0.18 }, onEachFeature: (f, l) => l.bindPopup(popupLista("Unidade de conservação", f.properties)) }],
    tis: ["tis.geojson", { style: { color: cor("--p2"), weight: 1, fillColor: cor("--p2"), fillOpacity: 0.14 }, onEachFeature: (f, l) => l.bindPopup(popupLista("Terra indígena", f.properties)) }],
    sitios: ["sitios.geojson", { pointToLayer: iconeCirculo({ radius: 3.5, color: "#6b3fa0", weight: 0, fillOpacity: 0.85 }),
      onEachFeature: (f, l) => l.bindPopup(popupLista("Sítio arqueológico (IPHAN)", f.properties, f.properties.codigo ? `<br>${esc(f.properties.codigo)}` : "")) }],
    municipios: ["municipios.geojson", { style: { color: cor("--tinta-2"), weight: 0.8, dashArray: "3 4", fill: false, interactive: false } }],
  };
  for (const [k, [arq, opc]] of Object.entries(defs)) {
    camadas[k] = carregar(arq).then((d) => L.geoJSON(d, opc)).catch(() => null);
    const cb = document.querySelector(`[data-camada="${k}"]`);
    if (cb.checked) alternarCamada(k, true);
  }
  camadaVias.bringToFront();
}

async function alternarCamada(k, ligar) {
  const c = await camadas[k];
  if (!c) return;
  if (ligar) { c.addTo(mapa); if (k === "ucs" || k === "tis" || k === "municipios") c.bringToBack(); camadaVias.bringToFront(); }
  else mapa.removeLayer(c);
}

/* ---------- ficha ---------- */
function linhaItem(p, chave, rot, escala, estim) {
  const v = valor(p, chave), a = auto(p, chave), aj = v !== a;
  const opts = escala.map((o) => `<option value="${o}" ${o === v ? "selected" : ""}>${o}</option>`).join("");
  return `<tr class="${aj ? "ajustado" : ""}"><td>${esc(rot)}${estim ? ' <span class="estim">estimativa</span>' : ""}${aj ? ` <span class="estim">ajustado (automático: ${a})</span>` : ""}${evidencia(p, chave)}</td>
    <td class="n"><select data-chave="${chave}" aria-label="${esc(rot)}">${opts}</select></td></tr>`;
}

function nomes(lista) { return (lista || []).map((x) => `${x.nome} (${fmt(x.dist_km, 1)} km)`).join("; "); }
function evidencia(p, chave) {
  const e = p.ev, t = {
    "uso.comunidade": nomes(e.comunidades), "uso.assentamento": nomes(e.assentamentos), "uso.agricola": nomes(e.agricola),
    "uso.turismo": nomes(e.turismo), "uso.industrial": nomes(e.industrial),
    n_pop: `${fmt(p.pop)} pessoas e ${fmt(p.dom)} domicílios estimados no entorno, somando ${fmt(e.n_setores || 0)} setores censitários: ` +
      (e.setores || []).map((s) => `${s.setor} (${s.situacao}) ${fmt(s.pessoas_raio)} de ${fmt(s.pessoas)} pessoas`).join("; ") +
      ((e.n_setores || 0) > (e.setores || []).length ? "; demais setores com menos pessoas" : ""),
    n_sub: `${fmt(p.juncoes)} entroncamentos com outras vias`,
    "vul.sem_intermodal": [nomes(e.aeroportos), nomes(e.portos)].filter(Boolean).join("; ") || "nenhum encontrado",
    "vul.sem_rota_alternativa": p.vul.sem_rota_alternativa ? "entroncamentos concentrados em um só ponto (via sem saída)" : "entroncamentos em pontos distintos",
    "vul.trafegabilidade_ruim": `${fmt(e.frac_nao_pavimentada * 100)} % sem pavimento · revestimento: ${e.superficies.join(", ")}`,
    "vul.infra_acesso_deficiente": `${e.travessias} travessias de curso d'água (${e.igarapes ?? 0} igarapés menores, tratados como bueiro), ${e.sem_ponte} rios sem ponte mapeada, ${e.pontes_madeira} pontes de madeira${e.rios.length ? " · " + e.rios.join(", ") : ""}`,
    "vul.sem_servicos_publicos": nomes(e.servicos) || "nenhum encontrado",
    "dif.relevo": e.alt_min != null ? `média ${fmt(e.alt_media)} m (mín. ${fmt(e.alt_min)} m, máx. ${fmt(e.alt_max)} m)` : "sem dado",
    "dif.terreno": `${e.alagados} áreas alagáveis mapeadas a até 500 m`,
    "dif.uc": (e.ucs || []).join("; "), "dif.ti": (e.tis || []).join("; "), "dif.sitio": nomes(e.sitios),
    "dif.oae": `${e.travessias - (e.igarapes ?? 0)} travessias de rio, ${e.sem_ponte} sem ponte mapeada (IBGE BC250 + OSM)`,
  }[chave];
  return t ? `<span class="ev">${esc(t)}</span>` : "";
}

function dadosSeinfra(p) {
  const s = p.seinfra; if (!s) return "";
  const linha = (r, v) => v != null && v !== "" ? `<tr><td>${r}</td><td class="n">${esc(v)}</td></tr>` : "";
  return `<table class="itens"><tbody>
    ${linha("Código SEINFRA", s.codigo)}${linha("Situação", s.situacao)}${linha("Revestimento", s.revestimento)}
    ${linha("Rodovia ou estrada de acesso", s.acesso)}${linha("Ponto de referência", s.referencia)}
    ${linha("Extensão no cadastro", s.extensao_km != null ? `${fmt(s.extensao_km, 2)} km` : null)}
    ${linha("Custo estimado", s.custo_estimado ? s.custo_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null)}
  </tbody></table>`;
}

function tabelaSetores(p) {
  const l = p.ev.setores || [];
  if (!l.length) return '<p class="nota">Nenhum setor censitário com moradores no raio de 2 km.</p>';
  const resto = (p.ev.n_setores || 0) - l.length;
  return `<table class="itens setores"><thead><tr><th>Setor (Censo 2022)</th><th>Situação</th><th class="n">Pessoas no setor</th>
    <th class="n">Domicílios no raio</th><th class="n">Pessoas no raio</th></tr></thead><tbody>
    ${l.map((s) => `<tr><td>${esc(s.setor)}</td><td>${esc(s.situacao)}</td><td class="n">${fmt(s.pessoas)}</td>
      <td class="n">${s.dom_cnefe_raio != null ? `${fmt(s.dom_cnefe_raio)} de ${fmt(s.dom_cnefe_setor)}` : "—"}</td>
      <td class="n">${fmt(s.pessoas_raio)}</td></tr>`).join("")}
    </tbody></table>
    <p class="nota">Pessoas no raio = pessoas do setor × fração dos domicílios do setor (endereços do CNEFE 2022) a até 2 km da via.
    Setor sem endereço no CNEFE usa a fração da área.${resto > 0 ? ` Mais ${fmt(resto)} setores com menos pessoas não listados.` : ""}</p>`;
}

function perfilSVG(alts) {
  if (!alts || alts.length < 2) return "";
  const min = Math.min(...alts), max = Math.max(...alts), h = 100, w = 400, amp = Math.max(max - min, 10);
  const pts = alts.map((a, i) => `${(i / (alts.length - 1)) * w},${h - 8 - ((a - min) / amp) * (h - 24)}`).join(" ");
  return `<svg class="perfil" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Perfil de altitude: ${fmt(min)} a ${fmt(max)} metros">
    <polygon points="0,${h} ${pts} ${w},${h}" fill="${cor("--p4")}" opacity=".6"/>
    <polyline points="${pts}" fill="none" stroke="${cor("--tinta")}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <text x="4" y="12" font-size="11" fill="${cor("--tinta-2")}">${fmt(max)} m</text>
    <text x="4" y="${h - 2}" font-size="11" fill="${cor("--tinta-2")}">${fmt(min)} m</text></svg>`;
}

function blocoCriterio(p, letra, total, maxi) {
  return `<div class="crit"><h4>${NOMES[letra]}</h4><span>${fmt(total, 1)} / ${maxi}</span></div>
    <table class="itens">${ITENS[letra].map(([c, r, e, est]) => linhaItem(p, c, r, e, est)).join("")}</table>`;
}

function desenharFicha() {
  const v = selecionada; if (!v) return;
  const p = v.p, n = v.n;
  $("#ficha-conteudo").innerHTML = `
    <h2 class="ficha-tit">${esc(p.nome)}</h2>
    <p class="ficha-sub">${esc(p.tipo)} · ${esc(p.municipio)} (${fmt(p.pop_mun || 0)} hab. em 2022) · ${fmt(p.km, 1)} km</p>
    ${dadosSeinfra(p)}
    <div class="placar"><span class="grande">${v.pos}º</span><span class="rot">de ${fmt(ordem.length)} vias no ranking geral</span>
      <span class="grande">${fmt(n.ip * 100, 1)}</span><span class="rot">índice de prioridade (0–100)<br>vulnerabilidade ${fmt(n.pv * 100, 1)} + desenvolvimento ${fmt(n.pd * 100, 1)} + facilidade ${fmt(n.pf * 100, 1)} + REGIC ${fmt(n.pr * 100, 1)}</span></div>
    <div class="acoes"><button class="primario" id="btn-rel">Relatório desta via</button><button id="btn-zoom">Aproximar no mapa</button>
      ${ajustes[p.id] ? '<button id="btn-desfazer">Desfazer ajustes desta via</button>' : ""}</div>
    ${subAbas([["notas", "Notas e evidências"], ["porque", "Por que esta posição"]])}
    <div data-subpainel="porque" ${subFicha === "porque" ? "" : "hidden"}>${porQue(v)}</div>
    <div data-subpainel="notas" ${subFicha === "notas" ? "" : "hidden"}>
    ${blocoCriterio(p, "V", n.V, 5)}
    ${blocoCriterio(p, "D", n.D, 10)}
    ${blocoCriterio(p, "F", n.F, 10)}
    <div class="crit"><h4>População por setor censitário</h4><span>${fmt(p.pop)} pessoas</span></div>${tabelaSetores(p)}
    <div class="crit"><h4>Perfil de altitude</h4><span></span></div>${perfilSVG(p.ev.perfil) || '<p class="nota">Sem dado de altitude.</p>'}
    <p class="nota">Traçado: ${esc(p.ev.fonte_tracado)} (${fmt(p.ev.trechos)} ${p.ev.trechos === 1 ? "trecho" : "trechos"}). Corrija as notas acima após a vistoria de campo.</p></div>`;
}

function subAbas(lista) {
  return `<div class="subabas" role="tablist">${lista.map(([k, r]) => `<button role="tab" data-sub="${k}" aria-selected="${subFicha === k}">${r}</button>`).join("")}</div>`;
}

const ESCALA = ["n_pop", "n_sub", "dif.relevo", "dif.terreno", "dif.oae"];
function ipCom(v, chave, val) { // índice da via se um item tivesse outro valor
  const antes = ajustes[v.p.id];
  ajustes[v.p.id] = { ...(antes || {}), [chave]: val };
  const ip = notas(v.p).ip;
  if (antes) ajustes[v.p.id] = antes; else delete ajustes[v.p.id];
  return ip;
}
const posicaoCom = (v, ip) => 1 + ordem.filter((x) => x !== v && x.n.ip > ip).length;
// texto da diferença entre duas posições vizinhas: onde esta ganha e onde perde
function compara(n, o, partes, det, desempate) {
  const d = Math.abs(o.n.ip - n.ip) * 100;
  if (d < 0.005) return `Mesmo índice; a ordem vem de ${desempate}.`;
  const dif = Object.keys(partes).map((c) => [c, n[c] - o.n[c]]);
  const ganha = dif.filter((x) => x[1] > 1e-6).sort((a, b) => b[1] - a[1])[0], perde = dif.filter((x) => x[1] < -1e-6).sort((a, b) => a[1] - b[1])[0];
  return `Diferença de ${fmt(d, d < 0.1 ? 2 : 1)} ponto.${ganha ? ` Esta leva vantagem em ${partes[ganha[0]]} (${det(ganha[0])})` : ""}${
    perde ? `${ganha ? " e" : ""} fica atrás em ${partes[perde[0]]} (${det(perde[0])})` : ""}.`;
}
const lista = (xs) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join("; ") + " e " + xs[xs.length - 1];

function porQue(v) {
  const p = v.p, n = v.n, N = ordem.length, k = 1 - RPESO;
  const med = (f) => ordem.reduce((s, x) => s + f(x), 0) / N;
  const com = (letra) => ITENS[letra].filter(([c]) => valor(p, c) > 0).map(([c, r]) => esc(r) + (ESCALA.includes(c) ? ` (nota ${valor(p, c)})` : ""));
  const sem = (letra) => ITENS[letra].filter(([c]) => valor(p, c) === 0).map(([, r]) => esc(r));
  const rel = (a, m) => a > m + 0.05 ? "acima da média" : a < m - 0.05 ? "abaixo da média" : "na média";
  const empate = ordem.filter((x) => Math.abs(x.n.ip - n.ip) < 5e-5).length - 1;
  const m = REGIC[p.cod_mun];
  const partes = { pv: "vulnerabilidade", pd: "desenvolvimento", pf: "facilidade de execução", pr: "importância REGIC do município" };
  const det = (c, o) => ({ pv: `V ${fmt(n.V)} contra ${fmt(o.n.V)}`, pd: `D ${fmt(n.D, 1)} contra ${fmt(o.n.D, 1)}`,
    pf: `F ${fmt(n.F)} contra ${fmt(o.n.F)}, onde menos é melhor`, pr: `REGIC ${fmt(n.R, 2)} contra ${fmt(o.n.R, 2)}` }[c]);
  const vizinho = (o, acima) => o ? `<li>${acima ? "Logo acima" : "Logo abaixo"}: <b>${esc(o.p.nome)}</b> (${o.pos}º, ${esc(o.p.municipio)}, índice ${fmt(o.n.ip * 100, 1)}).
    ${compara(n, o, partes, (c) => det(c, o), "a população do entorno")}</li>` : "";
  const sens = ITENS.V.concat(ITENS.D, ITENS.F).filter(([, , , est]) => est).map(([c, r, escala]) => {
    const atual = valor(p, c), alt = atual > escala[0] ? escala[0] : escala[escala.length - 1], nova = posicaoCom(v, ipCom(v, c, alt));
    return nova === v.pos ? "" : `<li>Se a vistoria indicar “${esc(r)}” = ${alt} (hoje ${atual}), a via vai para o <b>${nova}º</b> lugar.</li>`;
  }).filter(Boolean);
  return `<div class="porque">
    <p><b>${esc(p.nome)}</b> ficou em <b>${v.pos}º de ${fmt(N)}</b>, com índice ${fmt(n.ip * 100, 1)} de 100. Está à frente de ${fmt(N - v.pos)} vias (${fmt(100 * (N - v.pos) / N)} % do total).
    ${empate > 0 ? `Tem o mesmo índice que ${empate === 1 ? "outra via" : `outras ${fmt(empate)} vias`}; no empate passa à frente quem tem mais gente no entorno de 2 km (aqui, ${fmt(p.pop)} pessoas).` : ""}</p>
    <h4>Vulnerabilidade de transporte: ${fmt(n.V)} de 5, ${rel(n.V, med((x) => x.n.V))} (${fmt(med((x) => x.n.V), 1)})</h4>
    <p>É o critério de maior peso (${fmt(k * W.V * 100)} % do índice) e somou ${fmt(n.pv * 100, 1)} pontos.
    ${com("V").length ? `Contaram ponto: ${lista(com("V"))}.` : "Nenhuma deficiência de transporte foi marcada."}
    ${sem("V").length ? ` Não contaram: ${lista(sem("V"))}.` : ""}</p>
    <h4>Desenvolvimento local: ${fmt(n.D, 1)} de 10, ${rel(n.D, med((x) => x.n.D))} (${fmt(med((x) => x.n.D), 1)})</h4>
    <p>Somou ${fmt(n.pd * 100, 1)} pontos (peso ${fmt(k * W.D * 100)} %). Uso do solo ${fmt(n.uso)} de 5${n.uso ? `: ${lista(com("D").filter((t) => !t.startsWith("Nota")))}` : ""}.
    Ocupação ${fmt(n.ocup, 1)} de 5: ${fmt(p.pop)} pessoas a até 2 km (nota ${valor(p, "n_pop")}) e ${fmt(p.juncoes)} ${p.juncoes === 1 ? "entroncamento" : "entroncamentos"} (nota ${valor(p, "n_sub")}).</p>
    <h4>Dificuldade de projeto e execução: ${fmt(n.F)} de 10, ${rel(n.F, med((x) => x.n.F))} (${fmt(med((x) => x.n.F), 1)})</h4>
    <p>Quanto mais difícil, menor a prioridade. A facilidade somou ${fmt(n.pf * 100, 1)} pontos (peso ${fmt(k * W.F * 100)} %).
    ${com("F").length ? `Pesaram contra: ${lista(com("F"))}.` : "Nenhum fator de dificuldade foi marcado."}</p>
    <h4>Município na rede urbana (REGIC 2018)</h4>
    <p>${m ? `${esc(m.nome)} é <b>${esc(m.hierarquia)}</b> e se liga a ${esc(m.regiao_imediata)}. Importância REGIC ${fmt(n.R, 2)} de 1; com peso de ${fmt(RPESO * 100)} % isso somou ${fmt(n.pr * 100, 1)} pontos.` :
      "Sem dado do REGIC para o município."}</p>
    <h4>Comparação com as vizinhas no ranking</h4>
    <ul>${vizinho(ordem[v.pos - 2], true)}${vizinho(ordem[v.pos], false)}</ul>
    ${sens.length ? `<h4>O que pode mudar a posição</h4><p>Itens estimados a partir de bases públicas, a confirmar em campo:</p><ul>${sens.join("")}</ul>` : ""}
  </div>`;
}

function selecionar(v, zoom = true) {
  selecionada = v;
  $("#ficha").hidden = false;
  desenharFicha();
  desenharLista();
  estilizarMapa();
  mapa.invalidateSize();
  if (zoom) mapa.fitBounds(v.layer.getBounds(), { maxZoom: 13, padding: [30, 30] });
  history.replaceState(null, "", "#via-" + v.p.id);
}

function abrirPorHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith("via-")) { const v = VIAS.find((x) => x.p.id === h.slice(4)); if (v) selecionar(v); }
}

/* ---------- pesos ---------- */
const SAATY = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9];
function montarPares() {
  const defs = [["vd", "V", "D"], ["vf", "V", "F"], ["df", "D", "F"]];
  $("#pares").innerHTML = defs.map(([k, a, b]) => `<div class="par"><label for="par-${k}">${NOMES[a]} × ${NOMES[b]}</label>
    <select id="par-${k}" data-par="${k}">${SAATY.map((s) => `<option value="${s}" ${Math.abs(s - pares[k]) < 1e-9 ? "selected" : ""}>${
      s === 1 ? "Igual importância (1)" : s > 1 ? `${NOMES[a]} mais importante (${s})` : `${NOMES[b]} mais importante (${Math.round(1 / s)})`}</option>`).join("")}</select></div>`).join("");
  desenharPesos();
}
function desenharPesos() {
  const r = ahp();
  $("#rpeso").value = Math.round(RPESO * 100);
  $("#rpeso-val").textContent = `${fmt(RPESO * 100)} %`;
  $("#tab-pesos").innerHTML = ["V", "D", "F"].map((k) => `<tr><td>${NOMES[k]}</td><td>${fmt(r.w[k], 3)}</td></tr>`).join("");
  const ok = r.CR < 0.1;
  $("#cr").className = "cr" + (ok ? "" : " ruim");
  $("#cr").textContent = `λmáx ${fmt(r.lmax, 4)} · IC ${fmt(r.CI, 4)} · RC ${fmt(r.CR, 4)} — ${ok ? "julgamentos consistentes (RC < 0,10)" : "inconsistente: RC ≥ 0,10. Revise as comparações; o ranking segue com os últimos pesos consistentes."}`;
  return ok;
}

/* ---------- relatórios ---------- */
const FONTES = `SEINFRA-AM — traçado dos ramais e vicinais (REV06, 16/05/2025);
  IBGE — malha municipal, população 2022 (SIDRA 4709), setores censitários e agregados por setor do Censo 2022,
  CNEFE 2022 (domicílios, escolas, saúde e estabelecimentos agropecuários), BC250 (hidrografia e pontes);
  Ministério da Saúde — CNES (estabelecimentos de saúde);
  INPE TerraBrasilis — unidades de conservação e terras indígenas da Amazônia Legal; IPHAN — sítios arqueológicos (SICG);
  OpenStreetMap — rodovias estaduais, aeroportos, portos, comunidades e uso do solo;
  OpenTopoData / NASA SRTM 90 m — altitude.`;

function abrirRelatorio(html, depois) {
  $("#rel-conteudo").innerHTML = html;
  $("#relatorio").hidden = false;
  $("#relatorio").scrollTop = 0;
  if (depois) depois();
}

function relatorioVia(v) {
  const p = v.p, n = v.n, r = ahp();
  const tabela = (letra) => `<table><thead><tr><th>Item</th><th class="n">Nota</th></tr></thead><tbody>${ITENS[letra].map(([c, rot, , est]) =>
    `<tr><td>${esc(rot)}${est ? " (estimativa)" : ""}${valor(p, c) !== auto(p, c) ? " — ajustado em campo" : ""}${evidencia(p, c)}</td><td class="n">${valor(p, c)}</td></tr>`).join("")}</tbody></table>`;
  abrirRelatorio(`
    <h1>${esc(p.nome)}</h1>
    <p class="cab">${esc(p.tipo)} · ${esc(p.municipio)}/AM · ${fmt(p.km, 1)} km · relatório gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
    <table><tbody>
      <tr><td>Posição no ranking geral</td><td class="n"><b>${v.pos}º de ${fmt(ordem.length)}</b></td></tr>
      <tr><td>Índice de prioridade (0–100)</td><td class="n"><b>${fmt(n.ip * 100, 1)}</b></td></tr>
      <tr><td>População do município (Censo 2022)</td><td class="n">${fmt(p.pop_mun || 0)}</td></tr>
      <tr><td>População estimada no entorno de 2 km (setores do Censo 2022)</td><td class="n">${fmt(p.pop)}</td></tr>
    </tbody></table>
    ${dadosSeinfra(p)}
    <div class="rel-mapa" id="rel-mapa"></div>
    <h2>Por que esta posição</h2>${porQue(v)}
    <h2>Vulnerabilidade de transporte — ${fmt(n.V)} de 5</h2>${tabela("V")}
    <h2>Desenvolvimento local — ${fmt(n.D, 1)} de 10</h2>${tabela("D")}
    <h2>Dificuldade de projeto e execução — ${fmt(n.F)} de 10</h2>${tabela("F")}
    <h2>População por setor censitário (raio de 2 km)</h2>${tabelaSetores(p)}
    <h2>Perfil de altitude</h2>${perfilSVG(p.ev.perfil)}
    <h2>Memória de cálculo</h2>
    <table><tbody>
      <tr><td>Pesos AHP (V / D / F)</td><td class="n">${fmt(W.V, 3)} / ${fmt(W.D, 3)} / ${fmt(W.F, 3)}</td></tr>
      <tr><td>Consistência (RC)</td><td class="n">${fmt(r.CR, 4)}</td></tr>
      <tr><td>Vulnerabilidade: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.V, 3)} × ${fmt(n.V)}/5</td><td class="n">${fmt(n.pv, 4)}</td></tr>
      <tr><td>Desenvolvimento: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.D, 3)} × ${fmt(n.D, 1)}/10</td><td class="n">${fmt(n.pd, 4)}</td></tr>
      <tr><td>Facilidade: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.F, 3)} × (1 − ${fmt(n.F)}/10)</td><td class="n">${fmt(n.pf, 4)}</td></tr>
      <tr><td>REGIC: ${fmt(RPESO, 2)} × importância do município ${fmt(n.R, 3)}</td><td class="n">${fmt(n.pr, 4)}</td></tr>
      <tr><td><b>Índice de prioridade</b></td><td class="n"><b>${fmt(n.ip, 4)}</b></td></tr>
    </tbody></table>
    <p class="rel-rodape">Método: análise multicritério AHP (Saaty), conforme o artigo “Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério” (UNINORTE, 2023), com dificuldade tratada como critério de custo. Notas marcadas como estimativa devem ser confirmadas em vistoria de campo.<br>Fontes: ${FONTES}</p>`,
  () => {
    const m = L.map("rel-mapa", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo }).addTo(m);
    const g = L.geoJSON(v.layer.toGeoJSON(), { style: { color: cor("--p1"), weight: 5 } }).addTo(m);
    m.fitBounds(g.getBounds(), { padding: [20, 20], maxZoom: 13 });
  });
}

function relatorioGeral() {
  const linhas = filtradas.slice(0, 100);
  abrirRelatorio(`
    <h1>Ranking de priorização de obras viárias</h1>
    <p class="cab">Amazonas · ${fmt(filtradas.length)} vias no filtro atual · gerado em ${new Date().toLocaleDateString("pt-BR")} · pesos V ${fmt(W.V, 3)} / D ${fmt(W.D, 3)} / F ${fmt(W.F, 3)} (RC ${fmt(CR, 4)})</p>
    <div class="rel-mapa" id="rel-mapa"></div>
    <table><thead><tr><th class="n">Pos.</th><th>Via</th><th>Município</th><th class="n">km</th><th class="n">V</th><th class="n">D</th><th class="n">F</th><th class="n">Índice</th></tr></thead><tbody>
    ${linhas.map((v) => `<tr><td class="n">${v.pos}</td><td>${esc(v.p.nome)}<br><small>${esc(v.p.tipo)}</small></td><td>${esc(v.p.municipio)}</td><td class="n">${fmt(v.p.km, 1)}</td>
      <td class="n">${fmt(v.n.V)}</td><td class="n">${fmt(v.n.D, 1)}</td><td class="n">${fmt(v.n.F)}</td><td class="n"><b>${fmt(v.n.ip * 100, 1)}</b></td></tr>`).join("")}
    </tbody></table>
    ${filtradas.length > 100 ? `<p class="nota">Mostrando as 100 primeiras de ${fmt(filtradas.length)}.</p>` : ""}
    <p class="rel-rodape">V = vulnerabilidade de transporte (0–5); D = desenvolvimento local (0–10); F = dificuldade de projeto e execução (0–10, reduz a prioridade); R = importância do município no REGIC 2018 (0–1). Índice = (1 − r)·[w<sub>V</sub>·V/5 + w<sub>D</sub>·D/10 + w<sub>F</sub>·(1 − F/10)] + r·R, com r = ${fmt(RPESO, 2)}, em escala 0–100.<br>Fontes: ${FONTES}</p>`,
  () => {
    const m = L.map("rel-mapa", { zoomControl: false });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo }).addTo(m);
    const top = linhas.slice(0, 20);
    const g = L.featureGroup(top.map((v) => L.geoJSON(v.layer.toGeoJSON(), { style: { color: cor("--p1"), weight: 4 } })
      .bindTooltip(`${v.pos}º ${v.p.nome}`, { permanent: v.pos <= 5, direction: "top" }))).addTo(m);
    if (top.length) m.fitBounds(g.getBounds(), { padding: [20, 20] });
  });
}

function baixar(nome, texto, tipo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- eventos ---------- */
document.querySelectorAll(".abas button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".abas button").forEach((x) => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll(".aba").forEach((s) => (s.hidden = s.id !== "aba-" + b.dataset.aba));
}));
["#busca", "#f-mun", "#f-ramal", "#f-rodovia"].forEach((s) => $(s).addEventListener("input", () => { limite = 60; filtrar(); }));
$("#lista").addEventListener("click", (e) => {
  if (e.target.id === "btn-mais") { limite += 60; return desenharLista(); }
  const li = e.target.closest("li[data-id]"); if (li) selecionar(VIAS.find((v) => v.p.id === li.dataset.id));
});
$("#lista").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.id) e.target.click(); });
$("#pares").addEventListener("change", (e) => {
  const k = e.target.dataset.par; if (!k) return;
  pares[k] = Number(e.target.value);
  guardar("pares", pares);
  if (desenharPesos()) { recalcular(); desenharFicha(); }
});
$("#rpeso").addEventListener("input", (e) => {
  RPESO = Number(e.target.value) / 100; guardar("rpeso", RPESO);
  $("#rpeso-val").textContent = `${fmt(RPESO * 100)} %`; recalcular(); desenharFicha();
});
$("#ficha").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sub]"); if (!b) return;
  subFicha = b.dataset.sub;
  b.parentElement.querySelectorAll("[data-sub]").forEach((x) => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll("#ficha [data-subpainel]").forEach((s) => (s.hidden = s.dataset.subpainel !== subFicha));
});
$("#btn-reset-pesos").addEventListener("click", () => { pares = { ...PADRAO }; guardar("pares", pares); montarPares(); recalcular(); desenharFicha(); });
document.querySelectorAll("[name=fundo]").forEach((r) => r.addEventListener("change", () => {
  mapa.removeLayer(fundo); fundo = fundos[r.value].addTo(mapa);
}));
document.querySelectorAll("[data-camada]").forEach((c) => c.addEventListener("change", () => alternarCamada(c.dataset.camada, c.checked)));
$("#fechar-ficha").addEventListener("click", () => { selecionada = null; $("#ficha").hidden = true; estilizarMapa(); desenharLista(); mapa.invalidateSize(); history.replaceState(null, "", location.pathname); });
$("#ficha").addEventListener("change", (e) => {
  const c = e.target.dataset.chave; if (!c || !selecionada) return;
  const p = selecionada.p, val = Number(e.target.value);
  ajustes[p.id] = ajustes[p.id] || {};
  if (val === auto(p, c)) delete ajustes[p.id][c]; else ajustes[p.id][c] = val;
  if (!Object.keys(ajustes[p.id]).length) delete ajustes[p.id];
  guardar("ajustes", ajustes); recalcular(); desenharFicha();
});
$("#ficha").addEventListener("click", (e) => {
  if (e.target.id === "btn-rel") relatorioVia(selecionada);
  if (e.target.id === "btn-zoom") mapa.fitBounds(selecionada.layer.getBounds(), { maxZoom: 14, padding: [30, 30] });
  if (e.target.id === "btn-desfazer") { delete ajustes[selecionada.p.id]; guardar("ajustes", ajustes); recalcular(); desenharFicha(); }
});
$("#btn-rel-geral").addEventListener("click", relatorioGeral);
$("#rel-voltar").addEventListener("click", () => { $("#relatorio").hidden = true; });
$("#rel-imprimir").addEventListener("click", () => window.print());
$("#btn-csv").addEventListener("click", () => {
  const cab = "posicao;tipo;nome;municipio;km;vulnerabilidade;desenvolvimento;dificuldade;indice\n";
  baixar("ranking_priorizacao_am.csv", "﻿" + cab + filtradas.map((v) => [v.pos, v.p.tipo, `"${v.p.nome}"`, v.p.municipio, fmt(v.p.km, 2), v.n.V, fmt(v.n.D, 1), v.n.F, fmt(v.n.ip * 100, 2)].join(";")).join("\n"), "text/csv");
});
$("#btn-export").addEventListener("click", () => baixar("ajustes_campo.json", JSON.stringify(ajustes, null, 1), "application/json"));
$("#imp").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const novo = JSON.parse(await f.text()); if (typeof novo !== "object" || Array.isArray(novo)) throw 0; ajustes = { ...ajustes, ...novo }; guardar("ajustes", ajustes); recalcular(); desenharFicha(); }
  catch (_) { $("#cr").textContent = "Arquivo de ajustes inválido: use um JSON exportado por esta plataforma."; }
});
$("#btn-limpar").addEventListener("click", () => { ajustes = {}; guardar("ajustes", ajustes); recalcular(); desenharFicha(); });
window.addEventListener("hashchange", abrirPorHash);

const PRONTO = iniciar();
