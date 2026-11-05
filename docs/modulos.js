/* Módulos além dos ramais: terminais hidroviários, aeródromos, saúde e cobertura, REGIC.
   Usa funções e o mapa de app.js (mesmo escopo global). */
"use strict";

// AHP dos módulos: vulnerabilidade = demanda (1); cada uma 3× mais importante que o REGIC → 3/7, 3/7, 1/7 (RC = 0)
const PM = { V: 3 / 7, D: 3 / 7, R: 1 / 7 };
const MOD = { atual: "ramais", dados: {}, camadas: {}, sel: null, sub: { cobertura: "lacunas" }, subFicha: "notas" };
const kmf = (x, d = 1) => (x == null || !isFinite(x) ? "—" : `${fmt(x, d)} km`);
const pct = (a, b) => (b ? `${fmt((100 * a) / b, 1)} %` : "—");

function regicTxt(p, tema) {
  const m = REGIC[p.cod_mun], d = m?.deslocamentos?.[tema];
  return d ? `${m.nome}: destino principal ${d.destino} (${fmt(d.pct_destino)} % das respostas), distância média ${fmt(d.dist_media_km)} km` : "sem dado no REGIC para o município";
}

const DEF = {
  terminais: {
    arq: "terminais.geojson", prefixo: "ter", nome: "terminal", titulo: "Terminais hidroviários (flutuantes)",
    itens: [
      ["sem_terminal", "Sem porto ou terminal a até 5 km", (p) => p.porto ? `mais próximo: ${p.porto} a ${kmf(p.dist_porto_km)}` : "nenhum mapeado"],
      ["sem_via", "Sem acesso rodoviário (via a mais de 2 km)", (p) => `via mais próxima a ${kmf(p.dist_via_km)}`],
      ["longe_sede", "A mais de 30 km da sede do município", (p) => `${kmf(p.dist_sede_km)} da sede`],
      ["sem_saude", "Sem atenção primária à saúde a até 5 km", (p) => `${p.prim} a ${kmf(p.dist_prim_km)}`],
      ["regic_saude_longe", "Moradores do município viajam mais de 200 km, em média, para saúde básica e média (REGIC)", (p) => regicTxt(p, "saude_bm")],
    ],
    demanda: (p) => `${fmt(p.pessoas)} pessoas e ${fmt(p.domicilios)} domicílios no núcleo (Censo 2022)`,
    faixas: "menos de 200 pessoas = 1; 200 a 499 = 2; 500 a 999 = 3; 1.000 a 4.999 = 4; 5.000 ou mais = 5",
    filtro: ["Só núcleos sem porto ou terminal a até 5 km", (p) => p.vul.sem_terminal],
    desempate: (p) => p.pessoas,
    extra: (p) => `À margem de ${p.agua || "rio ou lago sem nome no BC250"} (${fmt(p.dist_agua_km * 1000)} m)`,
    metodo: `<p>Candidatos: aglomerados e núcleos urbanos do Censo 2022 (setores agrupados por contiguidade) com pelo menos 50 moradores e a até 1 km de um rio largo ou lago (massas d'água do IBGE BC250).</p>
      <p><b>Índice</b> = ${fmt(PM.V, 3)}·V/5 + ${fmt(PM.D, 3)}·D/5 + ${fmt(PM.R, 3)}·R. Pesos por AHP: vulnerabilidade e demanda com a mesma importância, cada uma 3 vezes mais importante que o REGIC (RC = 0).</p>
      <dl><dt>V · Vulnerabilidade de transporte (0–5)</dt><dd>Um ponto por deficiência: sem porto ou terminal mapeado a até 5 km; sem acesso rodoviário; a mais de 30 km da sede; sem atenção primária à saúde a até 5 km; município cujos moradores viajam mais de 200 km para saúde básica e média (REGIC).</dd>
      <dt>D · Demanda (1–5)</dt><dd>Moradores do núcleo no Censo 2022.</dd>
      <dt>R · Importância REGIC do município (0–1)</dt><dd>Hierarquia urbana e atração do município (aba REGIC).</dd></dl>
      <p class="nota">Portos e terminais existentes vêm do OpenStreetMap e podem estar incompletos. Confirme em campo antes de decidir.</p>`,
  },
  aerodromos: {
    arq: "aerodromos_candidatos.geojson", prefixo: "aer", nome: "aeródromo", titulo: "Aeródromos",
    itens: [
      ["sem_publico", "Sem aeródromo público (ANAC) a até 50 km", (p) => `${p.aero_pub} a ${kmf(p.dist_aero_pub_km)}`],
      ["sem_nenhum", "Sem nenhum aeródromo, nem privado, a até 50 km", (p) => `${p.aero} a ${kmf(p.dist_aero_km)}`],
      ["sem_via", "Sem acesso rodoviário (via a mais de 5 km)", (p) => `via mais próxima a ${kmf(p.dist_via_km)}`],
      ["hospital_longe", "Hospital a mais de 100 km (remoção aeromédica)", (p) => `${p.hosp} a ${kmf(p.dist_hosp_km)}`],
      ["regic_aeroporto_longe", "Moradores do município viajam mais de 150 km, em média, para usar aeroporto (REGIC)", (p) => regicTxt(p, "aeroporto")],
    ],
    demanda: (p) => `${fmt(p.demanda_sem_aerodromo)} pessoas a até 50 km sem aeródromo público a até 50 km (núcleo: ${fmt(p.pessoas)} pessoas)`,
    faixas: "menos de 2.000 pessoas = 1; 2.000 a 4.999 = 2; 5.000 a 9.999 = 3; 10.000 a 19.999 = 4; 20.000 ou mais = 5",
    filtro: ["Só núcleos sem aeródromo público a até 50 km", (p) => p.vul.sem_publico],
    desempate: (p) => p.demanda_sem_aerodromo,
    extra: (p) => p.tipo === "sede municipal" ? "Sede municipal" : `Núcleo a ${kmf(p.dist_sede_km)} da sede`,
    metodo: `<p>Candidatos: núcleos do Censo 2022 com pelo menos 1.000 moradores. Aeródromos existentes: cadastro da ANAC (públicos e privados).</p>
      <p><b>Índice</b> = ${fmt(PM.V, 3)}·V/5 + ${fmt(PM.D, 3)}·D/5 + ${fmt(PM.R, 3)}·R, com os mesmos pesos AHP dos terminais.</p>
      <dl><dt>V · Vulnerabilidade (0–5)</dt><dd>Um ponto por deficiência: sem aeródromo público a até 50 km; sem nenhum aeródromo a até 50 km; sem acesso rodoviário; hospital a mais de 100 km; município cujos moradores viajam mais de 150 km para usar aeroporto (REGIC).</dd>
      <dt>D · Demanda (1–5)</dt><dd>Pessoas que um aeródromo no local passaria a atender: moradores a até 50 km que hoje não têm aeródromo público a até 50 km (endereços do CNEFE 2022 com a população do Censo 2022).</dd>
      <dt>R · Importância REGIC do município (0–1)</dt><dd>Hierarquia urbana e atração do município.</dd></dl>
      <p class="nota">O cadastro da ANAC não informa quem opera cada aeródromo público (Estado ou município). A decisão sobre aeródromo estadual deve cruzar esta lista com o cadastro da SEINFRA.</p>`,
  },
};

