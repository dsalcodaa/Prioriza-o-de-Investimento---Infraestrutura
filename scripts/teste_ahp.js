// Confere o AHP do site contra o artigo (pesos 0,648 / 0,230 / 0,122; RC 0,0032). Uso: node scripts/teste_ahp.js
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
const pares = { vd: 3, vf: 5, df: 2 }, RI3 = 0.58;
eval(src.slice(src.indexOf("function ahp()"), src.indexOf("/* ---------- notas")));
const r = ahp();
const perto = (a, b, t) => Math.abs(a - b) < t;
if (!(perto(r.w.V, 0.648, 1e-3) && perto(r.w.D, 0.230, 1e-3) && perto(r.w.F, 0.122, 1e-3) && perto(r.CR, 0.0032, 2e-4)))
  throw new Error("AHP difere do artigo: " + JSON.stringify(r));
console.log("AHP confere com o artigo", r.w, "RC", r.CR.toFixed(4));
