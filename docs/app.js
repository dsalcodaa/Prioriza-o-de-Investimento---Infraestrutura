/* Plataforma de priorização de obras viárias — Amazonas
   Modelo: TCC UNINORTE 2023 (AHP) com as correções da revisão (ver aba Método). */
"use strict";

const NOMES = { V: "Vulnerabilidade de transporte", D: "Desenvolvimento local", F: "Dificuldade de projeto e execução" };
const PADRAO = { vd: 3, vf: 5, df: 2 }; // matriz do artigo → 0,648 / 0,230 / 0,122
const RI3 = 0.58;

// Itens de cada critério: chave, rótulo, escala (opções), se é estimativa a confirmar em campo
const ITENS = {
  D: [
    ["uso.comunidade", "Comunidade ou localidade a até 2 km", [0, 1]],
    ["uso.assentamento", "Assentamento rural (identificação indireta)", [0, 1], true],
    ["uso.agricola", "Atividade agropecuária a até 1 km", [0, 1], true],
    ["uso.turismo", "Atividade turística a até 2 km", [0, 1]],
    ["uso.industrial", "Atividade extrativista ou industrial a até 2 km", [0, 1]],
    ["n_pop", "População estimada no entorno de 2 km", [1, 2, 3, 4, 5], true],
    ["n_sub", "Entroncamentos com outras vias", [1, 2, 3, 4, 5]],
  ],
  V: [
    ["vul.sem_intermodal", "Ausência de porto ou aeroporto a até 10 km", [0, 1]],
    ["vul.sem_rota_alternativa", "Ausência de rota terrestre alternativa", [0, 1]],
    ["vul.trafegabilidade_ruim", "Predomínio de trechos sem pavimento", [0, 1], true],
    ["vul.infra_acesso_deficiente", "Travessia sem ponte registrada ou com ponte de madeira", [0, 1], true],
    ["vul.sem_servicos_publicos", "Ausência de escola e de unidade de saúde a até 2 km", [0, 1]],
  ],
  F: [
    ["dif.relevo", "Relevo (altitude média)", [1, 2, 3]],
    ["dif.terreno", "Tipo de terreno", [0, 1, 2], true],
    ["dif.uc", "Unidade de conservação", [0, 1]],
    ["dif.sitio", "Sítio arqueológico a até 1 km", [0, 1]],
    ["dif.ti", "Terra indígena", [0, 1]],
    ["dif.oae", "Obras de arte especiais (pontes)", [0, 1, 2, 3], true],
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
  desenharMetodo();
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
  $("#resumo").textContent = `${fmt(filtradas.length)} vias${filtro ? ` de ${fmt(ordem.length)}` : ""}. O número à esquerda é a posição no ranking estadual; o valor à direita, o índice de prioridade (0 a 100); a barra mostra a contribuição de cada critério.`;
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

/* ---------- ficha: textos a partir da base editorial (textos.js) ---------- */
const plural = (n, s, p) => `${fmt(n)} ${n === 1 ? s : p}`;
const NADA = "Não foram identificados registros nas bases consultadas.";
const parteIndice = (l) => (l === "R" ? RPESO : (1 - RPESO) * W[l]); // fração do índice que o critério pode somar
const PREMISSA = { rev: ["vul.trafegabilidade_ruim"], ponte: ["vul.infra_acesso_deficiente", "dif.oae"] };
const vistoriado = (p, c) => Object.entries(ajustes[p.id]?._vist || {}).some(([k, x]) => x && PREMISSA[k].includes(c));
const origemDe = (p, c) => (valor(p, c) !== auto(p, c) || vistoriado(p, c) ? "campo" : p.seinfra && Object.values(PREMISSA).flat().includes(c) ? "prem" : IND[c].origem);
function selo(p, c) {
  const o = origemDe(p, c), [r, t] = ORIGEM[o];
  return `<span class="origem o-${o}" title="${esc(t)}">${r}</span>`;
}
function leituraItem(p, c) {
  const d = IND[c], v = valor(p, c);
  return d.esc ? `Nota ${v}: ${d.esc[v]}.` : v ? d.i : d.n;
}
const RE_ASSENT = /assentamento|\bp\.?\s?a\.?\b|\bpds\b|\bpaex\b/i;
function alertaAssentamento(p) { // registros sem termo de assentamento no nome: possível associação indevida
  if (!valor(p, "uso.assentamento")) return "";
  const l = (p.ev.assentamentos || []).filter((x) => !RE_ASSENT.test(x.nome));
  return l.length ? `Possível inconsistência: o registro ${l.map((x) => `“${x.nome}”`).join(", ")}, associado ao indicador de assentamento rural, não contém referência explícita a assentamento. A origem do dado deve ser investigada antes do uso desta nota.` : "";
}

function nomes(lista) {
  return (lista || []).map((x) => `${x.nome && x.nome !== "(sem nome)" ? x.nome : "localidade sem denominação"} (${fmt(x.dist_km, 1)} km)`).join("; ");
}
function evidencia(p, chave) {
  const e = p.ev, reg = (l, txt) => (l && l.length ? `${txt}: ${nomes(l)}.` : NADA);
  const rios = e.travessias - (e.igarapes ?? 0);
  switch (chave) {
    case "uso.comunidade": return reg(e.comunidades, "Localidades registradas e distância ao traçado");
    case "uso.assentamento": return reg(e.assentamentos, "Registro associado");
    case "uso.agricola": return reg(e.agricola, "Registros e distância ao traçado");
    case "uso.turismo": return reg(e.turismo, "Registros e distância ao traçado");
    case "uso.industrial": return reg(e.industrial, "Registros e distância ao traçado");
    case "n_pop": return p.pop ? `Estimativa de ${fmt(p.pop)} pessoas e ${fmt(p.dom)} domicílios na faixa de 2 km, a partir de ${plural(e.n_setores || 0, "setor censitário", "setores censitários")} (detalhados na tabela de população por setor).` : "Não foram identificados setores censitários com moradores na faixa de 2 km.";
    case "n_sub": return p.juncoes ? `${plural(p.juncoes, "entroncamento identificado", "entroncamentos identificados")} com outras vias.` : "Não foram identificados entroncamentos com outras vias.";
    case "vul.sem_intermodal": return reg([...(e.aeroportos || []), ...(e.portos || [])], "Pontos registrados") === NADA ? "Não foram identificados portos, terminais, aeroportos ou pistas de pouso a até 10 km nas bases consultadas." : reg([...(e.aeroportos || []), ...(e.portos || [])], "Pontos registrados");
    case "vul.sem_rota_alternativa": return !p.juncoes ? "Não foram identificados entroncamentos com outras vias." : p.vul.sem_rota_alternativa ? "Os entroncamentos identificados estão concentrados em um raio de 1 km." : "Os entroncamentos identificados estão distribuídos em pontos distintos do traçado.";
    case "vul.trafegabilidade_ruim": return `${fmt(e.frac_nao_pavimentada * 100)} % da extensão sem revestimento pavimentado. Revestimento registrado: ${e.superficies.join(", ")}.`;
    case "vul.infra_acesso_deficiente": return !e.travessias ? "Não foram identificados cruzamentos com cursos d'água na hidrografia do IBGE (BC250)." :
      `${plural(e.travessias, "cruzamento", "cruzamentos")} com cursos d'água, dos quais ${plural(e.igarapes ?? 0, "igarapé de menor porte", "igarapés de menor porte")}; ${plural(e.sem_ponte, "rio sem ponte registrada", "rios sem ponte registrada")}; ${plural(e.pontes_madeira, "ponte de madeira", "pontes de madeira")}.${e.rios.length ? ` Rios cruzados: ${e.rios.join(", ")}.` : ""}`;
    case "vul.sem_servicos_publicos": return e.servicos && e.servicos.length ? `Estabelecimentos registrados e distância ao traçado: ${nomes(e.servicos)}.` : "Não foram identificados registros de escolas nem de estabelecimentos de saúde a até 2 km nas bases consultadas.";
    case "dif.relevo": return e.alt_min != null ? `Altitude média de ${fmt(e.alt_media)} m, com mínima de ${fmt(e.alt_min)} m e máxima de ${fmt(e.alt_max)} m ao longo do traçado.` : "Não há dado de altitude para o traçado.";
    case "dif.terreno": return (e.alagados ? `${plural(e.alagados, "área alagável mapeada", "áreas alagáveis mapeadas")} a até 500 m.` : "Não foram identificadas áreas alagáveis mapeadas a até 500 m.") +
      (auto(p, "dif.terreno") === 1 && !e.alagados ? " A classificação como várzea decorre da altitude média igual ou inferior a 30 m com rio a até 2 km." : "");
    case "dif.uc": return (e.ucs || []).length ? `Unidade interceptada: ${e.ucs.join("; ")}.` : "O traçado não intercepta unidades de conservação registradas.";
    case "dif.ti": return (e.tis || []).length ? `Terra indígena interceptada: ${e.tis.join("; ")}.` : "O traçado não intercepta terras indígenas registradas.";
    case "dif.sitio": return reg(e.sitios, "Sítios cadastrados e distância ao traçado");
    case "dif.oae": return rios ? `${plural(rios, "travessia de rio", "travessias de rio")}: ${plural(e.sem_ponte, "sem ponte registrada", "sem ponte registrada")} e ${plural(e.pontes_madeira, "com ponte de madeira", "com ponte de madeira")} (IBGE BC250 e OpenStreetMap).` : "Não foram identificadas travessias de rio.";
  }
  return "";
}

function linhaItem(p, chave, rot, escala) {
  const v = valor(p, chave), a = auto(p, chave), aj = v !== a, alerta = chave === "uso.assentamento" ? alertaAssentamento(p) : "";
  const opts = escala.map((o) => `<option value="${o}" ${o === v ? "selected" : ""}>${o}</option>`).join("");
  return `<tr class="${aj ? "ajustado" : ""}"><td><b class="ind">${esc(rot)}</b> ${selo(p, chave)}${aj ? ` <span class="estim">valor calculado: ${a}</span>` : ""}
    <span class="ev">${esc(evidencia(p, chave))}</span><span class="leit">${esc(leituraItem(p, chave))}</span>${alerta ? `<span class="alerta">${esc(alerta)}</span>` : ""}
    <details class="desc"><summary>O que este indicador mede</summary>${esc(IND[chave].o)}</details></td>
    <td class="n"><select data-chave="${chave}" aria-label="${esc(rot)}">${opts}</select></td></tr>`;
}

function introCriterio(l, aberto) {
  const c = CRIT[l], parte = `Na configuração atual, o critério pode contribuir com até ${fmt(parteIndice(l) * 100, 1)} dos 100 pontos do índice.`;
  const corpo = `<p>${c.avalia}</p><p>${c.finalidade}</p><p>${c.calculo} ${parte}</p><p>${c.leitura}</p>`;
  return aberto ? `<div class="intro-crit">${corpo}</div>` : `<details class="intro-crit"><summary>Sobre este critério</summary>${corpo}</details>`;
}

function dadosSeinfra(p) {
  const s = p.seinfra; if (!s) return "";
  const linha = (r, v) => v != null && v !== "" ? `<tr><td>${r}</td><td class="n">${esc(v)}</td></tr>` : "";
  return `<table class="itens"><tbody>
    ${linha("Código SEINFRA", s.codigo)}${linha("Situação no cadastro", s.situacao)}${linha("Revestimento", s.revestimento)}
    ${linha("Rodovia ou estrada de acesso", s.acesso)}${linha("Ponto de referência", s.referencia)}
    ${linha("Extensão no cadastro", s.extensao_km != null ? `${fmt(s.extensao_km, 2)} km` : null)}
    ${linha("Obra registrada (coluna Situação)", s.obra != null ? (s.obra ? `Sim${s.contrato ? `, ${s.contrato}` : ""}` : "Não") : null)}
    ${linha("Custo estimado (cadastro)", s.custo_estimado ? s.custo_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null)}
  </tbody></table>${s.custo_estimado ? `<p class="nota">${NOTA_CUSTO}</p>` : ""}`;
}
const NOTA_CUSTO = "O custo estimado é o valor informado no cadastro da SEINFRA-AM e serve como referência orçamentária preliminar. Ele não integra o índice de prioridade. A plataforma não dispõe da data-base nem da composição desse valor.";

function tabelaSetores(p) {
  const l = p.ev.setores || [];
  if (!l.length) return '<p class="nota">Não foram identificados setores censitários com moradores na faixa de 2 km.</p>';
  const resto = (p.ev.n_setores || 0) - l.length;
  return `<table class="itens setores"><thead><tr><th>Setor censitário (Censo 2022)</th><th>Situação</th><th class="n">Pessoas no setor</th>
    <th class="n">Domicílios na faixa</th><th class="n">Pessoas estimadas na faixa</th></tr></thead><tbody>
    ${l.map((s) => `<tr><td>${esc(s.setor)}</td><td>${esc(s.situacao)}</td><td class="n">${fmt(s.pessoas)}</td>
      <td class="n">${s.dom_cnefe_raio != null ? `${fmt(s.dom_cnefe_raio)} de ${fmt(s.dom_cnefe_setor)}` : "—"}</td>
      <td class="n">${fmt(s.pessoas_raio)}</td></tr>`).join("")}
    </tbody></table>
    <p class="nota">Setores censitários são as menores unidades territoriais de coleta do Censo do IBGE. A população estimada na faixa de 2 km é a população do setor multiplicada pela fração de seus domicílios (endereços do CNEFE 2022) situados dentro da faixa. Para setores sem endereço no CNEFE, usa-se a fração da área.${resto > 0 ? ` Outros ${plural(resto, "setor com menos pessoas na faixa não está listado", "setores com menos pessoas na faixa não estão listados")}.` : ""}</p>`;
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
  return `<div class="crit"><h4>${NOMES[letra]}</h4><span>${fmt(total, letra === "D" ? 1 : 0)} de ${maxi}</span></div>
    ${introCriterio(letra, false)}
    <table class="itens">${ITENS[letra].map(([c, r, e]) => linhaItem(p, c, r, e)).join("")}</table>`;
}

/* ---------- textos de análise (ficha e relatório) ---------- */
const media = (f) => ordem.reduce((s, x) => s + f(x), 0) / ordem.length;
const relMedia = (a, m) => `${a > m + 0.05 ? "acima da" : a < m - 0.05 ? "abaixo da" : "em linha com a"} média das ${fmt(ordem.length)} vias avaliadas (${fmt(m, 1)})`;
const marcados = (p, l, f = () => true) => ITENS[l].filter(([c]) => f(c) && valor(p, c) > 0 && IND[c].s).map(([c]) => IND[c].s);
const contrib = (l, x) => `Com participação de ${fmt(parteIndice(l) * 100)} % na composição do índice, o critério contribuiu com ${fmt(x * 100, 1)} dos ${fmt(parteIndice(l) * 100, 1)} pontos possíveis.`;

function analiseV(v) {
  const p = v.p, n = v.n, s = marcados(p, "V"), nao = ITENS.V.filter(([c]) => !valor(p, c)).map(([, r]) => `“${r}”`);
  return `<p>A via obteve nota ${fmt(n.V)} de 5 no critério de vulnerabilidade de transporte, ${relMedia(n.V, media((x) => x.n.V))}.${n.V === 5 ? " Trata-se da pontuação máxima do critério." : ""}
    ${s.length ? `A análise identificou as seguintes condições: ${lista(s)}.` : "A análise não identificou condições desfavoráveis de acesso nas bases consultadas."}
    ${n.V >= 3 ? "Em conjunto, essas condições indicam acessibilidade e conectividade desfavoráveis e maior dependência logística da população servida em relação à via." : n.V > 0 ? "As condições identificadas indicam fragilidade parcial das condições de acesso." : ""}
    ${nao.length ? `${nao.length === 1 ? "O indicador" : "Os indicadores"} ${lista(nao)} não ${nao.length === 1 ? "pontuou" : "pontuaram"}.` : ""}
    ${contrib("V", n.pv)}</p>`;
}

function analiseD(v) {
  const p = v.p, n = v.n, s = marcados(p, "D"), vp = valor(p, "n_pop"), vs = valor(p, "n_sub"), al = alertaAssentamento(p);
  return `<p>No critério de desenvolvimento local, a via obteve nota ${fmt(n.D, 1)} de 10, ${relMedia(n.D, media((x) => x.n.D))}.
    A parcela de uso do solo somou ${fmt(n.uso)} de 5${s.length ? `, com identificação de ${lista(s)}` : "; não foram identificados registros de ocupação ou de atividade econômica no entorno nas bases consultadas"}.
    A parcela de nível de ocupação somou ${fmt(n.ocup, 1)} de 5. Ela corresponde à média entre a nota de população (${vp}, faixa de ${IND.n_pop.esc[vp]}, com ${fmt(p.pop)} pessoas estimadas na faixa de 2 km)
    e a nota de entroncamentos (${vs}, faixa de ${IND.n_sub.esc[vs]}, com ${plural(p.juncoes, "entroncamento identificado", "entroncamentos identificados")}).
    ${contrib("D", n.pd)}${al ? " A evidência associada ao indicador de assentamento rural apresenta possível inconsistência, detalhada na análise de sensibilidade e validação." : ""}</p>`;
}

function analiseF(v) {
  const p = v.p, n = v.n, f = [];
  f.push(`relevo com nota ${valor(p, "dif.relevo")} (${IND["dif.relevo"].esc[valor(p, "dif.relevo")]})`);
  if (valor(p, "dif.terreno")) f.push(`terreno classificado como ${IND["dif.terreno"].esc[valor(p, "dif.terreno")]}`);
  f.push(...marcados(p, "F", (c) => ["dif.uc", "dif.sitio", "dif.ti"].includes(c)));
  if (valor(p, "dif.oae")) f.push(`obras de arte especiais com nota ${valor(p, "dif.oae")} (${IND["dif.oae"].esc[valor(p, "dif.oae")]})`);
  const impl = ["dif.uc", "dif.sitio", "dif.ti"].filter((c) => valor(p, c)).map((c) => IND[c].i);
  return `<p>No critério de dificuldade de projeto e execução, a via obteve nota ${fmt(n.F)} de 10, ${relMedia(n.F, media((x) => x.n.F))}.
    Por se tratar de critério de custo, notas mais altas reduzem a prioridade. Os fatores que compuseram a nota foram: ${lista(f)}.
    ${impl.join(" ")} A parcela de facilidade de execução, calculada por (1 − ${fmt(n.F)}/10), contribuiu com ${fmt(n.pf * 100, 1)} dos ${fmt(parteIndice("F") * 100, 1)} pontos possíveis.</p>`;
}

function analiseR(v) {
  const n = v.n, m = REGIC[v.p.cod_mun];
  if (!m) return "<p>Não há dado do REGIC para o município. O componente foi considerado nulo.</p>";
  return `<p>${esc(m.nome)} é classificado no REGIC 2018 como ${esc(m.hierarquia)} e integra a região de influência de ${esc(m.regiao_imediata)}.
    A importância calculada para o município é ${fmt(n.R, 2)}, em escala de 0 a 1.
    ${RPESO ? `Com peso de ${fmt(RPESO * 100)} %, o componente contribuiu com ${fmt(n.pr * 100, 1)} pontos.` : "O peso do componente está definido como 0 % e não influencia o resultado."}
    Esse valor é comum a todas as vias de ${esc(m.nome)} e não as diferencia entre si.</p>`;
}

function sintese(v) {
  const p = v.p, n = v.n, N = ordem.length;
  const partes = [["a vulnerabilidade de transporte", n.pv], ["o desenvolvimento local", n.pd], ["a facilidade de execução", n.pf], ["a importância do município na rede urbana", n.pr]].sort((a, b) => b[1] - a[1]);
  const s = marcados(p, "V"), est = [...ITENS.V, ...ITENS.D, ...ITENS.F].filter(([c, , , e]) => e && valor(p, c) === auto(p, c)).length;
  return `A via <b>${esc(p.nome)}</b> (${esc(p.tipo.toLowerCase())} em ${esc(p.municipio)}, com ${fmt(p.km, 1)} km) ocupa a <b>${v.pos}ª posição</b> entre as ${fmt(N)} vias avaliadas,
    com índice de prioridade de <b>${fmt(n.ip * 100, 1)}</b> em escala de 0 a 100.
    O componente de maior contribuição foi ${partes[0][0]}, com ${fmt(partes[0][1] * 100, 1)} pontos (${fmt((100 * partes[0][1]) / n.ip)} % do índice); o segundo foi ${partes[1][0]}, com ${fmt(partes[1][1] * 100, 1)} pontos.
    ${s.length ? `No diagnóstico de transporte, a análise identificou as seguintes condições: ${lista(s)}.` : "No diagnóstico de transporte, não foram identificadas condições desfavoráveis de acesso nas bases consultadas."}
    ${n.F >= 4 ? `A nota de dificuldade de execução (${fmt(n.F)} de 10) reduziu a contribuição da facilidade de execução.` : ""}
    ${est ? `Dos indicadores considerados, ${est === 1 ? "um é estimativa e deve ser confirmado" : `${fmt(est)} são estimativas e devem ser confirmados`} em vistoria antes da decisão de investimento.` : ""}`;
}

// diferença entre duas vias vizinhas no ranking: onde esta tem vantagem e onde tem desvantagem
function compara(n, o, partes, det, desempate) {
  const d = Math.abs(o.n.ip - n.ip) * 100;
  if (d < 0.005) return `Os índices são iguais. A ordem entre as duas é definida pela regra de desempate: ${desempate}.`;
  const dif = Object.keys(partes).map((c) => [c, n[c] - o.n[c]]);
  const ganha = dif.filter((x) => x[1] > 1e-6).sort((a, b) => b[1] - a[1])[0], perde = dif.filter((x) => x[1] < -1e-6).sort((a, b) => a[1] - b[1])[0];
  const dt = fmt(d, d < 0.1 ? 2 : 1);
  return `A diferença de índice é de ${dt} ${dt === "1,0" ? "ponto" : "pontos"}${d < 1 ? ", inferior a 1 ponto na escala de 0 a 100. Diferenças dessa ordem não devem ser interpretadas isoladamente como distinção relevante de prioridade" : ""}.
    ${ganha ? `Em comparação, esta apresenta maior contribuição de ${partes[ganha[0]]} (${det(ganha[0])})` : ""}${perde ? `${ganha ? " e menor" : "Em comparação, esta apresenta menor"} contribuição de ${partes[perde[0]]} (${det(perde[0])})` : ""}${ganha || perde ? "." : ""}`;
}
const lista = (xs) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join("; ") + " e " + xs[xs.length - 1];

const FAIXAS = { "--p1": "dos 10 % de maior prioridade", "--p2": "entre 10 % e 25 % de maior prioridade", "--p3": "entre 25 % e 50 % de maior prioridade",
  "--p4": "entre 50 % e 75 % de maior prioridade", "--p5": "dos 25 % de menor prioridade" };
function posicionamento(v) {
  const p = v.p, n = v.n, N = ordem.length, empate = ordem.filter((x) => Math.abs(x.n.ip - n.ip) < 5e-5).length - 1;
  const partes = { pv: "vulnerabilidade de transporte", pd: "desenvolvimento local", pf: "facilidade de execução", pr: "importância do município (REGIC)" };
  const det = (c, o) => ({ pv: `nota ${fmt(n.V)} contra ${fmt(o.n.V)}`, pd: `nota ${fmt(n.D, 1)} contra ${fmt(o.n.D, 1)}`,
    pf: `dificuldade ${fmt(n.F)} contra ${fmt(o.n.F)}; nota menor favorece a prioridade`, pr: `importância ${fmt(n.R, 2)} contra ${fmt(o.n.R, 2)}` }[c]);
  const desemp = (o) => `maior população estimada no entorno (${fmt(p.pop)} pessoas nesta via e ${fmt(o.p.pop)} na outra)${p.pop === o.p.pop ? "; com populações iguais, prevalece a ordem de origem dos dados" : ""}`;
  const viz = (o, acima) => o ? `<li><b>${acima ? "Via imediatamente anterior" : "Via imediatamente subsequente"}:</b> ${esc(o.p.nome)} (${o.pos}ª posição, ${esc(o.p.municipio)}, índice ${fmt(o.n.ip * 100, 1)}).
    ${compara(n, o, partes, (c) => det(c, o), desemp(o))}</li>` : "";
  return `<p>A via ocupa a ${v.pos}ª posição entre ${fmt(N)} vias avaliadas, à frente de ${plural(N - v.pos, "via", "vias")}, e situa-se na faixa ${FAIXAS[corPorPosicao(v.pos - 1, N)]}.
    A posição é relativa: expressa a prioridade da via em comparação com as demais, segundo os indicadores e os pesos vigentes. Ela não expressa, por si só, a viabilidade técnica, ambiental ou econômica da obra.</p>
    ${empate > 0 ? `<p>A via tem índice idêntico ao de ${empate === 1 ? "outra via" : `outras ${fmt(empate)} vias`}. Pela regra de desempate do modelo, a via com maior população estimada no entorno fica à frente; com populações iguais, prevalece a ordem de origem dos dados.</p>` : ""}
    <ul class="vizinhas">${viz(ordem[v.pos - 2], true)}${viz(ordem[v.pos], false)}</ul>`;
}

function sensibilidade(v) {
  const p = v.p, cen = [...ITENS.V, ...ITENS.D, ...ITENS.F].filter(([, , , est]) => est).map(([c, r, escala]) => {
    const atual = valor(p, c), alt = atual > escala[0] ? escala[0] : escala[escala.length - 1], ip = ipCom(v, c, alt);
    return { c, r, atual, alt, ip, pos: posicaoCom(v, ip) };
  });
  const muda = cen.filter((x) => x.pos !== v.pos), fixo = cen.filter((x) => x.pos === v.pos);
  const desc = (c, x) => (IND[c].esc ? ` (${IND[c].esc[x]})` : "");
  const maior = muda.slice().sort((a, b) => Math.abs(b.pos - v.pos) - Math.abs(a.pos - v.pos))[0];
  const al = alertaAssentamento(p);
  return `<p>As simulações a seguir avaliam o efeito, sobre a classificação, da alteração isolada de cada indicador estimado. Em cada cenário, modifica-se apenas o indicador indicado.
    Permanecem constantes os demais indicadores desta via, os indicadores de todas as outras vias e os pesos dos critérios. Os resultados não são previsões nem alterações constatadas em campo:
    mostram quais informações têm maior influência sobre a posição e, portanto, devem ter prioridade na vistoria.</p>
    ${muda.length ? `<ul>${muda.map((x) => `<li><b>${esc(x.r)}</b>: valor atual ${x.atual}${desc(x.c, x.atual)}; valor simulado ${x.alt}${desc(x.c, x.alt)}.
      Na simulação, o índice passaria de ${fmt(v.n.ip * 100, 1)} para ${fmt(x.ip * 100, 1)} e a classificação, da ${v.pos}ª para a ${x.pos}ª posição.</li>`).join("")}</ul>` :
      "<p>Nenhuma alteração isolada de indicador estimado modificaria a posição da via.</p>"}
    ${fixo.length ? `<p>${fixo.length === 1 ? "O indicador estimado" : "Os indicadores estimados"} ${lista(fixo.map((x) => `“${esc(x.r)}”`))}, quando ${fixo.length === 1 ? "alterado" : "alterados"} isoladamente, não ${fixo.length === 1 ? "modifica" : "modificam"} a posição da via.</p>` : ""}
    ${maior ? `<p>O indicador de maior influência sobre a classificação é “${esc(maior.r)}”: sua alteração isolada deslocaria a via ${plural(Math.abs(maior.pos - v.pos), "posição", "posições")}. A confirmação dessa informação deve ser priorizada na vistoria.</p>` : ""}
    <h4>Informações a confirmar em campo</h4>
    <ul>${cen.map((x) => `<li>${esc(x.r)}: valor ${valor(p, x.c) !== auto(p, x.c) ? "ajustado em campo" : "estimado"} ${x.atual}${desc(x.c, x.atual)}.</li>`).join("")}</ul>
    ${al ? `<h4>Inconsistências para verificação</h4><p class="alerta">${esc(al)}</p>` : ""}`;
}

function contexto(v) {
  const p = v.p, e = p.ev, s = p.seinfra || {}, m = REGIC[p.cod_mun];
  const sit = {}; (e.setores || []).forEach((x) => (sit[x.situacao] = (sit[x.situacao] || 0) + x.pessoas_raio));
  const pred = Object.entries(sit).sort((a, b) => b[1] - a[1])[0];
  const ativ = marcados(p, "D", (c) => ["uso.agricola", "uso.turismo", "uso.industrial", "uso.assentamento"].includes(c));
  return `<p>A via localiza-se no município de ${esc(p.municipio)}, que contava com ${fmt(p.pop_mun || 0)} habitantes no Censo 2022${m ? ` e é classificado no REGIC 2018 como ${esc(m.hierarquia)}` : ""}.
    ${s.acesso ? `O acesso se dá pela ${esc(s.acesso)}${s.referencia ? `, na referência ${esc(s.referencia)}` : ""}.` : ""}
    O traçado avaliado tem ${fmt(p.km, 1)} km${s.extensao_km != null ? ` (extensão registrada no cadastro: ${fmt(s.extensao_km, 2)} km)` : ""} e foi obtido de ${esc(e.fonte_tracado)}.</p>
    <p>${p.pop ? `Na faixa de 2 km a partir do traçado, adotada como área de influência, estima-se a presença de ${fmt(p.pop)} pessoas e ${fmt(p.dom)} domicílios, distribuídos em ${plural(e.n_setores || 0, "setor censitário", "setores censitários")}${pred ? `, com predominância de população em setores de situação ${esc(pred[0].toLowerCase())}` : ""}.
      Essa estimativa representa a população potencialmente situada na área de influência considerada pelo estudo e não corresponde necessariamente ao número de usuários da via.` :
      "Não foram identificados setores censitários com moradores na faixa de 2 km."}</p>
    <p>${(e.comunidades || []).length ? `Localidades registradas no entorno: ${esc(nomes(e.comunidades))}.` : "Não foram identificadas localidades registradas no entorno."}
    ${ativ.length ? `Quanto às atividades econômicas, foram identificados os seguintes indícios: ${lista(ativ)}.` : "As bases consultadas não registram atividades agropecuárias, turísticas, extrativistas ou industriais no entorno."}
    ${p.juncoes ? `${p.juncoes === 1 ? "Foi identificado 1 entroncamento com outra via" : `Foram identificados ${fmt(p.juncoes)} entroncamentos com outras vias`}${p.vul.sem_rota_alternativa ? `${p.juncoes === 1 ? "" : ", concentrados em um raio de 1 km"}, o que caracteriza via sem saída` : ""}.` : "Não foram identificados entroncamentos com outras vias."}</p>`;
}

function desenharFicha() {
  const v = selecionada; if (!v) return;
  const p = v.p, n = v.n;
  $("#ficha-conteudo").innerHTML = `
    <h2 class="ficha-tit">${esc(p.nome)}</h2>
    <p class="ficha-sub">${esc(p.tipo)} · ${esc(p.municipio)} (${fmt(p.pop_mun || 0)} habitantes em 2022) · ${fmt(p.km, 1)} km</p>
    ${dadosSeinfra(p)}
    <div class="placar"><span class="grande">${v.pos}º</span><span class="rot">posição entre ${fmt(ordem.length)} vias avaliadas<br><small>1º = maior prioridade relativa</small></span>
      <span class="grande">${fmt(n.ip * 100, 1)}</span><span class="rot">índice de prioridade, de 0 a 100<br><small>vulnerabilidade ${fmt(n.pv * 100, 1)} + desenvolvimento ${fmt(n.pd * 100, 1)} + facilidade ${fmt(n.pf * 100, 1)} + REGIC ${fmt(n.pr * 100, 1)}</small></span></div>
    <div class="acoes"><button class="primario" id="btn-rel">Relatório técnico desta via</button><button id="btn-zoom">Aproximar no mapa</button>
      ${ajustes[p.id] ? '<button id="btn-desfazer">Desfazer ajustes desta via</button>' : ""}</div>
    <p class="sintese">${sintese(v)}</p>
    ${subAbas([["notas", "Critérios e indicadores"], ["porque", "Justificativa"], ["territorio", "Território"]])}
    <div data-subpainel="notas" ${subFicha === "notas" ? "" : "hidden"}>
      ${blocoVistoria(p)}
      <p class="nota">Cada indicador traz a evidência encontrada, a leitura do resultado e a natureza da informação. Indicadores estimados podem ser corrigidos após vistoria; o índice é recalculado na hora.</p>
      ${blocoCriterio(p, "V", n.V, 5)}
      ${blocoCriterio(p, "D", n.D, 10)}
      ${blocoCriterio(p, "F", n.F, 10)}</div>
    <div data-subpainel="porque" class="porque" ${subFicha === "porque" ? "" : "hidden"}>
      <h4>Vulnerabilidade de transporte</h4>${analiseV(v)}
      <h4>Desenvolvimento local</h4>${analiseD(v)}
      <h4>Dificuldade de projeto e execução</h4>${analiseF(v)}
      <h4>Importância do município na rede urbana</h4>${analiseR(v)}
      <h4>Posição no ranking</h4>${posicionamento(v)}
      <h4>Sensibilidade da classificação</h4>${sensibilidade(v)}</div>
    <div data-subpainel="territorio" class="porque" ${subFicha === "territorio" ? "" : "hidden"}>
      ${contexto(v)}
      <div class="crit"><h4>População por setor censitário</h4><span>${fmt(p.pop)} pessoas</span></div>${tabelaSetores(p)}
      <div class="crit"><h4>Perfil de altitude do traçado</h4><span></span></div>${perfilSVG(p.ev.perfil) || '<p class="nota">Não há dado de altitude para o traçado.</p>'}</div>`;
}

// vistoria: registra pavimento e pontes constatados em campo; substitui a premissa do estudo
const VIST = {
  rev: { pav: { "vul.trafegabilidade_ruim": 0 }, leito: { "vul.trafegabilidade_ruim": 1 } },
  ponte: { com: { "vul.infra_acesso_deficiente": 0, "dif.oae": 1 }, madeira: { "vul.infra_acesso_deficiente": 1, "dif.oae": 2 }, sem: { "vul.infra_acesso_deficiente": 1, "dif.oae": 3 } },
};
function blocoVistoria(p) {
  const vs = ajustes[p.id]?._vist || {}, rios = p.ev.travessias - (p.ev.igarapes ?? 0);
  const prem = p.seinfra ? (p.seinfra.obra ? "ramal com obra, pavimentado" : "ramal sem obra, leito natural") : "superfície do OpenStreetMap";
  const op = (k, v, r) => `<option value="${v}" ${(vs[k] || "") === v ? "selected" : ""}>${r}</option>`;
  return `<div class="vistoria"><h4>Vistoria de campo</h4>
    <p class="nota">Registre o que a vistoria constatou. O registro substitui a premissa do estudo e o índice é recalculado na hora. Os registros ficam salvos neste navegador e podem ser exportados na aba Pesos AHP.</p>
    <label>Revestimento <select data-vistoria="rev">${op("rev", "", `Não vistoriado (premissa: ${prem})`)}${op("rev", "pav", "Vistoria atesta pavimento na maior parte da extensão")}${op("rev", "leito", "Vistoria atesta leito natural ou revestimento primário")}</select></label>
    ${rios > 0 ? `<label>Pontes (${plural(rios, "travessia de rio", "travessias de rio")}) <select data-vistoria="ponte">${op("ponte", "", `Não vistoriado (premissa: ${p.seinfra && !p.seinfra.obra ? "sem ponte" : "pontes registradas nas bases"})`)}${op("ponte", "com", "Vistoria atesta ponte adequada em todas as travessias")}${op("ponte", "madeira", "Vistoria atesta ponte de madeira")}${op("ponte", "sem", "Vistoria atesta travessia sem ponte")}</select></label>`
      : '<p class="nota">Não foram identificadas travessias de rio no traçado; o registro de pontes não se aplica.</p>'}</div>`;
}

function subAbas(lista) {
  return `<div class="subabas" role="tablist">${lista.map(([k, r]) => `<button role="tab" data-sub="${k}" aria-selected="${subFicha === k}">${r}</button>`).join("")}</div>`;
}

function ipCom(v, chave, val) { // índice da via se um item tivesse outro valor
  const antes = ajustes[v.p.id];
  ajustes[v.p.id] = { ...(antes || {}), [chave]: val };
  const ip = notas(v.p).ip;
  if (antes) ajustes[v.p.id] = antes; else delete ajustes[v.p.id];
  return ip;
}
const posicaoCom = (v, ip) => 1 + ordem.filter((x) => x !== v && x.n.ip > ip).length;

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
  $("#cr").textContent = `λmáx = ${fmt(r.lmax, 4)}; IC = ${fmt(r.CI, 4)}; RC = ${fmt(r.CR, 4)}. ${ok ? "Os julgamentos são consistentes (RC inferior a 0,10)." : "Os julgamentos são inconsistentes (RC igual ou superior a 0,10). Revise as comparações; enquanto isso, o ranking mantém os últimos pesos consistentes."}`;
  return ok;
}

/* ---------- metodologia (aba Método e seção 9 do relatório) ---------- */
function memoriaMetodologica() {
  const r = ahp(), w = r.CR < 0.1 ? r.w : W, A = r.A, L3 = ["V", "D", "F"];
  const frac = (x) => (x >= 1 ? fmt(x, x % 1 ? 2 : 0) : `1/${fmt(1 / x)}`);
  return `<h3>Análise multicritério</h3>
    <p>A priorização de investimentos em infraestrutura envolve critérios de natureza distinta, como a necessidade de acesso, o benefício socioeconômico e a complexidade de execução, que não podem ser somados diretamente.
    A análise multicritério organiza esses critérios em uma estrutura comum, atribui a cada um uma importância relativa (peso) e combina as notas em um índice único. Assim, as alternativas podem ser comparadas de forma transparente e reproduzível.</p>
    <h3>Método AHP e comparação pareada</h3>
    <p>O Processo de Análise Hierárquica (AHP, do inglês <i>Analytic Hierarchy Process</i>), proposto por Thomas Saaty, obtém os pesos a partir de comparações pareadas.
    Em vez de atribuir pesos diretamente, o decisor compara os critérios dois a dois e indica quanto um é mais importante que o outro, em uma escala de 1 (igual importância) a 9 (importância extrema).
    Os julgamentos formam uma matriz recíproca: se o critério A é 3 vezes mais importante que B, então B vale 1/3 em relação a A. A matriz vigente é:</p>
    <table class="matriz"><thead><tr><th></th>${L3.map((l) => `<th class="n">${l}</th>`).join("")}</tr></thead><tbody>
      ${A.map((lin, i) => `<tr><td>${NOMES[L3[i]]} (${L3[i]})</td>${lin.map((x) => `<td class="n">${frac(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p>Os pesos correspondem ao autovetor principal da matriz, normalizado para soma igual a 1, obtido nesta plataforma pelo método da potência.
    Os pesos vigentes são ${fmt(w.V, 3)} para vulnerabilidade de transporte, ${fmt(w.D, 3)} para desenvolvimento local e ${fmt(w.F, 3)} para dificuldade de projeto e execução.
    Em termos relativos, a vulnerabilidade tem ${fmt(w.V / w.D, 1)} vezes o peso do desenvolvimento local e ${fmt(w.V / w.F, 1)} vezes o peso da dificuldade.
    A matriz padrão reproduz os julgamentos do artigo de referência; qualquer alteração feita na aba Pesos é aplicada apenas neste navegador.</p>
    <h3>Consistência dos julgamentos</h3>
    <p>Como os julgamentos são subjetivos, o AHP verifica sua coerência. Por exemplo, se V é 3 vezes mais importante que D e D é 2 vezes mais importante que F, espera-se que V seja cerca de 6 vezes mais importante que F.
    O índice de consistência é IC = (λmáx − n)/(n − 1), em que λmáx é o maior autovalor da matriz e n = 3 é o número de critérios. A razão de consistência é RC = IC/IA, em que IA = 0,58 é o índice aleatório de Saaty para três critérios.
    A matriz é considerada consistente quando RC é inferior a 0,10. Valores vigentes: λmáx = ${fmt(r.lmax, 4)}, IC = ${fmt(r.CI, 4)} e RC = ${fmt(r.CR, 4)}, ${r.CR < 0.1 ? "o que indica julgamentos consistentes" : "o que indica julgamentos inconsistentes; o ranking mantém os últimos pesos consistentes"}.</p>
    <h3>Critérios de benefício e de custo</h3>
    <p>Vulnerabilidade de transporte, desenvolvimento local e importância do município são critérios de benefício: quanto maior a nota, maior a prioridade.
    Dificuldade de projeto e execução é critério de custo: quanto maior a nota, menor a prioridade. Por isso, ela entra no índice convertida em facilidade de execução, pela expressão (1 − F/10).</p>
    <h3>Composição do índice</h3>
    <p class="formula">Índice = (1 − r) × [w<sub>V</sub> × V/5 + w<sub>D</sub> × D/10 + w<sub>F</sub> × (1 − F/10)] + r × R</p>
    <p>Cada nota é dividida pelo seu valor máximo, para que todos os critérios fiquem na mesma escala de 0 a 1 antes da ponderação.
    O termo entre colchetes reproduz o modelo do artigo de referência. O termo r × R acrescenta a importância do município na rede urbana (REGIC), com r = ${fmt(RPESO * 100)} % na configuração atual.
    O resultado, multiplicado por 100, é o índice de prioridade.</p>
    <h3>Interpretação da pontuação</h3>
    <p>O índice varia de 0 a 100. O valor 100 corresponderia a uma via com vulnerabilidade máxima (5), desenvolvimento máximo (10), dificuldade nula (0) e município de importância máxima (1).
    O índice é comparativo: serve para ordenar as vias entre si e não constitui medida absoluta de necessidade nem de viabilidade. Diferenças pequenas entre vias próximas no ranking devem ser lidas com cautela, sobretudo quando envolvem indicadores estimados.</p>
    <h3>Pontos da metodologia a documentar</h3>
    <ul><li>A fundamentação de cada julgamento da matriz padrão (valores 3, 5 e 2) consta do artigo de referência e não é reproduzida na plataforma.</li>
      <li>A composição da importância REGIC (70 % hierarquia e 30 % atração) e o peso padrão de 15 % foram definidos para esta plataforma e não derivam do artigo. Recomenda-se validação institucional.</li>
      <li>Os limites das faixas de nota (população, entroncamentos, relevo) e os raios de busca (1, 2 e 10 km) estão implementados no código. Sua fundamentação deve ser registrada na documentação metodológica.</li></ul>`;
}

function criteriosMetodo() {
  return ["V", "D", "F", "R"].map((l) => `<h3>${CRIT[l].nome} (${l}, ${CRIT[l].escala}, critério de ${CRIT[l].natureza})</h3>${introCriterio(l, true)}
    ${l !== "R" ? `<ul class="ind-lista">${ITENS[l].map(([c, r]) => `<li><b>${esc(r)}</b> (${ORIGEM[IND[c].origem][0].toLowerCase()}). ${esc(IND[c].o)}${IND[c].esc ? ` Escala: ${Object.entries(IND[c].esc).map(([k, x]) => `${k} = ${x}`).join("; ")}.` : ""}</li>`).join("")}</ul>` : ""}`).join("");
}

function naturezaInformacao() {
  return `<table><thead><tr><th>Natureza da informação</th><th>Significado</th></tr></thead><tbody>
    ${Object.values(ORIGEM).map(([r, t]) => `<tr><td>${r}</td><td>${t}</td></tr>`).join("")}</tbody></table>`;
}
function fontesLimitacoes() {
  return `<p>${AVISO_ESTIMATIVA}</p>
    <h3>Natureza das informações</h3>${naturezaInformacao()}
    <h3>Bases de dados</h3>
    <table><thead><tr><th>Informação</th><th>Instituição</th><th>Referência</th></tr></thead><tbody>
      ${FONTES_TAB.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c === "Data da coleta" || c.endsWith("data da coleta") ? c.replace(/data da coleta/i, `coleta em ${META.gerado_em || "data não registrada"}`) : c}</td></tr>`).join("")}</tbody></table>
    <h3>Limitações</h3><ul>${LIMITACOES.map((x) => `<li>${x}</li>`).join("")}</ul>`;
}
const AVISO_ESTIMATIVA = "Os resultados apresentados correspondem a estimativas obtidas por meio do cruzamento de bases geográficas e estatísticas. Sua utilização no planejamento deve considerar as limitações das fontes e a necessidade de validação em campo.";

function desenharMetodo() {
  $("#metodo-conteudo").innerHTML = `<p>A plataforma aplica o modelo do artigo <cite>Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério</cite> (UNINORTE, 2023), com as correções da revisão metodológica, e acrescenta a importância do município na rede urbana (REGIC 2018).</p>
    <h2>Critérios e indicadores</h2>${criteriosMetodo()}
    <h2>Como os critérios são combinados</h2>${memoriaMetodologica()}
    <h2>Fontes e limitações</h2>${fontesLimitacoes()}`;
}

/* ---------- relatórios ---------- */
function abrirRelatorio(html, depois) {
  $("#rel-conteudo").innerHTML = html;
  $("#relatorio").hidden = false;
  $("#relatorio").scrollTop = 0;
  if (depois) depois();
}

function tabelaRel(p, letra) {
  return `<table class="rel-itens"><thead><tr><th>Indicador e evidência</th><th>Natureza</th><th class="n">Nota</th></tr></thead><tbody>${ITENS[letra].map(([c, rot]) => {
    const al = c === "uso.assentamento" ? alertaAssentamento(p) : "";
    return `<tr><td><b>${esc(rot)}</b><br><small>${esc(IND[c].o)}</small><br>Evidência: ${esc(evidencia(p, c))}<br>Leitura: ${esc(leituraItem(p, c))}${al ? `<br><span class="alerta">${esc(al)}</span>` : ""}</td>
      <td>${ORIGEM[origemDe(p, c)][0]}${origemDe(p, c) === "campo" ? ` (calculado: ${auto(p, c)})` : ""}</td><td class="n">${valor(p, c)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function relatorioVia(v) {
  const p = v.p, n = v.n, r = ahp(), c = v.layer.getBounds().getCenter(), m = REGIC[p.cod_mun];
  abrirRelatorio(`
    <h1>${esc(p.nome)}</h1>
    <p class="cab">Relatório técnico de priorização · ${esc(p.tipo)} · ${esc(p.municipio)}/AM · emitido em ${new Date().toLocaleDateString("pt-BR")}</p>
    <p class="aviso">${AVISO_ESTIMATIVA}</p>

    <h2>1. Identificação e caracterização da via</h2>
    <table><tbody>
      <tr><td>Denominação</td><td class="n">${esc(p.nome)}</td></tr>
      <tr><td>Tipo</td><td class="n">${esc(p.tipo)}</td></tr>
      <tr><td>Município</td><td class="n">${esc(p.municipio)}/AM (${fmt(p.pop_mun || 0)} habitantes no Censo 2022)</td></tr>
      <tr><td>Extensão do traçado avaliado</td><td class="n">${fmt(p.km, 2)} km</td></tr>
      <tr><td>Fonte do traçado</td><td class="n">${esc(p.ev.fonte_tracado)}</td></tr>
      <tr><td>Localização aproximada (centro do traçado)</td><td class="n">latitude ${fmt(c.lat, 5)}, longitude ${fmt(c.lng, 5)}</td></tr>
    </tbody></table>
    ${dadosSeinfra(p)}
    <div class="rel-mapa" id="rel-mapa"></div>

    <h2>2. Síntese da avaliação</h2>
    <table><tbody>
      <tr><td>Posição no ranking estadual</td><td class="n"><b>${v.pos}ª de ${fmt(ordem.length)} vias</b></td></tr>
      <tr><td>Índice de prioridade (0 a 100)</td><td class="n"><b>${fmt(n.ip * 100, 1)}</b></td></tr>
      <tr><td>Vulnerabilidade de transporte (nota de 0 a 5 e contribuição)</td><td class="n">${fmt(n.V)} · ${fmt(n.pv * 100, 1)} pontos</td></tr>
      <tr><td>Desenvolvimento local (nota de 1 a 10 e contribuição)</td><td class="n">${fmt(n.D, 1)} · ${fmt(n.pd * 100, 1)} pontos</td></tr>
      <tr><td>Dificuldade de projeto e execução (nota de 0 a 10 e contribuição da facilidade)</td><td class="n">${fmt(n.F)} · ${fmt(n.pf * 100, 1)} pontos</td></tr>
      <tr><td>Importância do município no REGIC (0 a 1 e contribuição)</td><td class="n">${fmt(n.R, 2)} · ${fmt(n.pr * 100, 1)} pontos</td></tr>
    </tbody></table>
    <p>${sintese(v)}</p>

    <h2>3. Contextualização territorial</h2>
    ${contexto(v)}
    <h3>População por setor censitário na faixa de 2 km</h3>${tabelaSetores(p)}

    <h2>4. Diagnóstico das condições de transporte</h2>
    ${introCriterio("V", true)}<h3>Resultado</h3>${analiseV(v)}${tabelaRel(p, "V")}

    <h2>5. Avaliação do desenvolvimento local</h2>
    ${introCriterio("D", true)}<h3>Resultado</h3>${analiseD(v)}${tabelaRel(p, "D")}

    <h2>6. Avaliação das condições de projeto e execução</h2>
    ${introCriterio("F", true)}<h3>Resultado</h3>${analiseF(v)}${tabelaRel(p, "F")}
    <h3>Perfil de altitude do traçado</h3>${perfilSVG(p.ev.perfil) || '<p class="nota">Não há dado de altitude para o traçado.</p>'}

    <h2>7. Posicionamento no ranking estadual</h2>
    <h3>Importância do município na rede urbana (REGIC)</h3>${introCriterio("R", true)}${analiseR(v)}
    <h3>Posição relativa</h3>${posicionamento(v)}

    <h2>8. Análise de sensibilidade e validação</h2>
    ${sensibilidade(v)}

    <h2>9. Memória metodológica e cálculo</h2>
    ${memoriaMetodologica()}
    <h3>Cálculo do índice desta via</h3>
    <table><thead><tr><th>Componente</th><th class="n">Valor</th></tr></thead><tbody>
      <tr><td>Pesos AHP (V / D / F)</td><td class="n">${fmt(W.V, 3)} / ${fmt(W.D, 3)} / ${fmt(W.F, 3)}</td></tr>
      <tr><td>Razão de consistência (RC)</td><td class="n">${fmt(r.CR, 4)}</td></tr>
      <tr><td>Vulnerabilidade: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.V, 3)} × ${fmt(n.V)}/5</td><td class="n">${fmt(n.pv, 4)}</td></tr>
      <tr><td>Desenvolvimento: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.D, 3)} × ${fmt(n.D, 1)}/10</td><td class="n">${fmt(n.pd, 4)}</td></tr>
      <tr><td>Facilidade: (1 − ${fmt(RPESO, 2)}) × ${fmt(W.F, 3)} × (1 − ${fmt(n.F)}/10)</td><td class="n">${fmt(n.pf, 4)}</td></tr>
      <tr><td>REGIC: ${fmt(RPESO, 2)} × importância do município ${fmt(n.R, 3)}${m ? ` (${esc(m.hierarquia)})` : ""}</td><td class="n">${fmt(n.pr, 4)}</td></tr>
      <tr><td><b>Índice de prioridade (soma das parcelas; × 100 = ${fmt(n.ip * 100, 1)})</b></td><td class="n"><b>${fmt(n.ip, 4)}</b></td></tr>
    </tbody></table>

    <h2>10. Fontes de dados e limitações</h2>
    ${fontesLimitacoes()}
    <p class="rel-rodape">Referência metodológica: “Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério” (UNINORTE, 2023), com dificuldade tratada como critério de custo, e IBGE, “Regiões de Influência das Cidades 2018”.</p>`,
  () => {
    const mm = L.map("rel-mapa", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo }).addTo(mm);
    const g = L.geoJSON(v.layer.toGeoJSON(), { style: { color: cor("--p1"), weight: 5 } }).addTo(mm);
    mm.fitBounds(g.getBounds(), { padding: [20, 20], maxZoom: 13 });
  });
}

function relatorioGeral() {
  const linhas = filtradas.slice(0, 100);
  abrirRelatorio(`
    <h1>Ranking de priorização de ramais e rodovias estaduais</h1>
    <p class="cab">Amazonas · ${fmt(filtradas.length)} vias no filtro atual · emitido em ${new Date().toLocaleDateString("pt-BR")} · pesos V ${fmt(W.V, 3)} / D ${fmt(W.D, 3)} / F ${fmt(W.F, 3)} (RC ${fmt(CR, 4)}) · peso REGIC ${fmt(RPESO * 100)} %</p>
    <p>Este relatório apresenta a classificação relativa das vias segundo o índice de prioridade, que combina, por análise multicritério (AHP), a vulnerabilidade de transporte, o desenvolvimento local, a dificuldade de projeto e execução e a importância do município na rede urbana.
    A posição indica prioridade relativa entre as vias avaliadas e não expressa, por si só, a viabilidade técnica, ambiental ou econômica de cada obra. A justificativa individual de cada posição consta do relatório técnico da via.</p>
    <p class="aviso">${AVISO_ESTIMATIVA}</p>
    <div class="rel-mapa" id="rel-mapa"></div>
    <table><thead><tr><th class="n">Posição</th><th>Via</th><th>Município</th><th class="n">Extensão (km)</th><th class="n">V</th><th class="n">D</th><th class="n">F</th><th class="n">Índice</th></tr></thead><tbody>
    ${linhas.map((v) => `<tr><td class="n">${v.pos}</td><td>${esc(v.p.nome)}<br><small>${esc(v.p.tipo)}</small></td><td>${esc(v.p.municipio)}</td><td class="n">${fmt(v.p.km, 1)}</td>
      <td class="n">${fmt(v.n.V)}</td><td class="n">${fmt(v.n.D, 1)}</td><td class="n">${fmt(v.n.F)}</td><td class="n"><b>${fmt(v.n.ip * 100, 1)}</b></td></tr>`).join("")}
    </tbody></table>
    ${filtradas.length > 100 ? `<p class="nota">São apresentadas as 100 primeiras vias de ${fmt(filtradas.length)} no filtro atual.</p>` : ""}
    <p class="rel-rodape">V = vulnerabilidade de transporte (0 a 5); D = desenvolvimento local (1 a 10); F = dificuldade de projeto e execução (0 a 10; critério de custo, reduz a prioridade); R = importância do município no REGIC 2018 (0 a 1).
    Índice = (1 − r) × [w<sub>V</sub> × V/5 + w<sub>D</sub> × D/10 + w<sub>F</sub> × (1 − F/10)] + r × R, com r = ${fmt(RPESO, 2)}, expresso em escala de 0 a 100.</p>
    <h2>Fontes de dados e limitações</h2>${fontesLimitacoes()}`,
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
  const k = e.target.dataset.vistoria;
  if (k && selecionada) {
    const id = selecionada.p.id, a = (ajustes[id] = ajustes[id] || {}), vs = (a._vist = a._vist || {});
    Object.values(VIST[k]).forEach((m) => Object.keys(m).forEach((c) => delete a[c]));
    if (e.target.value) { vs[k] = e.target.value; Object.assign(a, VIST[k][e.target.value]); } else delete vs[k];
    if (!Object.keys(vs).length) delete a._vist;
    if (!Object.keys(a).length) delete ajustes[id];
    guardar("ajustes", ajustes); recalcular(); desenharFicha(); return;
  }
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