/* ---------- carga ---------- */
async function carregarModulo(k) {
  if (MOD.dados[k]) return MOD.dados[k];
  const d = (MOD.dados[k] = { itens: [], ordem: [], filtradas: [], limite: 60 });
  const fc = await carregar(DEF[k].arq);
  const g = L.featureGroup();
  for (const f of fc.features) {
    const p = { ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    const it = { p, k };
    it.layer = L.circleMarker([p.lat, p.lon], { radius: Math.min(15, 3 + Math.sqrt(p.pessoas) / 12), weight: 1, color: "#fff", fillOpacity: 0.9 })
      .on("click", () => selecionarMod(it, false)).bindTooltip(() => `${esc(p.nome)} · ${it.pos}º`, { sticky: true });
    it.layer.addTo(g);
    d.itens.push(it);
  }
  MOD.camadas[k] = g;
  calcularModulo(k);
  return d;
}

function calcularModulo(k) {
  const d = MOD.dados[k], def = DEF[k];
  d.itens.forEach((it) => {
    const p = it.p, V = Object.values(p.vul).reduce((a, b) => a + b, 0), R = REGIC[p.cod_mun]?.importancia ?? p.importancia_regic ?? 0;
    const pv = (PM.V * V) / 5, pd = (PM.D * p.n_demanda) / 5, pr = PM.R * R;
    it.n = { V, Dm: p.n_demanda, R, pv, pd, pr, ip: pv + pd + pr };
  });
  d.ordem = [...d.itens].sort((a, b) => b.n.ip - a.n.ip || def.desempate(b.p) - def.desempate(a.p));
  d.ordem.forEach((x, i) => (x.pos = i + 1));
}

/* ---------- painel dos rankings ---------- */
function corpoRanking(k) {
  const def = DEF[k];
  return `<div class="filtros">
      <input type="search" data-f="busca" placeholder="Buscar núcleo ou município" aria-label="Buscar">
      <label><input type="checkbox" data-f="so" checked> ${def.filtro[0]}</label>
      <select data-f="mun" aria-label="Município"><option value="">Todos os municípios</option></select>
    </div>
    <div class="resumo" data-f="resumo"></div>
    <ol class="lista" data-f="lista"></ol>
    <div class="acoes"><button class="primario" data-acao="rel-geral">Relatório geral do ranking</button><button data-acao="csv">Baixar ranking (CSV)</button></div>
    <details class="metodo-mod"><summary>Como o ranking é calculado</summary>${def.metodo}</details>`;
}

function filtrarModulo(k) {
  const d = MOD.dados[k], def = DEF[k], raiz = $(`#corpo-${k}`);
  const q = raiz.querySelector("[data-f=busca]").value.trim().toLowerCase();
  const so = raiz.querySelector("[data-f=so]").checked, mun = raiz.querySelector("[data-f=mun]").value;
  d.filtradas = d.ordem.filter((it) => (!so || def.filtro[1](it.p)) && (!mun || it.p.municipio === mun) &&
    (!q || (it.p.nome + " " + it.p.municipio).toLowerCase().includes(q)));
  d.filtradas.forEach((x, i) => (x.posf = i + 1));
  desenharListaMod(k);
  estilizarMod(k);
}

function desenharListaMod(k) {
  const d = MOD.dados[k], raiz = $(`#corpo-${k}`), max = d.filtradas[0]?.n.ip || 1;
  raiz.querySelector("[data-f=resumo]").textContent = `${fmt(d.filtradas.length)} núcleos${d.filtradas.length !== d.ordem.length ? ` de ${fmt(d.ordem.length)}` : ""} · posição no ranking geral à esquerda`;
  const larg = (x) => ((100 * x) / max).toFixed(1) + "%";
  raiz.querySelector("[data-f=lista]").innerHTML = d.filtradas.slice(0, d.limite).map((it) => `<li data-id="${esc(it.p.id)}" tabindex="0" class="${MOD.sel === it ? "ativo" : ""}">
      <span class="pos">${it.pos}</span><span class="nome">${esc(it.p.nome)}</span><span class="ip">${fmt(it.n.ip * 100, 1)}</span>
      <span class="sub">${esc(it.p.municipio)} · ${fmt(it.p.pessoas)} pessoas · V ${it.n.V}/5</span>
      <span class="faixa"><i class="v" style="width:${larg(it.n.pv)}"></i><i class="d" style="width:${larg(it.n.pd)}"></i><i class="r" style="width:${larg(it.n.pr)}"></i></span></li>`).join("") +
    (d.filtradas.length > d.limite ? `<li class="mais-li"><button class="mais" data-acao="mais">Mostrar mais ${Math.min(60, d.filtradas.length - d.limite)}</button></li>` : "");
}

function estilizarMod(k) {
  const d = MOD.dados[k], vis = new Set(d.filtradas), n = d.filtradas.length;
  d.itens.forEach((it) => {
    const v = vis.has(it);
    it.layer.setStyle({ fillColor: v ? cor(corPorPosicao(it.posf - 1, n)) : "#8a8f86", fillOpacity: v ? 0.9 : 0.15, opacity: v ? 1 : 0.2,
      weight: it === MOD.sel ? 3 : 1, color: it === MOD.sel ? cor("--tinta") : "#fff" });
  });
}

/* ---------- ficha e explicação ---------- */
function porQueMod(it) {
  const k = it.k, def = DEF[k], d = MOD.dados[k], p = it.p, n = it.n, N = d.ordem.length;
  const com = def.itens.filter(([c]) => p.vul[c]).map(([, r]) => esc(r)), sem = def.itens.filter(([c]) => !p.vul[c]).map(([, r]) => esc(r));
  const media = (f) => d.ordem.reduce((s, x) => s + f(x), 0) / N;
  const rel = (a, m) => (a > m + 0.05 ? "acima da média" : a < m - 0.05 ? "abaixo da média" : "na média");
  const empate = d.ordem.filter((x) => Math.abs(x.n.ip - n.ip) < 5e-5).length - 1;
  const m = REGIC[p.cod_mun];
  const partes = { pv: "vulnerabilidade", pd: "demanda", pr: "importância REGIC do município" };
  const viz = (o, acima) => o ? `<li>${acima ? "Logo acima" : "Logo abaixo"}: <b>${esc(o.p.nome)}</b> (${o.pos}º, ${esc(o.p.municipio)}, índice ${fmt(o.n.ip * 100, 1)}).
    ${compara(n, o, partes, (c) => ({ pv: `V ${n.V} contra ${o.n.V}`, pd: `D ${n.Dm} contra ${o.n.Dm}`, pr: `REGIC ${fmt(n.R, 2)} contra ${fmt(o.n.R, 2)}` }[c]), "a demanda")}</li>` : "";
  return `<div class="porque">
    <p><b>${esc(p.nome)}</b> ficou em <b>${it.pos}º de ${fmt(N)}</b> candidatos a ${def.nome}, com índice ${fmt(n.ip * 100, 1)} de 100. Está à frente de ${fmt(N - it.pos)} núcleos (${fmt((100 * (N - it.pos)) / N)} % do total).
    ${empate > 0 ? `Tem o mesmo índice que ${empate === 1 ? "outro núcleo" : `outros ${fmt(empate)}`}; no empate passa à frente quem tem mais demanda.` : ""}</p>
    <h4>Vulnerabilidade: ${n.V} de 5, ${rel(n.V, media((x) => x.n.V))} (${fmt(media((x) => x.n.V), 1)})</h4>
    <p>Somou ${fmt(n.pv * 100, 1)} pontos (peso ${fmt(PM.V * 100)} %). ${com.length ? `Contaram ponto: ${lista(com)}.` : "Nenhuma deficiência marcada."} ${sem.length ? `Não contaram: ${lista(sem)}.` : ""}</p>
    <h4>Demanda: ${n.Dm} de 5, ${rel(n.Dm, media((x) => x.n.Dm))} (${fmt(media((x) => x.n.Dm), 1)})</h4>
    <p>Somou ${fmt(n.pd * 100, 1)} pontos (peso ${fmt(PM.D * 100)} %). ${esc(def.demanda(p))}. Escala: ${def.faixas}.</p>
    <h4>Município na rede urbana (REGIC 2018)</h4>
    <p>${m ? `${esc(m.nome)} é <b>${esc(m.hierarquia)}</b> e se liga a ${esc(m.regiao_imediata)}. Importância ${fmt(n.R, 2)} de 1, que somou ${fmt(n.pr * 100, 1)} pontos (peso ${fmt(PM.R * 100)} %).` : "Sem dado do REGIC."}</p>
    <h4>Comparação com os vizinhos no ranking</h4><ul>${viz(d.ordem[it.pos - 2], true)}${viz(d.ordem[it.pos], false)}</ul>
  </div>`;
}

function tabelaItensMod(it) {
  const def = DEF[it.k], p = it.p;
  return `<table class="itens"><tbody>${def.itens.map(([c, r, ev]) => `<tr><td>${esc(r)}<span class="ev">${esc(ev(p))}</span></td><td class="n">${p.vul[c]}</td></tr>`).join("")}</tbody></table>`;
}
function tabelaDistancias(p) {
  const l = [["Sede do município", p.dist_sede_km, ""], ["Porto ou terminal (OSM)", p.dist_porto_km, p.porto], ["Via terrestre", p.dist_via_km, ""],
    ["Rio largo ou lago (BC250)", p.dist_agua_km, p.agua], ["Atenção primária (CNES)", p.dist_prim_km, p.prim], ["Hospital (CNES)", p.dist_hosp_km, p.hosp],
    ["Aeródromo público (ANAC)", p.dist_aero_pub_km, p.aero_pub], ["Qualquer aeródromo (ANAC)", p.dist_aero_km, p.aero]];
  return `<table class="itens"><tbody>${l.map(([r, d, nome]) => `<tr><td>${r}${nome ? `<span class="ev">${esc(nome)}</span>` : ""}</td><td class="n">${kmf(d)}</td></tr>`).join("")}</tbody></table>
    <p class="nota">Distâncias em linha reta. Por rio, o percurso real costuma ser bem maior.</p>`;
}
const listaSetores = (p) => `<p class="nota">Setores censitários do núcleo (${p.setores.length}): ${p.setores.map(esc).join(", ")}.</p>`;

function desenharFichaMod() {
  const it = MOD.sel; if (!it) return;
  const p = it.p, n = it.n, def = DEF[it.k];
  $("#ficha-conteudo").innerHTML = `
    <h2 class="ficha-tit">${esc(p.nome)}</h2>
    <p class="ficha-sub">${esc(p.tipo)}${p.indigena ? " · agrupamento indígena" : ""} · ${esc(p.municipio)} · ${fmt(p.pessoas)} pessoas · ${esc(def.extra(p))}</p>
    <div class="placar"><span class="grande">${it.pos}º</span><span class="rot">de ${fmt(MOD.dados[it.k].ordem.length)} candidatos a ${def.nome}</span>
      <span class="grande">${fmt(n.ip * 100, 1)}</span><span class="rot">índice (0–100)<br>vulnerabilidade ${fmt(n.pv * 100, 1)} + demanda ${fmt(n.pd * 100, 1)} + REGIC ${fmt(n.pr * 100, 1)}</span></div>
    <div class="acoes"><button class="primario" data-acao="rel-item">Relatório deste núcleo</button><button data-acao="zoom">Aproximar no mapa</button></div>
    ${subAbasMod([["notas", "Notas e distâncias"], ["porque", "Por que esta posição"]])}
    <div data-subpainel="porque" ${MOD.subFicha === "porque" ? "" : "hidden"}>${porQueMod(it)}</div>
    <div data-subpainel="notas" ${MOD.subFicha === "notas" ? "" : "hidden"}>
      <div class="crit"><h4>Vulnerabilidade</h4><span>${n.V} / 5</span></div>${tabelaItensMod(it)}
      <div class="crit"><h4>Demanda</h4><span>${n.Dm} / 5</span></div><p>${esc(def.demanda(p))}</p>
      <div class="crit"><h4>Distâncias</h4><span></span></div>${tabelaDistancias(p)}
      ${listaSetores(p)}
    </div>`;
}
function subAbasMod(l) {
  return `<div class="subabas" role="tablist">${l.map(([k, r]) => `<button role="tab" data-submod="${k}" aria-selected="${MOD.subFicha === k}">${r}</button>`).join("")}</div>`;
}

function abrirFicha() { $("#ficha").hidden = false; mapa.invalidateSize(); }
function selecionarMod(it, zoom = true) {
  MOD.sel = it; selecionada = null;
  desenharFichaMod(); abrirFicha();
  estilizarMod(it.k); desenharListaMod(it.k);
  if (zoom) mapa.setView([it.p.lat, it.p.lon], 11);
  history.replaceState(null, "", `#${DEF[it.k].prefixo}-${it.p.id}`);
}

/* ---------- relatórios ---------- */
const FONTES_MOD = `IBGE — setores, aglomerados e população do Censo 2022, CNEFE 2022, BC250 (massas d'água), REGIC 2018;
  Ministério da Saúde — CNES; ANAC — cadastro de aeródromos públicos e privados; OpenStreetMap — portos e terminais;
  SEINFRA-AM — traçado dos ramais.`;

function relatorioMod(it) {
  const p = it.p, n = it.n, def = DEF[it.k];
  abrirRelatorio(`
    <h1>${esc(p.nome)}</h1>
    <p class="cab">Candidato a ${def.nome} · ${esc(p.tipo)} · ${esc(p.municipio)}/AM · relatório gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
    <table><tbody>
      <tr><td>Posição no ranking</td><td class="n"><b>${it.pos}º de ${fmt(MOD.dados[it.k].ordem.length)}</b></td></tr>
      <tr><td>Índice (0–100)</td><td class="n"><b>${fmt(n.ip * 100, 1)}</b></td></tr>
      <tr><td>Moradores do núcleo (Censo 2022)</td><td class="n">${fmt(p.pessoas)}</td></tr>
      ${p.demanda_sem_aerodromo != null ? `<tr><td>Pessoas a até 50 km sem aeródromo público a até 50 km</td><td class="n">${fmt(p.demanda_sem_aerodromo)}</td></tr>` : ""}
      <tr><td>Localização</td><td class="n">${fmt(p.lat, 5)}, ${fmt(p.lon, 5)}</td></tr>
    </tbody></table>
    <div class="rel-mapa" id="rel-mapa"></div>
    <h2>Por que esta posição</h2>${porQueMod(it)}
    <h2>Vulnerabilidade — ${n.V} de 5</h2>${tabelaItensMod(it)}
    <h2>Distâncias</h2>${tabelaDistancias(p)}
    ${listaSetores(p)}
    <h2>Memória de cálculo</h2>
    <table><tbody>
      <tr><td>Vulnerabilidade: ${fmt(PM.V, 3)} × ${n.V}/5</td><td class="n">${fmt(n.pv, 4)}</td></tr>
      <tr><td>Demanda: ${fmt(PM.D, 3)} × ${n.Dm}/5</td><td class="n">${fmt(n.pd, 4)}</td></tr>
      <tr><td>REGIC: ${fmt(PM.R, 3)} × ${fmt(n.R, 3)}</td><td class="n">${fmt(n.pr, 4)}</td></tr>
      <tr><td><b>Índice</b></td><td class="n"><b>${fmt(n.ip, 4)}</b></td></tr>
    </tbody></table>
    <div class="rel-rodape">${def.metodo}<p>Fontes: ${FONTES_MOD}</p></div>`,
  () => {
    const m = L.map("rel-mapa", { zoomControl: false });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo }).addTo(m);
    L.circleMarker([p.lat, p.lon], { radius: 9, color: "#fff", weight: 2, fillColor: cor("--p1"), fillOpacity: 1 }).addTo(m);
    m.setView([p.lat, p.lon], 10);
  });
}

