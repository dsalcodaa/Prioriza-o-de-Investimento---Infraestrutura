# Contexto do projeto — Priorização de Investimento em Infraestrutura (Amazonas)

Documento para quem continua o trabalho, pessoa ou agente. O `README.md` explica como rodar e quais são as fontes. Aqui ficam o objetivo, as decisões tomadas, o estado atual e o que falta.

Última atualização: 06/11/2026.

## 1. Objetivo

Plataforma web georreferenciada para a SEINFRA-AM decidir **o que construir ou melhorar primeiro** no Amazonas:

- ramais e rodovias estaduais;
- terminais hidroviários flutuantes;
- aeródromos estaduais;
- cobertura de saúde e de aeródromos (onde falta e qual demanda cada unidade atende);
- papel de cada município na rede urbana (REGIC 2018).

Público: engenheiros e gestores públicos. A plataforma é estática (GitHub Pages) e cada item tem ficha, explicação da posição no ranking e relatório imprimível em PDF.

## 2. Base metodológica

- **Artigo de referência:** *Modelo de Priorização de Obras de Infraestrutura de Rodovias e Vicinais para o Estado do Amazonas com base em Análise Multicritério* (UNINORTE, 2023). Método AHP (Saaty) com três critérios: Vulnerabilidade (V), Desenvolvimento (D) e Dificuldade (F).
- **Referências complementares:** Banco Mundial (IPF, 2016), BID (PPP Américas, 2021) e Venâncio/ENAP (2019). Delas vêm a restrição orçamentária, a análise de sensibilidade e a regra de basear a prioridade na necessidade local.
- **Síntese dos PDFs:** `../METODOLOGIA_PRIORIZACAO_RESUMO.md`. A seção 5 traz as correções feitas no artigo:
  - pesos trocados no texto do artigo; os pesos corretos são V 0,648, D 0,230, F 0,122 (RC = 0,003);
  - Dificuldade é critério de **custo**: entra como (1 − F/10);
  - o Gráfico 2 do artigo não é reproduzível com os dados publicados.
- **Resumo do REGIC 2018:** `../REGIC IBGE/REGIC_2018_RESUMO.md`.

## 3. Como cada módulo ordena

### Ramais e rodovias

Índice = (1 − r) × [0,648·V/5 + 0,230·D/10 + 0,122·(1 − F/10)] + r × importância REGIC do município.

- r vai de 0 a 30 % (padrão 15 %, aba Pesos). Com r = 0 o ranking é o do artigo.
- Pesos AHP editáveis na aba Pesos, com cálculo da razão de consistência.
- Empate: vence a via com mais moradores no entorno.
- Itens marcados como **estimativa** (agricultura, pontes, pavimento, várzea) podem ser ajustados na ficha. Os ajustes ficam no navegador e podem ser exportados e importados em JSON.

### Ranking geral (aba Ranking geral)

Mostra, para cada via, a posição no ranking oficial e em três perfis de decisão, mais a coluna Cenários (em quantos dos 4 rankings a via está entre as 100 primeiras). A tabela pode ser impressa. O ranking oficial continua sendo o do artigo; os perfis medem a robustez da prioridade.

- Índice do perfil = soma ponderada, na escala de 0 a 1, de:
  - Vulnerabilidade (V/5);
  - População: pessoas dos setores censitários (Censo 2022) cruzados pelo traçado, com setores a até 2 km se nenhum for cruzado; escala log com teto no percentil 99;
  - Produção: endereços de produção do CNEFE 2022 a até 1 km, ou seja, espécie 3 (estabelecimento agropecuário) mais espécie 6 cujo nome indica produção (fazenda, sítio, granja, curral, casa de farinha…); escala log com teto no percentil 99;
  - Facilidade (1 − F/10).
