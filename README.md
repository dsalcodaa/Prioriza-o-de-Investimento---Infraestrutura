# Plataforma de Priorização de Obras de Infraestrutura — Amazonas

Mapa georreferenciado que ordena **ramais e rodovias estaduais** do Amazonas pelo método AHP do artigo
*Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério* (UNINORTE, 2023),
cruzando o traçado de ramais da SEINFRA-AM (REV06, 16/05/2025) com dados do IBGE, CNES, INPE, IPHAN, OpenStreetMap e relevo SRTM. Gera relatório imprimível por via e do ranking geral, com texto explicando a posição de cada item.

Módulos (abas no topo do painel):

| Módulo | O que ordena | Critérios |
|---|---|---|
| Ramais e rodovias | 905 trechos SEINFRA + rodovias AM-xxx | AHP do artigo (V, D, F) + peso opcional do REGIC (0–30 %) |
| Terminais flutuantes | Núcleos do Censo 2022 à margem de rio largo ou lago | Vulnerabilidade de transporte (0–5), demanda (moradores), REGIC |
| Aeródromos | Núcleos com 1.000+ moradores | Vulnerabilidade (sem aeródromo público ou nenhum a 50 km, sem via, hospital a 100 km, REGIC aeroporto), demanda (pessoas sem aeródromo a 50 km), REGIC |
| Saúde e cobertura | — | Onde falta atenção primária (5 km), demanda atendida por unidade (referência 3.500 pessoas/equipe), aeródromos e pessoas atendidas, indicadores por município (leitos 2,5/mil) |
| REGIC | 62 municípios | Hierarquia urbana, vínculos e deslocamentos do REGIC 2018 (resumo em `../REGIC IBGE/REGIC_2018_RESUMO.md`) |

Núcleos = setores urbanos e aglomerados rurais do Censo 2022 agrupados por contiguidade, mais comunidades formadas por domicílios do CNEFE 2022 em setores rurais (≥ 100 pessoas).

## Estrutura

```
plataforma/
├── scripts/coletar.py     baixa as bases públicas para data/raw (com cache)
├── scripts/processar.py   monta as vias, calcula os critérios e grava docs/data
├── scripts/processar_modulos.py  REGIC, núcleos, terminais, aeródromos e cobertura de saúde
├── data/raw/              dados brutos (não publicados)
└── docs/                  plataforma estática (index.html, app.js, style.css, data/)
```

## Atualizar os dados

```
pip install requests shapely pyshp
python scripts/coletar.py --force     # baixa tudo de novo (sem --force usa o cache)
python scripts/processar.py
python scripts/processar_modulos.py   # precisa da pasta ../REGIC IBGE e de openpyxl, numpy
```

Para testar localmente: `python -m http.server 8000 -d docs` e abrir http://localhost:8000.

## Fontes

| Dado | Fonte | Uso no modelo |
|---|---|---|
| Municípios, malha e população 2022 | IBGE (API Localidades, Malhas v3, SIDRA tabela 4709) | Município da via, contexto |
| Traçado dos ramais e vicinais (907 trechos) | SEINFRA-AM, shapefile REV06 de 16/05/2025 | Alternativas (ramais), revestimento, situação, custo estimado |
| Setores censitários + agregados por setor (Censo 2022) | IBGE geoftp / ftp | Nível de ocupação: pessoas e domicílios num raio de 2 km, detalhado por setor |
| CNEFE 2022 (endereços) | IBGE ftp | Rateio da população do setor pelos domicílios dentro do raio; escolas; saúde; estabelecimentos agropecuários |
| Estabelecimentos de saúde | Ministério da Saúde, API CNES (`apidadosabertos.saude.gov.br/cnes`) | Vulnerabilidade: sem saúde a até 2 km |
| Unidades de conservação e terras indígenas | INPE TerraBrasilis (WFS `prodes-legal-amz`) | Dificuldade: UC e TI |
| Sítios arqueológicos | IPHAN geoserver (WFS `SICG:sitios`) | Dificuldade: sítio a até 1 km |
| Rodovias AM-xxx, aeroportos, portos/flutuantes, comunidades, uso do solo, pontes, vias que cruzam | OpenStreetMap (Overpass) | Alternativas (rodovias), vulnerabilidade, uso do solo, entroncamentos, OAE |
| Altitude | OpenTopoData — SRTM 90 m | Dificuldade: relevo; perfil de altitude |
| Drenagem e pontes (BC250 2025) | IBGE geoservicos (WFS `CCAR:BC250_2025_*`) | Travessias de rio, pontes, OAE, várzea (estimada) |
| Massas d'água (BC250 2025) | IBGE geoservicos | Rios largos e lagos: candidatos a terminal |
| Aeródromos públicos e privados | ANAC dados abertos | Aeródromos existentes, cobertura |
| REGIC 2018 | IBGE (planilhas da pasta `REGIC IBGE`) | Hierarquia, atração e deslocamentos por município |

## Critérios (versão corrigida do artigo)

Índice = w<sub>V</sub>·V/5 + w<sub>D</sub>·D/10 + w<sub>F</sub>·(1 − F/10), pesos padrão 0,648 / 0,230 / 0,122 (RC = 0,003).

- **V – Vulnerabilidade (0–5):** um ponto por deficiência: sem porto/aeroporto a até 10 km; sem rota alternativa; maior parte sem pavimento; travessia sem ponte ou ponte de madeira; sem escola/saúde a até 2 km.
- **D – Desenvolvimento (0–10):** uso do solo (0–5) + média das notas de população e de entroncamentos (1–5).
- **F – Dificuldade (0–10, critério de custo):** relevo 1–3, terreno 0–2, UC, sítio, TI, OAE 0–3.

## Limitações conhecidas

- Ramais vêm do shapefile da SEINFRA (cada trecho do cadastro é uma alternativa). Entroncamentos = outras vias (SEINFRA ou OSM) que encostam no traçado a até 30 m.
- Catálogo de Escolas do INEP: a página bloqueia acesso automatizado. Escolas vêm do CNEFE 2022 (IBGE). Para usar o INEP, baixe o CSV do catálogo e coloque em `data/raw/`.
- INCRA estava fora do ar na coleta: assentamento vem só de nomes no OSM. Confirmar em campo.
- Terreno: o BC250 não traz áreas de inundação no AM; várzea é estimada (altitude média ≤ 30 m a até 2 km de rio) e igapó só por vistoria. Igarapés menores contam como bueiro.
- Agricultura, pontes e pavimento dependem do que está mapeado no OSM/BC250. São marcados como **estimativa** e podem ser ajustados na ficha de cada via (ajustes ficam no navegador e podem ser exportados/importados em JSON).