function relatorioGeralMod(k) {
  const d = MOD.dados[k], def = DEF[k], linhas = d.filtradas.slice(0, 100);
  abrirRelatorio(`
    <h1>Ranking de ${def.titulo.toLowerCase()}</h1>
    <p class="cab">Amazonas · ${fmt(d.filtradas.length)} núcleos no filtro atual · gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
    <div class="rel-mapa" id="rel-mapa"></div>
    <table><thead><tr><th class="n">Pos.</th><th>Núcleo</th><th>Município</th><th class="n">Pessoas</th><th class="n">V</th><th class="n">D</th><th class="n">REGIC</th><th class="n">Índice</th></tr></thead><tbody>
    ${linhas.map((it) => `<tr><td class="n">${it.pos}</td><td>${esc(it.p.nome)}<br><small>${esc(it.p.tipo)}</small></td><td>${esc(it.p.municipio)}</td><td class="n">${fmt(it.p.pessoas)}</td>
      <td class="n">${it.n.V}</td><td class="n">${it.n.Dm}</td><td class="n">${fmt(it.n.R, 2)}</td><td class="n"><b>${fmt(it.n.ip * 100, 1)}</b></td></tr>`).join("")}
    </tbody></table>
    ${d.filtradas.length > 100 ? `<p class="nota">Mostrando os 100 primeiros de ${fmt(d.filtradas.length)}.</p>` : ""}
    <div class="rel-rodape">${def.metodo}<p>Fontes: ${FONTES_MOD}</p></div>`,
  () => {
    const m = L.map("rel-mapa", { zoomControl: false });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: atrib.topo }).addTo(m);
    const g = L.featureGroup(linhas.slice(0, 20).map((it) => L.circleMarker([it.p.lat, it.p.lon], { radius: 7, color: "#fff", weight: 1.5, fillColor: cor("--p1"), fillOpacity: 1 })
      .bindTooltip(`${it.pos}º ${it.p.nome}`, { permanent: it.pos <= 5, direction: "top" }))).addTo(m);
    if (linhas.length) m.fitBounds(g.getBounds(), { padding: [20, 20], maxZoom: 9 });
  });
}