- Pesos AHP: critério dominante 3× os outros dois e 5× a facilidade → 0,532 / 0,185 / 0,185 / 0,097 (RC 0,002). Os perfis são Necessidade (V dominante), Benefício social (população) e Escoamento da produção (produção). O REGIC fica fora.
- A vistoria pode informar o número de propriedades produtivas. O valor substitui o CNEFE no perfil e define o item agrícola do D (1 ou 0).
- A população dos setores cruzados (`pop_setores`) só é usada nos perfis. O D do ranking oficial continua com a população no raio de 2 km.
- Os julgamentos 3 e 5 são referência de trabalho e devem ser validados pela SEINFRA-AM.

### Ranking por população

- Ramais e rodovias (aba Por população): ordem pelas pessoas dos setores censitários cruzados pelo traçado (`pop_setores`), empate pela posição oficial. Tabela imprimível com pessoas por km.
- Terminais: seletor "Ordenar por população atendida" no módulo (moradores do núcleo). O relatório do módulo segue a ordem escolhida.

### Terminais flutuantes e aeródromos

Índice = 3/7·V/5 + 3/7·demanda/5 + 1/7·R (AHP: V e demanda com peso igual, cada um 3 vezes o REGIC; RC = 0).

- **Candidatos a terminal:** núcleos a até 1 km de rio largo ou lago (BC250) e com 50 pessoas ou mais. A cidade de Manaus fica fora: tem mais de 200 mil pessoas.
- **Locais que já têm terminal saem do ranking:** terminal flutuante da SEINFRA-AM (31, `../8-TERMINAIS FLUTUANTES/TERMINAIS FLUTUANTES.shp`) ou porto, porto flutuante ou terminal hidroviário do OSM a até 2 km do núcleo (píer não conta). Na última execução saíram 101 e ficaram 1.071 candidatos. A lista aparece no módulo. Os terminais da SEINFRA também entram na distância ao terminal mais próximo (item "sem terminal a 5 km").
- **Vulnerabilidade do terminal (0–5):** sem porto a até 5 km; sem via a até 2 km; sede municipal a mais de 30 km; sem atenção primária a até 5 km; moradores do município viajam mais de 200 km para saúde básica e média (REGIC).
- **Demanda do terminal:** faixas de moradores 200 / 500 / 1.000 / 5.000.
- **Candidatos a aeródromo:** núcleos com 1.000 pessoas ou mais. Raio de atendimento de 50 km.
- **Vulnerabilidade do aeródromo (0–5):** sem aeródromo público a 50 km; sem nenhum aeródromo a 50 km; sem via a até 5 km; hospital a mais de 100 km; moradores viajam mais de 150 km para usar aeroporto (REGIC).
- **Demanda do aeródromo:** pessoas a até 50 km sem aeródromo público, em faixas de 2.000 / 5.000 / 10.000 / 20.000.

### Núcleos (unidade de análise de terminais e aeródromos)

- Setores do Censo 2022 com situação urbana ou aglomerado rural (CD_SIT 1, 2, 3, 5, 6, 7), unidos por município com folga de 150 m.
- Só a maior mancha urbana do distrito-sede recebe o nome "Cidade de …". Pedaços soltos viram "Área urbana isolada de …".
- Comunidades em setores rurais: domicílios do CNEFE 2022 agrupados (células de cerca de 220 m, vizinhança de 2 células), com 100 pessoas ou mais.
- Nome da comunidade: localidade da escola mais próxima (até 2 km), senão lugar do OpenStreetMap (até 3 km), senão "Comunidade sem nome".

### Saúde e cobertura

- Atenção primária: CNES tipos 1, 2, 15, 32, 71, 72. Hospital: tipos 5, 7, 15.
- Falta atenção primária quando a unidade mais próxima está a mais de 5 km.
- Demanda por unidade: pessoas cuja unidade mais próxima é aquela, comparadas à referência de 3.500 pessoas por equipe.
- Leitos: referência de 2,5 por mil habitantes (Portaria MS 1.101/2002).

### REGIC

Importância (0 a 1) = 0,7 × nota da hierarquia + 0,3 × índice de atração (escala log, relativa a Manaus).

