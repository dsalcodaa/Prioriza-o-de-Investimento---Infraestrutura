# Plataforma de Priorização de Obras Viárias — Amazonas

Mapa georreferenciado que ordena **ramais e rodovias estaduais** do Amazonas pelo método AHP do artigo
*Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério* (UNINORTE, 2023),
cruzando dados do IBGE, INPE, IPHAN, OpenStreetMap e relevo SRTM. Gera relatório imprimível por via e do ranking geral.

## Estrutura

```
plataforma/
├── scripts/coletar.py     baixa as bases públicas para data/raw (com cache)
├── scripts/processar.py   monta as vias, calcula os critérios e grava docs/data
├── data/raw/              dados brutos (não publicados)
└── docs/                  plataforma estática (index.html, app.js, style.css, data/)
```

## Atualizar os dados

```
pip install requests shapely pyshp
python scripts/coletar.py --force     # baixa tudo de novo (sem --force usa o cache)
python scripts/processar.py
```

Para testar localmente: `python -m http.server 8000 -d docs` e abrir http://localhost:8000.

## Fontes

| Dado | Fonte | Uso no modelo |
|---|---|---|
| Municípios, malha e população 2022 | IBGE (API Localidades, Malhas v3, SIDRA tabela 4709) | Município da via, contexto |
| Setores censitários + agregados por setor (Censo 2022) | IBGE geoftp / ftp | Nível de ocupação: pessoas e domicílios num raio de 2 km |
| Unidades de conservação e terras indígenas | INPE TerraBrasilis (WFS `prodes-legal-amz`) | Dificuldade: UC e TI |
| Sítios arqueológicos | IPHAN geoserver (WFS `SICG:sitios`) | Dificuldade: sítio a até 1 km |
| Ramais, rodovias AM-xxx, aeroportos, portos/flutuantes, escolas e saúde, comunidades, uso do solo, pontes | OpenStreetMap (Overpass) | Alternativas, vulnerabilidade, uso do solo, entroncamentos, OAE |
| Altitude | OpenTopoData — SRTM 90 m | Dificuldade: relevo; perfil de altitude |
| Drenagem e pontes (BC250 2025) | IBGE geoservicos (WFS `CCAR:BC250_2025_*`) | Travessias de rio, pontes, OAE, várzea (estimada) |

## Critérios (versão corrigida do artigo)

Índice = w<sub>V</sub>·V/5 + w<sub>D</sub>·D/10 + w<sub>F</sub>·(1 − F/10), pesos padrão 0,648 / 0,230 / 0,122 (RC = 0,003).

- **V – Vulnerabilidade (0–5):** um ponto por deficiência: sem porto/aeroporto a até 10 km; sem rota alternativa; maior parte sem pavimento; travessia sem ponte ou ponte de madeira; sem escola/saúde a até 2 km.
- **D – Desenvolvimento (0–10):** uso do solo (0–5) + média das notas de população e de entroncamentos (1–5).
- **F – Dificuldade (0–10, critério de custo):** relevo 1–3, terreno 0–2, UC, sítio, TI, OAE 0–3.

## Limitações conhecidas

- Só entram ramais **com nome** no OpenStreetMap ("Ramal…", "Estrada…", "Vicinal…"). Ramais sem nome no OSM não aparecem.
- INCRA estava fora do ar na coleta: assentamento vem só de nomes no OSM. Confirmar em campo.
- Terreno: o BC250 não traz áreas de inundação no AM; várzea é estimada (altitude média ≤ 30 m a até 2 km de rio) e igapó só por vistoria. Igarapés menores contam como bueiro.
- Agricultura, pontes e pavimento dependem do que está mapeado no OSM/BC250. São marcados como **estimativa** e podem ser ajustados na ficha de cada via (ajustes ficam no navegador e podem ser exportados/importados em JSON).