function csvMod(k) {
  const d = MOD.dados[k], def = DEF[k];
  const cab = ["posicao", "nucleo", "tipo", "municipio", "pessoas", ...def.itens.map(([c]) => c), "vulnerabilidade", "demanda", "regic", "indice", "lat", "lon"];
  baixar(`ranking_${k}_am.csv`, "﻿" + cab.join(";") + "\n" + d.filtradas.map((it) => [it.pos, `"${it.p.nome}"`, it.p.tipo, it.p.municipio, it.p.pessoas,
    ...def.itens.map(([c]) => it.p.vul[c]), it.n.V, it.n.Dm, fmt(it.n.R, 3), fmt(it.n.ip * 100, 2), it.p.lat, it.p.lon].join(";")).join("\n"), "text/csv");
}

/* ---------- saúde e cobertura ---------- */
async function carregarCobertura() {
  if (MOD.dados.cobertura) return MOD.dados.cobertura;
  const [uni, lac, aer, meta] = await Promise.all(["saude_unidades.geojson", "saude_lacunas.geojson", "aerodromos_existentes.geojson", "modulos_meta.json"].map(carregar));
  const pt = (f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
  const d = (MOD.dados.cobertura = { unidades: uni.features.map(pt), lacunas: lac.features.map(pt), aero: aer.features.map(pt), meta });
  const g = L.featureGroup();
  d.lacunas.forEach((p) => L.circleMarker([p.lat, p.lon], { radius: Math.min(14, 3 + Math.sqrt(p.pessoas) / 10), color: "#fff", weight: 1, fillColor: cor("--p1"), fillOpacity: 0.85 })
    .bindPopup(`<div class="popup-tit">${esc(p.nome)}</div>${fmt(p.pessoas)} pessoas · ${esc(p.municipio)}<br>Atenção primária mais próxima: ${esc(p.prim)} a ${kmf(p.dist_prim_km)}`).addTo(g));
  d.unidades.forEach((p) => L.circleMarker([p.lat, p.lon], { radius: p.hospital ? 6 : 3.5, color: p.hospital ? cor("--tinta") : "#fff", weight: 1, fillColor: p.hospital ? "#fff" : cor("--mata"), fillOpacity: 1 })
    .bindPopup(`<div class="popup-tit">${esc(p.nome)}</div>${esc(p.tipo)} · CNES ${p.cnes}<br>${fmt(p.pessoas_atribuidas)} pessoas têm esta unidade como a mais próxima${p.hospital ? "" : `<br>Referência: ${p.equipes_referencia} equipe(s) de Saúde da Família`}`).addTo(g));
  MOD.camadas.cobertura = g;
  MOD.camadas.aeroExist = camadaAeroExistentes(d.aero);
  return d;
}
function camadaAeroExistentes(lista) {
  const g = L.featureGroup();
  lista.forEach((a) => L.circleMarker([a.lat, a.lon], { radius: a.publico ? 7 : 4, color: cor("--rio"), weight: 2, fillColor: a.publico ? cor("--rio") : "#fff", fillOpacity: 1 })
    .bindPopup(`<div class="popup-tit">${esc(a.nome)}</div>Aeródromo ${a.publico ? "público" : "privado"} (ANAC ${esc(a.ciad || a.oaci || "")}) · ${esc(a.municipio)}${a.pessoas_atendidas != null ? `<br>${fmt(a.pessoas_atendidas)} pessoas a até 50 km têm este como o público mais próximo` : ""}`).addTo(g));
  return g;
}

function corpoCobertura() {
  const d = MOD.dados.cobertura, m = d.meta, s = MOD.sub.cobertura, T = m.pessoas_total;
  const munis = Object.values(REGIC).map((x) => ({ ...x.indicadores, nome: x.nome, cod: x.cod, leitos_mil: x.leitos_mil })).filter((x) => x.pessoas);
  const abas = [["lacunas", "Falta saúde"], ["unidades", "Unidades"], ["aero", "Aeródromos"], ["municipios", "Municípios"]];
  let corpo = "";
  if (s === "lacunas") {
    corpo = `<p class="nota">Núcleos do Censo 2022 sem unidade de atenção primária (posto, UBS, UBS fluvial, unidade mista ou de saúde indígena) a até 5 km, do maior para o menor.</p>
      <ol class="lista lista-simples">${d.lacunas.slice(0, 150).map((p, i) => `<li data-lac="${i}" tabindex="0"><span class="pos">${i + 1}</span><span class="nome">${esc(p.nome)}</span>
        <span class="ip">${fmt(p.pessoas)}</span><span class="sub">${esc(p.municipio)} · ${esc(p.prim)} a ${kmf(p.dist_prim_km)}</span></li>`).join("")}</ol>`;
  } else if (s === "unidades") {
    const prim = d.unidades.filter((u) => !u.hospital).sort((a, b) => b.pessoas_atribuidas - a.pessoas_atribuidas);
    const hosp = d.unidades.filter((u) => u.hospital).sort((a, b) => b.pessoas_atribuidas - a.pessoas_atribuidas);
    const linha = (u, i) => `<li data-uni="${d.unidades.indexOf(u)}" tabindex="0"><span class="pos">${i + 1}</span><span class="nome">${esc(u.nome)}</span><span class="ip">${fmt(u.pessoas_atribuidas)}</span>
      <span class="sub">${esc(u.tipo)}${u.hospital ? "" : ` · referência ${u.equipes_referencia} equipe(s) · ${fmt(u.pessoas_a_mais_de_5km)} pessoas a mais de 5 km`}</span></li>`;
    corpo = `<p class="nota">Demanda que cada unidade supre hoje: moradores para quem ela é a unidade mais próxima (linha reta). Referência da PNAB 2017: até ${fmt(m.ref_equipe)} pessoas por equipe de Saúde da Família.</p>
      <h3>Atenção primária (${fmt(prim.length)})</h3><ol class="lista lista-simples">${prim.slice(0, 80).map(linha).join("")}</ol>
      <h3>Hospitais e unidades mistas (${fmt(hosp.length)})</h3><ol class="lista lista-simples">${hosp.slice(0, 80).map(linha).join("")}</ol>`;
  } else if (s === "aero") {
    const pub = d.aero.filter((a) => a.publico).sort((a, b) => b.pessoas_atendidas - a.pessoas_atendidas);
    const falta = [...munis].sort((a, b) => b.sem_aerodromo_publico_50km - a.sem_aerodromo_publico_50km).filter((x) => x.sem_aerodromo_publico_50km > 0);
    corpo = `<p class="nota">${fmt(m.n_aero_pub)} aeródromos públicos e ${fmt(m.n_aero_priv)} privados no cadastro da ANAC. ${fmt(m.pessoas_sem_aero_pub)} pessoas (${pct(m.pessoas_sem_aero_pub, T)}) vivem a mais de ${m.raio_aerodromo_km} km de um aeródromo público.</p>
      <h3>Demanda atendida pelos aeródromos públicos</h3>
      <ol class="lista lista-simples">${pub.map((a, i) => `<li data-aer="${d.aero.indexOf(a)}" tabindex="0"><span class="pos">${i + 1}</span><span class="nome">${esc(a.nome)}</span><span class="ip">${fmt(a.pessoas_atendidas)}</span><span class="sub">${esc(a.municipio)} · pessoas a até ${m.raio_aerodromo_km} km</span></li>`).join("")}</ol>
      <h3>O que falta: pessoas sem aeródromo público a até ${m.raio_aerodromo_km} km</h3>
      <table class="itens"><tbody>${falta.map((x) => `<tr><td>${esc(x.nome)}</td><td class="n">${fmt(x.sem_aerodromo_publico_50km)}</td><td class="n">${pct(x.sem_aerodromo_publico_50km, x.pessoas)}</td></tr>`).join("")}</tbody></table>`;
  } else {
    const l = [...munis].sort((a, b) => b.sem_atencao_primaria_5km - a.sem_atencao_primaria_5km);
    corpo = `<p class="nota">Leitos estimados = leitos por mil habitantes do REGIC 2018 (CNES) × população de 2018. Necessidade: 2,5 leitos por mil habitantes (Portaria MS 1.101/2002), sobre a população de 2022.</p>
      <div class="tabela-rolagem"><table class="itens tabela-mun"><thead><tr><th>Município</th><th class="n">Pessoas</th><th class="n">Sem atenção primária a 5 km</th><th class="n">Sem hospital a 100 km</th><th class="n">Déficit de leitos</th><th class="n">Sem aeródromo público a 50 km</th></tr></thead><tbody>
      ${l.map((x) => `<tr data-mun="${x.cod}"><td>${esc(x.nome)}</td><td class="n">${fmt(x.pessoas)}</td><td class="n">${fmt(x.sem_atencao_primaria_5km)}</td><td class="n">${fmt(x.sem_hospital_100km)}</td>
        <td class="n">${fmt(x.deficit_leitos)}</td><td class="n">${fmt(x.sem_aerodromo_publico_50km)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  return `<div class="cartoes">
      <p><b>${fmt(m.pessoas_sem_prim_5km)}</b> pessoas (${pct(m.pessoas_sem_prim_5km, T)}) a mais de 5 km de atenção primária</p>
      <p><b>${fmt(m.pessoas_sem_hosp_100km)}</b> pessoas (${pct(m.pessoas_sem_hosp_100km, T)}) a mais de 100 km de hospital</p>
      <p><b>${fmt(m.pessoas_sem_aero_pub)}</b> pessoas (${pct(m.pessoas_sem_aero_pub, T)}) a mais de ${m.raio_aerodromo_km} km de aeródromo público</p></div>
    <div class="subabas" role="tablist">${abas.map(([k, r]) => `<button role="tab" data-cob="${k}" aria-selected="${s === k}">${r}</button>`).join("")}</div>
    ${corpo}
    <p class="nota">Base: ${fmt(m.n_prim)} unidades de atenção primária e ${fmt(m.n_hosp)} hospitais do CNES com coordenadas; população do Censo 2022 distribuída pelos endereços do CNEFE 2022. Distâncias em linha reta.</p>`;
}

function fichaLacuna(p) {
  $("#ficha-conteudo").innerHTML = `<h2 class="ficha-tit">${esc(p.nome)}</h2>
    <p class="ficha-sub">${esc(p.tipo)}${p.indigena ? " · agrupamento indígena" : ""} · ${esc(p.municipio)} · ${fmt(p.pessoas)} pessoas</p>
    <div class="porque"><p>Este núcleo não tem unidade de atenção primária a até 5 km. A mais próxima é <b>${esc(p.prim)}</b>, a ${kmf(p.dist_prim_km)}. O hospital mais próximo é ${esc(p.hosp)}, a ${kmf(p.dist_hosp_km)}.</p>
    <p>Com ${fmt(p.pessoas)} moradores, a demanda equivale a ${Math.max(1, Math.ceil(p.pessoas / MOD.dados.cobertura.meta.ref_equipe))} equipe(s) de Saúde da Família pela referência da PNAB.
    ${p.dist_agua_km <= 1 ? "Fica à margem de rio ou lago: pode ser atendido por UBS fluvial." : ""}</p></div>
    <div class="crit"><h4>Distâncias</h4><span></span></div>${tabelaDistancias(p)}${listaSetores(p)}`;
  abrirFicha(); mapa.setView([p.lat, p.lon], 11);
}
function fichaUnidade(u) {
  $("#ficha-conteudo").innerHTML = `<h2 class="ficha-tit">${esc(u.nome)}</h2><p class="ficha-sub">${esc(u.tipo)} · CNES ${u.cnes}</p>
    <div class="porque"><p><b>${fmt(u.pessoas_atribuidas)}</b> pessoas têm esta unidade como a mais próxima${u.hospital ? " entre os hospitais" : ""}.
    ${u.hospital ? "" : `Pela referência de ${fmt(MOD.dados.cobertura.meta.ref_equipe)} pessoas por equipe, essa demanda pede ${u.equipes_referencia} equipe(s) de Saúde da Família. Desse total, ${fmt(u.pessoas_a_mais_de_5km)} pessoas moram a mais de 5 km da unidade.`}</p>
    <p class="nota">O CNES não informa aqui quantas equipes a unidade tem. Compare com o cadastro de equipes (e-Gestor) antes de concluir que falta equipe.</p></div>`;
  abrirFicha(); mapa.setView([u.lat, u.lon], 11);
}
function fichaAero(a) {
  $("#ficha-conteudo").innerHTML = `<h2 class="ficha-tit">${esc(a.nome)}</h2><p class="ficha-sub">Aeródromo ${a.publico ? "público" : "privado"} · ${esc(a.municipio)} · ANAC ${esc(a.ciad || "")} ${esc(a.oaci || "")}</p>
    <div class="porque"><p><b>${fmt(a.pessoas_atendidas)}</b> pessoas moram a até ${MOD.dados.cobertura.meta.raio_aerodromo_km} km e têm este como o aeródromo público mais próximo.</p></div>`;
  abrirFicha(); mapa.setView([a.lat, a.lon], 10);
}

/* ---------- REGIC ---------- */
const COR_NIVEL = { "1": "--p1", "2": "--p2", "3": "--p3", "4": "--p4", "5": "--p5" };
function corpoRegic() {
  const R = window.REGIC_DADOS; if (!R) return "<p>REGIC não carregado.</p>";
  const l = R.municipios;
  return `<p class="nota">Regiões de Influência das Cidades 2018 (IBGE): posição de cada município na rede urbana e para onde seus moradores vão buscar bens e serviços. A importância (0 a 1) = 0,7 × nota da hierarquia + 0,3 × índice de atração (escala log). Ela entra nos rankings: até 30 % nos ramais (aba Pesos AHP) e 1/7 nos terminais e aeródromos.</p>
    <label class="linha"><input type="checkbox" id="regic-vinc" checked> Mostrar vínculos com o polo (linhas)</label>
    <ol class="lista lista-simples">${l.map((m, i) => `<li data-mun="${m.cod}" tabindex="0"><span class="pos">${i + 1}</span><span class="nome">${esc(m.nome)}</span><span class="ip">${fmt(m.importancia, 2)}</span>
      <span class="sub">${esc(m.hierarquia)} · ${fmt(m.indicadores?.pessoas || 0)} pessoas</span></li>`).join("")}</ol>
    <p class="nota">Resumo do livro do REGIC 2018: arquivo REGIC_2018_RESUMO.md, na pasta REGIC IBGE do projeto.</p>`;
}
async function camadaRegic() {
  if (MOD.camadas.regic) return MOD.camadas.regic;
  const muns = await carregar("municipios.geojson");
  const poly = L.geoJSON(muns, {
    style: (f) => { const m = REGIC[f.properties.cod]; return { color: "#fff", weight: 0.8, fillColor: cor(COR_NIVEL[(m?.nivel || "5")[0]]), fillOpacity: 0.65 }; },
    onEachFeature: (f, l) => l.on("click", () => fichaMunicipio(f.properties.cod)).bindTooltip(() => { const m = REGIC[f.properties.cod]; return m ? `${esc(m.nome)} · ${esc(m.hierarquia)}` : esc(f.properties.nome); }, { sticky: true }),
  });
  const linhas = L.featureGroup(window.REGIC_DADOS.ligacoes.map((x) => L.polyline(x.coords.map(([lo, la]) => [la, lo]), { color: cor("--tinta"), weight: 1.2, opacity: 0.6 })
    .bindTooltip(`${esc(x.o)} → ${esc(x.d)} (${fmt(x.km)} km)`)));
  MOD.camadas.regic = L.featureGroup([poly, linhas]);
  MOD.camadas.regicLinhas = linhas;
  return MOD.camadas.regic;
}
const TEMA_NOME = { saude_bm: "Saúde de baixa e média complexidade", saude_alta: "Saúde de alta complexidade", ensino_superior: "Ensino superior", aeroporto: "Aeroporto", transporte: "Transporte coletivo (rodoviário e hidroviário)" };
function htmlMunicipio(m) {
  const i = m.indicadores || {};
  return `<table class="itens larga"><tbody>
      <tr><td>Hierarquia urbana</td><td class="n">${esc(m.hierarquia)}</td></tr>
      <tr><td>Vinculação imediata</td><td class="n">${esc(m.regiao_imediata)}</td></tr>
      <tr><td>Importância REGIC (0–1)</td><td class="n">${fmt(m.importancia, 3)}</td></tr>
      <tr><td>Índice de atração (pessoas ponderadas de outros municípios)</td><td class="n">${fmt(m.ia || 0)}</td></tr>
      <tr><td>Classe de centralidade de saúde (REGIC)</td><td class="n">${esc(m.classe_saude ?? "—")}</td></tr>
      <tr><td>Leitos por mil habitantes (REGIC, CNES 2018)</td><td class="n">${m.leitos_mil != null ? fmt(m.leitos_mil, 2) : "—"}</td></tr>
      <tr><td>Pessoas (Censo 2022, pelos setores)</td><td class="n">${fmt(i.pessoas || 0)}</td></tr>
      <tr><td>Sem atenção primária a até 5 km</td><td class="n">${fmt(i.sem_atencao_primaria_5km || 0)}</td></tr>
      <tr><td>Sem hospital a até 100 km</td><td class="n">${fmt(i.sem_hospital_100km || 0)}</td></tr>
      <tr><td>Déficit de leitos (2,5 por mil)</td><td class="n">${fmt(i.deficit_leitos || 0)}</td></tr>
      <tr><td>Sem aeródromo público a até 50 km</td><td class="n">${fmt(i.sem_aerodromo_publico_50km || 0)}</td></tr>
    </tbody></table>
    <div class="crit"><h4>Para onde os moradores vão (questionário REGIC)</h4><span></span></div>
    <table class="itens"><tbody>${Object.entries(TEMA_NOME).map(([k, r]) => { const d = m.deslocamentos?.[k];
      return `<tr><td>${r}${d ? `<span class="ev">${esc(d.destino)}: ${fmt(d.pct_destino)} % das respostas · ${fmt(d.n_destinos)} destino(s)</span>` : '<span class="ev">sem deslocamento citado</span>'}</td><td class="n">${d ? kmf(d.dist_media_km, 0) : "—"}</td></tr>`; }).join("")}</tbody></table>
    <p class="nota">Distância média em linha reta, ponderada pelo percentual de cada destino.</p>`;
}
function fichaMunicipio(cod) {
  const m = REGIC[cod]; if (!m) return;
  $("#ficha-conteudo").innerHTML = `<h2 class="ficha-tit">${esc(m.nome)}</h2><p class="ficha-sub">${esc(m.hierarquia)} · REGIC 2018</p>
    <div class="acoes"><button class="primario" data-acao="rel-mun" data-cod="${m.cod}">Relatório do município</button></div>${htmlMunicipio(m)}`;
  abrirFicha();
  if (m.sede) mapa.setView([m.sede[1], m.sede[0]], 8);
  history.replaceState(null, "", `#mun-${cod}`);
}
function relatorioMunicipio(cod) {
  const m = REGIC[cod];
  abrirRelatorio(`<h1>${esc(m.nome)}</h1><p class="cab">Município do Amazonas na rede urbana (REGIC 2018) · gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
    ${htmlMunicipio(m)}<div class="rel-rodape"><p>Fontes: IBGE — REGIC 2018; Censo 2022; CNEFE 2022. Ministério da Saúde — CNES. ANAC — cadastro de aeródromos.</p></div>`);
}

/* ---------- troca de módulo ---------- */
async function trocarModulo(k) {
  MOD.atual = k; MOD.sel = null; selecionada = null;
  $("#ficha").hidden = true;
  document.querySelectorAll(".modulos button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mod === k));
  document.querySelectorAll(".mod").forEach((s) => (s.hidden = s.id !== "mod-" + k));
  for (const c of Object.values(MOD.camadas)) mapa.removeLayer(c);
  if (k === "ramais") { camadaVias.addTo(mapa); estilizarMapa(); mapa.invalidateSize(); return; }
  mapa.removeLayer(camadaVias);
  mapa.setView([-4.6, -63.5], 6); // estado inteiro
  const corpo = $(`#corpo-${k}`);
  try {
    if (DEF[k]) {
      await carregarModulo(k);
      if (!corpo.dataset.pronto) {
        corpo.innerHTML = corpoRanking(k); corpo.dataset.pronto = 1;
        [...new Set(MOD.dados[k].ordem.map((x) => x.p.municipio))].sort((a, b) => a.localeCompare(b, "pt")).forEach((m) =>
          corpo.querySelector("[data-f=mun]").insertAdjacentHTML("beforeend", `<option>${esc(m)}</option>`));
      }
      MOD.camadas[k].addTo(mapa);
      if (k === "aerodromos") { await carregarCobertura(); MOD.camadas.aeroExist.addTo(mapa); }
      filtrarModulo(k);
    } else if (k === "cobertura") {
      await carregarCobertura();
      corpo.innerHTML = corpoCobertura();
      MOD.camadas.cobertura.addTo(mapa);
      if (MOD.sub.cobertura === "aero") MOD.camadas.aeroExist.addTo(mapa);
    } else if (k === "regic") {
      corpo.innerHTML = corpoRegic();
      (await camadaRegic()).addTo(mapa);
    }
  } catch (e) {
    corpo.innerHTML = `<p>Não foi possível carregar este módulo (${esc(e.message)}). Rode scripts/processar_modulos.py.</p>`;
  }
  mapa.invalidateSize();
}

document.querySelector(".modulos").addEventListener("click", (e) => { const b = e.target.closest("[data-mod]"); if (b) trocarModulo(b.dataset.mod); });
document.querySelectorAll(".mod[data-ranking]").forEach((sec) => {
  const k = sec.dataset.ranking, corpo = $(`#corpo-${k}`);
  corpo.addEventListener("input", (e) => { if (e.target.dataset.f) { MOD.dados[k].limite = 60; filtrarModulo(k); } });
  corpo.addEventListener("click", (e) => {
    const a = e.target.closest("[data-acao]")?.dataset.acao;
    if (a === "mais") { MOD.dados[k].limite += 60; return desenharListaMod(k); }
    if (a === "rel-geral") return relatorioGeralMod(k);
    if (a === "csv") return csvMod(k);
    const li = e.target.closest("li[data-id]"); if (li) selecionarMod(MOD.dados[k].itens.find((x) => x.p.id === li.dataset.id));
  });
  corpo.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.id) e.target.click(); });
});
$("#corpo-cobertura").addEventListener("click", (e) => {
  const d = MOD.dados.cobertura, b = e.target.closest("[data-cob]");
  if (b) { MOD.sub.cobertura = b.dataset.cob; $("#corpo-cobertura").innerHTML = corpoCobertura();
    if (b.dataset.cob === "aero") MOD.camadas.aeroExist.addTo(mapa); else mapa.removeLayer(MOD.camadas.aeroExist); return; }
  const li = e.target.closest("[data-lac],[data-uni],[data-aer],[data-mun]"); if (!li) return;
  if (li.dataset.lac) fichaLacuna(d.lacunas[li.dataset.lac]);
  else if (li.dataset.uni) fichaUnidade(d.unidades[li.dataset.uni]);
  else if (li.dataset.aer) fichaAero(d.aero[li.dataset.aer]);
  else fichaMunicipio(li.dataset.mun);
});
$("#corpo-regic").addEventListener("click", (e) => {
  if (e.target.id === "regic-vinc") { e.target.checked ? MOD.camadas.regicLinhas.addTo(MOD.camadas.regic) : MOD.camadas.regic.removeLayer(MOD.camadas.regicLinhas); return; }
  const li = e.target.closest("[data-mun]"); if (li) fichaMunicipio(li.dataset.mun);
});
["#corpo-cobertura", "#corpo-regic"].forEach((s) => $(s).addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("li")) e.target.click(); }));
$("#ficha").addEventListener("click", (e) => {
  const s = e.target.closest("[data-submod]");
  if (s) { MOD.subFicha = s.dataset.submod; return desenharFichaMod(); }
  const a = e.target.closest("[data-acao]")?.dataset.acao;
  if (a === "rel-item") relatorioMod(MOD.sel);
  if (a === "zoom") mapa.setView([MOD.sel.p.lat, MOD.sel.p.lon], 13);
  if (a === "rel-mun") relatorioMunicipio(e.target.dataset.cod);
});

async function abrirPorHashMod() {
  const h = decodeURIComponent(location.hash.slice(1)), [pre, ...resto] = h.split("-"), id = resto.join("-");
  const k = Object.keys(DEF).find((x) => DEF[x].prefixo === pre);
  if (k) { if (MOD.atual !== k) await trocarModulo(k); const it = MOD.dados[k]?.itens.find((x) => x.p.id === id); if (it) selecionarMod(it); }
  if (pre === "mun") { if (MOD.atual !== "regic") await trocarModulo("regic"); fichaMunicipio(id); }
}
window.addEventListener("hashchange", abrirPorHashMod);
PRONTO.then(abrirPorHashMod); // depois que app.js carregou vias e REGIC