Notas da hierarquia: 1A, 1B e 1C = 1,0; 2A 0,9; 2B 0,85; 2C 0,8; 3A 0,7; 3B 0,65; 4A 0,5; 4B 0,45; 5 = 0,25.

### Interface (módulo Ramais e rodovias)

- Abas: Ranking (oficial), Ranking geral (oficial + 3 perfis + Cenários), Por população, Pesos AHP, Camadas, Método.
- Ficha da via: subabas Notas (com bloco Vistoria de campo: revestimento, pontes, produção), Por que esta posição, Território.
- Botão **Camadas** no canto do mapa: liga e desliga qualquer camada em qualquer módulo, com "Ativar todas" e "Desativar todas".
- Relatórios imprimíveis: relatório da via (resumo executivo + 10 seções), relatório geral do ranking, tabela do Ranking geral, tabela Por população, relatórios dos módulos.

## 4. Estrutura e fluxo de dados

```
scripts/coletar.py            baixa as bases públicas para data/raw (cache; não publicado)
scripts/processar.py          ramais e rodovias: critérios V, D, F → docs/data/vias.geojson e demais camadas
scripts/processar_modulos.py  REGIC, núcleos, terminais, aeródromos, saúde → docs/data
docs/index.html, style.css    interface
docs/app.js                   mapa, ranking de ramais, fichas, pesos, relatórios
docs/modulos.js               abas Terminais, Aeródromos, Saúde e cobertura, REGIC
docs/textos.js                base editorial única: descrição de critérios e indicadores, natureza da informação, fontes e limitações
```

Os textos da ficha, da aba Método e do relatório em PDF saem de `textos.js` e das funções de análise de `app.js`. Ao mudar um cálculo, revise o texto correspondente.

Arquivos de entrada fora desta pasta, usados pelos scripts:

- traçado SEINFRA: `../3-RAMAIS/1-TRAÇADO RAMAIS/RAMAIS - TRAÇADO REV06 - 16-05-2025/VICINAIS-RAMAIS-ESTRADAS - SEINFRA 2025.shp`;
- planilhas do REGIC: `../REGIC IBGE/`;
- terminais flutuantes da SEINFRA: `../8-TERMINAIS FLUTUANTES/TERMINAIS FLUTUANTES.shp` (nomes com dupla codificação no DBF, corrigidos no script). O registro "Comunidade Filadélfia" (Benjamin Constant) está na longitude −59,63°, longe do município: conferir a coordenada com a SEINFRA.

Rodar localmente: `python -m http.server 8000 -d docs`.

Ao mudar `app.js`, `modulos.js` ou `style.css`, aumente o `?v=` correspondente no `index.html` para evitar cache antigo no navegador.

## 5. Números da última execução

| Item | Valor |
|---|---|
| Vias ordenadas (SEINFRA + rodovias AM) | 918 |
| Núcleos | 1.995 (1.173 comunidades rurais do CNEFE) |
| Pessoas cobertas pelas unidades de população | 3.941.613 |
| Candidatos a terminal (sem terminal a até 2 km) | 1.071 (101 retirados por já terem terminal) |
| Terminais flutuantes no cadastro da SEINFRA | 31 |
| Endereços de produção agropecuária no CNEFE (espécie 3 + espécie 6 por nome) | cerca de 67 mil |
| Candidatos a aeródromo | 126 |
| Lacunas de atenção primária | 1.412 |
| Pessoas sem atenção primária a até 5 km | 524.726 |
| Pessoas sem hospital a até 100 km | 67.578 |
| Pessoas sem aeródromo público a até 50 km | 898.887 |
| Aeródromos ANAC públicos / privados e pistas OSM | 22 / 83 |
| Unidades de atenção primária / hospitais | 1.138 / 130 |

## 6. Decisões e regras do projeto

- Números e nomes aparecem por extenso. Nada de valores cortados ou abreviados na interface e nos relatórios.
- Cada posição no ranking tem um texto que explica o motivo (aba "Por que esta posição" e PDF).
- O REGIC tem peso pequeno de propósito: a prioridade segue a necessidade local, como recomendam o artigo e os bancos multilaterais.
- Escolas vêm do CNEFE 2022 porque o catálogo do INEP bloqueia acesso automatizado. Não contornar o bloqueio.
- Dados brutos (`data/`) não vão para o repositório.
- Premissa de pavimento e pontes (06/11/2026): ramal com obra na coluna Situação do REV06 (CONCLUÍDO ou EM OBRA, 63 ramais) é considerado pavimentado; os demais (OBRA EXTINTA incluída) ficam em leito natural e sem ponte em nenhuma travessia de rio. A ficha tem o bloco Vistoria de campo para registrar pavimento e pontes constatados; o registro substitui a premissa.
- Redação: português formal, técnico e acessível. Cada resultado explica o que foi avaliado, o que foi encontrado e como pesou no índice. Ausência de registro em base pública não é tratada como inexistência comprovada.
- O relatório da via abre com um **resumo executivo** de uma página e meia para secretário e governador: posição e motivo, pessoas atendidas (setores cruzados e entorno de 2 km), custo do cadastro (R$ 2.500.000 por km em todo o cadastro), nível de dificuldade (0 a 3 baixa, 4 a 6 média, 7 a 10 alta), robustez nos 4 cenários, situação de cada tema, sensibilidade e o que confirmar em vistoria. O texto do relatório é justificado e a explicação de critérios e indicadores aparece em caixa "Como funciona".
- Depois do resumo, o relatório da via segue 10 seções: identificação; síntese; contexto territorial; transporte (V); desenvolvimento (D); projeto e execução (F); posição no ranking (com REGIC); sensibilidade e validação; memória metodológica; fontes e limitações.

## 7. Limitações e próximos passos

1. **Distâncias em linha reta.** O percurso real no Amazonas é fluvial. Próximo passo: rede fluvial navegável com tempo de viagem (ANTAQ, DNIT, SEINFRA).
2. **Portos e terminais incompletos.** O OpenStreetMap tem 367 pontos e o cadastro da SEINFRA, 31 terminais flutuantes (já integrados). Falta integrar ANTAQ e DNIT (IP4).
3. **Operador dos aeródromos.** A ANAC não informa se o aeródromo público é estadual ou municipal. Cruzar com o cadastro da SEINFRA.
4. **Equipes de saúde.** Integrar o e-Gestor ou o CNES de equipes para saber quantas equipes cada unidade tem.
5. **Assentamentos por nome.** A busca por termos como `pa ` no nome associa registros indevidos (exemplo: “Pousada SPA” no Ramal do Km 8 – AM-352). A plataforma sinaliza esses casos; a regra em `scripts/processar.py` (linha da lista `assent`) deve ser revista ou substituída pela base do INCRA.
6. **Nomes de comunidades.** Alguns nomes vindos do endereço das escolas no CNEFE são genéricos (por exemplo "Rio Andira", "Comunidade"). Revisar com o cadastro da SEINFRA ou em campo.
7. **REGIC 2018.** Atualizar quando sair a versão baseada no Censo 2022. O shapefile de rotas do REGIC ainda não foi usado.
8. **INCRA** estava fora do ar na coleta. Assentamentos vêm só de nomes no OpenStreetMap.
9. **Várzea e igapó** são estimados pelo relevo. Confirmar por vistoria.

## 8. Análises feitas só na conversa (não estão no site)

Simulações pedidas pelo usuário para comparar com o modelo atual antes de decidir se vão para o site.

- **Por que ramais da região de Manaus lideram:** dos 100 primeiros, 93 são dos 13 municípios ligados a Manaus por estrada. Esses ramais somam mais V, porque 67 % não têm porto ou aeroporto a 10 km, contra 24 % no interior. Somam também mais pontos de REGIC.
- **Sem REGIC (r = 0):** Km 8 – AM-352 continua em 1º; o interior passa de 7 para 9 ramais no top 100.
- **Regra de município isolado** (fora dos 13 municípios ligados por estrada → item "sem intermodal" = 1): o interior chega a 29 ramais no top 100 com REGIC 15 % e a 41 com REGIC 0 %. Km 8 continua em 1º.
- **Indicador de porto e aeroporto:** é o item 2.1.5 do artigo (não foi criado pela plataforma).
- **Locais de estudo do artigo:** Janauari e Jandira (Iranduba), Manápolis (Autazes, segundo o usuário) e Novo Remanso (perto de Itacoatiara).
- **Leitura do artigo:** o método não está errado. Ele responde à pergunta da vulnerabilidade de transporte; trocar os pesos ou critérios responde outras perguntas (população, produção). A conclusão do artigo já prevê essa adaptação.
- **Recomendação para uso governamental:**
  - manter o ranking do artigo como oficial;
  - usar os perfis como análise de sensibilidade e selo de robustez;
  - pesos dos perfis definidos pela SEINFRA em ato formal;
  - não oferecer seletor livre de perfil para decisão.

## 9. Pendências que dependem do usuário

- Levar ao site a regra de município isolado ou o ranking sem REGIC (simulados só na conversa).
- Validar com a SEINFRA os julgamentos AHP dos perfis (3 e 5) e o raio de 2 km para "já tem terminal".
- Corrigir a regra de assentamento por nome (`assent` em `scripts/processar.py`) ou trocar pela base do INCRA.
- Revisar a lista dos 13 municípios ligados a Manaus por estrada usada nas simulações.
- Definir se OBRA EXTINTA conta como obra na premissa de pavimento.
- Conferir com a SEINFRA a coordenada da "Comunidade Filadélfia" (Benjamin Constant).
- Decidir se a população dos setores cruzados (`pop_setores`) também substitui a população de 2 km no D do ranking oficial (hoje só é usada nos perfis e na aba Por população).

## 10. Histórico

- 05/11/2026: leitura dos PDFs de metodologia e síntese em MD.
- 05/11/2026: primeira versão da plataforma (ramais e rodovias, AHP, fichas, relatórios).
- 05/11/2026: troca para o traçado de ramais da SEINFRA (REV06), população por setor rateada pelo CNEFE, escolas e saúde (CNES e CNEFE), drenagem do BC250.
- 05/11/2026: módulos de Terminais, Aeródromos, Saúde e cobertura e REGIC; explicação da posição de cada item; peso REGIC nos ramais.
- 05/11/2026: correções na aba Terminais (numeração da lista filtrada, camadas dos ramais ocultas fora da aba, manchas urbanas isoladas).
- 06/11/2026: repositório publicado (dsalcodaa/Prioriza-o-de-Investimento---Infraestrutura) e GitHub Pages ativo em main /docs: https://dsalcodaa.github.io/Prioriza-o-de-Investimento---Infraestrutura/
- 06/11/2026: reformulação editorial da plataforma e do relatório em PDF (base `textos.js`, natureza de cada informação, alerta de possível inconsistência no indicador de assentamento). Cálculos e ranking inalterados.
- 06/11/2026: premissa de pavimento e pontes pela coluna Situação do REV06 e bloco Vistoria de campo.
- 06/11/2026: aba Ranking geral (ranking oficial + perfis Necessidade, Benefício social e Escoamento da produção, coluna Cenários, tabela imprimível); população por setores cruzados; produção pelo CNEFE (`data/raw/ibge_cnefe_producao_AM.json`); vistoria de produção. Ranking oficial inalterado.
- 06/11/2026: aba Por população (ramais), ordenação por população nos terminais, botão Camadas no mapa (todas as camadas, em qualquer módulo), terminais flutuantes da SEINFRA como camada e retirada do ranking dos locais que já têm terminal.
- 06/11/2026: resumo executivo no relatório da via, texto justificado e caixas "Como funciona"; `../Relatorio_Ramal_Km8_AM-352.pdf` regerado.
