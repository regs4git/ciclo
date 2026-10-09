# SPEC — Ciclo (PWA de acompanhamento menstrual)

> **Versão especificada: v10.** Este documento descreve o comportamento **implementado** no código desta versão. Limitações e problemas ainda abertos estão em [§13](#13-problemas-conhecidos-e-limitações), que também lista o que a v10 corrigiu. Idioma da app por omissão: pt-PT.

## Índice
1. [Objetivo e âmbito](#1-objetivo-e-âmbito)
2. [Princípios](#2-princípios)
3. [Arquitetura e ficheiros](#3-arquitetura-e-ficheiros)
4. [Modelo de dados e armazenamento](#4-modelo-de-dados-e-armazenamento)
5. [Regras de cálculo](#5-regras-de-cálculo)
6. [Interface](#6-interface)
7. [Gestos e interações](#7-gestos-e-interações)
8. [Internacionalização](#8-internacionalização)
9. [Temas e design](#9-temas-e-design)
10. [PWA, service worker e versões](#10-pwa-service-worker-e-versões)
11. [Relatório e cópia de segurança](#11-relatório-e-cópia-de-segurança)
12. [Verificação e processo de release](#12-verificação-e-processo-de-release)
13. [Problemas conhecidos e limitações](#13-problemas-conhecidos-e-limitações)
14. [Fora de âmbito e backlog](#14-fora-de-âmbito-e-backlog)

---

## 1. Objetivo e âmbito
Aplicação pessoal e privada para uma utilizadora registar o ciclo menstrual (início/duração do período, intensidade do fluxo, sintomas diários, notas), obter previsões simples (próximo período, ovulação, janela fértil, TPM), marcar consultas médicas e levar um **relatório** para uma consulta. Inclui um modo **perimenopausa**, em que os ciclos irregulares são tratados com intervalos e linguagem neutra, para a utilizadora poder comparar o que sente com a referência geral e discuti-lo com a médica.

Não é um dispositivo médico nem faz diagnóstico; os textos de referência são médias de população (ver §6.5).

## 2. Princípios
- **Offline e local**: sem servidor, contas, analítica ou pedidos de rede para além dos ficheiros da própria app. Os dados nunca saem do dispositivo exceto por exportação manual.
- **Sem dependências**: HTML/CSS/JS próprios; sem React, sem bibliotecas de UI/ícones, sem fontes ou CDNs externas.
- **Real ≠ previsto**: um registo real nunca é sobreposto por uma previsão; previsões nunca são guardadas (são recalculadas a cada render) e têm aspeto distinto (contorno tracejado).
- **Dados do utilizador intocáveis por atualizações**: publicar uma nova versão nunca apaga `localStorage`.
- **Compacto e confortável em telemóvel**: ações frequentes sem scroll (long-press), cartões secundários colapsáveis.
- **pt-PT por omissão**, com inglês disponível.

## 3. Arquitetura e ficheiros
| Ficheiro | Função |
|---|---|
| `index.html` | Estrutura da página, popups/modais, marcação semântica (`<details>` colapsáveis). |
| `css/styles.css` | Tokens Material You (claro/escuro), componentes, responsivo, impressão. |
| `js/i18n.js` | `LANGS`, `I18N` (pt, en) e `t(key, vars)`. |
| `js/app.js` | Estado, persistência, cálculos, renderização, eventos, gestos, relatório, registo do service worker. |
| `sw.js` | Cache versionado, estratégia *network-first*, atualização com confirmação. |
| `manifest.json` | Nome, ícones, cores, `display: standalone`. |
| `icons/` | `icon-192`, `icon-512`, `icon-maskable-192/512`, `apple-touch-icon`, `favicon.ico`. |

Scripts clássicos (não módulos), carregados por ordem: `i18n.js` → `app.js`. Ambos partilham o âmbito global; `state` é declarado com `let` (**não** é propriedade de `window` — `t()` referencia-o diretamente).

Fluxo de renderização: toda a mutação de dados altera `state` e chama `render()`, que redesenha calendário, mini-calendários, barra lateral, alertas, banner de consultas, botão de período, estado/bloqueio das definições e grava em `localStorage`.

## 4. Modelo de dados e armazenamento

### 4.1 Chaves de `localStorage`
| Chave | Conteúdo |
|---|---|
| `ciclo_data` | JSON com todos os dados da utilizadora (ver §4.2). |
| `ciclo_onboarded` | `"true"` depois de o ecrã do nome ter sido guardado ou saltado. Removida ao apagar todos os dados. |
| `ciclo_sw_seen` | `"true"` depois de a app já ter estado sob controlo de um service worker (evita falsos avisos de atualização; ver §10). |

### 4.2 Esquema de `ciclo_data`
```json
{
  "periods":      [{ "start": "2026-02-26", "end": "2026-03-01" }],
  "flow":         { "2026-02-26": 2, "2026-02-27": 3 },
  "symptoms":     { "2026-02-27": { "mood": 0, "physical": 1, "energy": 2, "libido": 1, "notes": "texto" } },
  "appointments": [{ "id": "…", "date": "2026-11-05", "type": "ginecologia", "note": "" }],
  "settings": {
    "cycleLength": 28, "periodLength": 5, "lutealPhase": 14,
    "perimenopauseMode": false, "lang": "pt", "theme": "auto", "userName": ""
  }
}
```
- Datas em `YYYY-MM-DD` (hora local, sem fuso).
- `flow`: `1` fraco, `2` médio, `3` abundante.
- `symptoms.<categoria>`: índice `0`, `1` ou `2` (ver §6.4). Chaves ausentes = não registado. Um dia sem nenhum sintoma/nota não existe no objeto.
- `appointments.type`: `ginecologia` | `perimenopausa` | `analises` | `exame` | `outra`. **Uma consulta por dia.** O campo `note` existe no modelo (e no relatório) mas **não há interface para o editar** (§13).
- `settings.theme`: `auto` | `light` | `dark`. `settings.lang`: `pt` | `en`.
- Compatível com dados antigos: campos em falta assumem valores por omissão ao carregar; `normalizeFlow()` corre ao carregar e ao importar.

### 4.3 Valores por omissão e limites dos campos
| Definição | Omissão | Limites (UI) |
|---|---|---|
| Duração do ciclo (dias) | 28 | 15–90 |
| Duração do período (dias) | 5 | 1–15 |
| Fase lútea (dias) | 14 | 5–25 |

Estas durações só têm efeito quando não há dados suficientes (§5.2); depois são calculadas.

## 5. Regras de cálculo

### 5.1 Períodos e fluxo (construção incremental)
- **Marcar início** (botão, dia não futuro): cria `{start: dia, end: dia}` (1 dia) e `flow[dia] = 2`. A duração **não** é pré-atribuída; cresce dia a dia.
- **Bloqueios**: dia futuro → alerta; dia dentro de um período existente → alerta de sobreposição.
- **Remover início**: se o dia é o `start` de um período, o botão passa a "Remover início"; pede confirmação e apaga o período **e** os `flow` dos seus dias.
- **Estender**: um dia (não futuro) que seja exatamente o dia seguinte ao `end` de um período é *extensível*. Escolher nesse dia uma intensidade de fluxo estende `end` até esse dia e regista o fluxo. Nesses dias o botão "Marcar início" fica **desativado** (tooltip a explicar), para não criar um segundo período colado.
- **Mudar intensidade**: escolher outro nível num dia do período substitui `flow[dia]`.
- **"Sem fluxo"**: tocar na intensidade já ativa desliga-a. Só tem efeito no **último dia** do período: encolhe `end` um dia (ou remove o período se ficasse vazio) e apaga `flow[dia]`. Noutros dias é ignorado (evita buracos a meio de um período).
- **`normalizeFlow()`**: todo o dia de um período sem `flow` recebe `2`. No render, `getFlowLevel` usa `2` como valor por omissão.

### 5.2 Médias e janela de cálculo
- Janela `N`: **6** ciclos (**4** em modo perimenopausa).
- Intervalos entre inícios consecutivos considerados nos últimos `N+1` períodos. Válidos: **18–60** dias (**15–90** em perimenopausa); os restantes são descartados.
- **Duração média do ciclo** = média arredondada dos intervalos válidos; se há menos de 2 períodos ou nenhum intervalo válido → `settings.cycleLength`.
- **Duração média do período** = média arredondada de `(end − start + 1)` nos últimos `N` períodos (mín. 1); sem períodos → `settings.periodLength`.
- **Desvio-padrão** dos intervalos válidos (0 se < 2) — usado no intervalo do modo perimenopausa.

### 5.3 Previsões
Todas calculadas a partir dos períodos **reais**; nada previsto é guardado.
- **Ovulação seguinte** (`getNextOvulation(dia)`): toma o último período com `start ≤ dia`; `ovulação = start + (cicloMédio − faseLútea)`. Enquanto `ovulação < dia`, avança `start` um ciclo e recalcula. Devolve sempre uma data **≥ ao dia**. Sem períodos → sem previsão.
- **Ovulação do ciclo do dia** (`getCycleOvulationFor(dia)`): toma o último período com `start ≤ dia`, avança `start` de ciclo em ciclo enquanto `start + cicloMédio ≤ dia` (ciclos projetados) e devolve `start + (cicloMédio − faseLútea)`. Pode ser **anterior** ao dia. É a base da classificação de fases (§5.4); `getNextOvulation` serve só o campo "próxima ovulação".
- **Próximo período** (`getNextPeriod(dia)`): `start + cicloMédio`, a avançar um ciclo de cada vez enquanto `< dia`.
- **Períodos previstos** (desenhados no calendário): a partir do `start` do último período real, `start + k·cicloMédio` (k ≥ 1) com duração = duração média do período, até hoje + 13×31 dias. Só se desenham em **dias futuros**.
- **Modo perimenopausa** com ≥ 3 períodos: "próximo período" é mostrado como **intervalo** `[data − d, data + d]`, com `d = max(2, round(σ))` dias. Fora disso mostra a data exata.
- **Dia do ciclo**: `(dia − start do último período ≤ dia) + 1`; sem período → "sem período registado".

### 5.4 Fases do ciclo
Sete fases com texto de referência próprio. O calendário só **desenha** (tracejado) as fases ovulação, fertilidade elevada/moderada, TPM e período previsto, e apenas em dias futuros; folicular e lútea só aparecem no cartão "Dia" e no popup ℹ️.

| Fase | Critério |
|---|---|
| Menstrual | o dia pertence a um período **real**, ou é um dia de período **previsto** (futuro) |
| Ovulação | `diff = 0` |
| Fertilidade elevada | `diff ∈ [−2, −1]` |
| Pré-ovulatória (fertilidade moderada) | `diff ∈ [−5, −3]` ou `diff = +1` |
| TPM | faltam 1–7 dias para o próximo período |
| Folicular | `diff < −5` |
| Lútea | `diff > +1` |

Aqui `diff = dia − getCycleOvulationFor(dia)` (positivo depois da ovulação). Ordem de avaliação: menstrual → ovulação → fertilidade elevada → moderada → TPM → folicular → lútea; sem períodos registados → "sem referência".

Com `cicloMédio = 28`, período de 4 dias e `faseLútea = 14`, a ovulação cai no **dia 15** e um ciclo completo percorre: menstrual 1–4 → folicular 5–9 → moderada 10–12 → elevada 13–14 → ovulação 15 → moderada 16 → lútea 17–21 → TPM 22–28. O mesmo padrão repete-se nos ciclos projetados e em ciclos mais longos (verificado com ciclos de 28 e 41 dias).

### 5.5 Confiança da previsão
| Condição | Resultado |
|---|---|
| Perimenopausa, < 2 períodos | 🟡 poucos dados |
| Perimenopausa, ≥ 2 períodos | 🔄 "Padrão variável (perimenopausa)" (neutro, sem juízo) |
| < 3 períodos | 🟡 poucos dados |
| < 2 intervalos válidos | 🟡 poucos ciclos completos |
| coef. de variação < 5% | 🟢 alta |
| coef. de variação < 10% | 🟠 média |
| caso contrário | 🔴 baixa |

Onde é mostrada: no **popup ℹ️** (linha "Confiança da previsão: 🟢 …", logo a seguir ao título da fase) e no **relatório**. Já não existe no cartão "Dia" (§6.4).

### 5.6 Alertas (topo da página)
- **Aviso** se passaram mais de **45** dias (**75** em perimenopausa) desde o início do último período.
- **Informação** se há menos de 2 períodos registados ("registe pelo menos 2 períodos…").

### 5.7 Consultas
- Uma por dia; qualquer data (passada, hoje ou futura). Tipos e ícones: 🩺 ginecologia, 🔄 perimenopausa, 🧪 análises, 🩻 exame, 📌 outra.
- **Banner** (topo): consulta mais próxima com data ≥ hoje — "Faltam X dias para {tipo} em {data}", ou "{tipo} hoje" / "{tipo} amanhã". Clicável: salta para o dia e seleciona-o.
- Remover pede confirmação. Consultas passadas ficam no histórico e no relatório.

## 6. Interface

### 6.1 Cabeçalho
Título "🌸 Ciclo", subtítulo (ou o nome da utilizadora, se existir; escondido em ecrãs ≤ 420 px), seletor de idioma (🇵🇹 PT / 🇺🇸 EN) e botão de tema (SVG), **sempre na mesma linha** (sem `flex-wrap`). O botão de tema alterna `auto → claro → escuro`.

### 6.2 Calendário
- Navegação: ◀ **Hoje** ▶ (SVG), nome do mês. Passado **sem limite**; futuro até **12 meses** (o ▶ desativa-se no limite). "Hoje" volta ao mês atual e seleciona hoje.
- Grelha de 7 colunas, células quadradas. Prioridade de desenho de cada dia:
  1. **Período real** — preenchimento sólido por intensidade: fraco `#f4a49e`, médio `#e5544a`, abundante `#b71c1c`.
  2. **Dia futuro**: período previsto (tracejado, cor de período) → senão fase prevista (ovulação verde, fertilidade elevada azul escuro, moderada azul claro, TPM amarelo), sempre com **contorno tracejado**.
  3. Dia selecionado: contorno de destaque. Hoje: contorno + ponto indicador (o ponto desaparece se hoje estiver selecionado).
- **Emojis de sintomas** (também sobre dias de período), por prioridade: humor, físico, energia, libido. Máx. **2** em ecrã < 600 px, **4** em ecrã ≥ 600 px (reavalia ao rodar o ecrã).
- Ícone da consulta (canto superior direito) e 🥚 no dia de ovulação prevista.

### 6.3 Mini-calendários (2 meses seguintes)
`<details>` **fechado por omissão**; abre com um toque no cabeçalho. Mostra os 2 meses após o mês visível, com as mesmas regras de desenho (não selecionáveis).

### 6.4 Cartão "Dia" e botão de período
- Data selecionada e linha fundida **"Dia N · Fase"** com botão ℹ️ (SVG).
- Próxima ovulação e próximo período (data ou intervalo, §5.3).
- Botão de largura total "Marcar/Remover início do período" (§5.1), desativado em dias futuros e em dias extensíveis.

### 6.5 Popup de fase (ℹ️)
Abre com o texto da fase do **dia selecionado** (real ou previsto, incluindo "Fase menstrual" nos dias de período reais e previstos): título, **linha de confiança da previsão** (§5.5), texto de referência (começa pelo comentário hormonal; energia, humor, físico, libido), nota geral de população e, **só com o modo perimenopausa ativo**, um parágrafo extra sobre sintomas fora da fase esperada. Fecha **apenas** pelo **X** dedicado.
Sem períodos registados mostra "Sem referência ainda".

Categorias de sintomas (3 opções cada):
| Categoria | Opções (índice 0 / 1 / 2) |
|---|---|
| Humor | 😊 😐 😔 |
| Físico | 🙂 😣 😖 |
| Energia | ⚡ 🔋 🪫 |
| Libido | 🔥 ❤️ ❄️ |

Tocar na opção ativa desliga-a. Dias futuros não aceitam sintomas, fluxo nem notas.

### 6.6 "Consultas" e "Edição" (colapsáveis)
Dois `<details>` **fechados por omissão**, alternativa sempre disponível ao long-press:
- **Consultas**: consulta do dia (com ✕ para remover) ou os 5 tipos como botões (um toque marca).
- **Edição**: estado do dia, linha de **Fluxo** (só em dias de período ou extensíveis), 4 linhas de sintomas (rótulo + 3 botões na mesma linha) e notas.

### 6.7 Definições
Campos de duração do ciclo, duração do período, fase lútea, interruptor **modo perimenopausa** e uma linha de estado ("valores calculados automaticamente (N ciclos) • média: X dias" ou "valores predefinidos…").
**Bloqueio dos campos** (`updateSettingsFieldsLock`): ciclo bloqueado com **≥ 2** períodos, período bloqueado com **≥ 1**; quando bloqueados mostram o valor real calculado e uma dica (tooltip). A fase lútea **nunca** é calculada e fica sempre editável. Os campos voltam a desbloquear se os dados forem apagados. Quando um campo está bloqueado, o seu rótulo ganha um 🔒 ("Duração do ciclo (dias) 🔒"). Os rótulos dos três campos são sempre preenchidos (por `applyStaticTexts` e `updateSettingsFieldsLock`).

### 6.8 Cópia de segurança, relatório, rodapé
Três ações numa linha (SVG): **Exportar**, **Importar**, **Apagar** (§11). Botão de **relatório** (PDF). Rodapé: *"Piquinho Software — Crafted with altitude. Built with joy."*, com contraste de texto normal.

### 6.9 Onboarding do nome (opcional)
Modal na **primeira utilização** e outra vez **logo após "Apagar todos os dados"**; campo de texto, **Guardar** (ou Enter) e **Saltar**. O nome é usado em: subtítulo do cabeçalho, título do relatório e nome do ficheiro de backup. Não bloqueia o uso da app.

### 6.10 Balão de edição rápida (long-press)
Manter premido um dia **~450 ms** (dedo parado: movimento > 10 px cancela) abre um balão `position: fixed` junto a esse dia, com a **data no topo** e um **X** de fecho:
- dia passado ou hoje → conteúdo da **Edição** (fluxo, sintomas, notas);
- dia futuro → conteúdo das **Consultas**.

Implementação: o balão **move** os elementos reais (`#editorPanelBody` / `#appointmentPanelBody`) para dentro de si e devolve-os ao `<details>` de origem ao fechar — nunca duplica elementos, por isso lógica, IDs e estado são os mesmos. O `<details>` de origem é recolhido enquanto o conteúdo está no balão. O balão seleciona o dia, posiciona-se abaixo do dia (ou acima, se não couber) e pode tapar dias vizinhos. Fecha com o X, **Escape** ou toque fora (o "clique fantasma" que o browser gera logo após o long-press é ignorado uma vez). Em desktop (rato) não há long-press: usam-se os cartões colapsáveis.

## 7. Gestos e interações
| Gesto | Efeito |
|---|---|
| Toque curto num dia | Seleciona o dia. |
| Long-press (~450 ms) num dia | Balão de edição rápida (§6.10). |
| Swipe horizontal na grelha (> 45 px e mais horizontal que vertical) | Mês seguinte/anterior (respeita os limites). |
| Escape | Fecha o balão se aberto; caso contrário vai para "hoje". |
| Enter no campo do nome | Guarda o nome. |

Long-press e swipe partilham os mesmos eventos `touch*` (um temporizador + limiar de movimento) para não entrarem em conflito. Sem long-press por rato.

## 8. Internacionalização
- Idiomas: **pt** (omissão) e **en**. `t(key, vars)` substitui `{var}`; chave em falta num idioma cai para pt; em falta em ambos devolve a própria chave.
- Chaves dinâmicas (concatenadas em código): `phaseTitle*`, `phaseText*`, `phaseShort*` (sufixos: `Menstrual`, `Follicular`, `FertilityModerate`, `FertilityHigh`, `Ovulation`, `Luteal`, `Pms`, `Unknown`) e `theme*` (`Auto`, `Light`, `Dark`).
- Nomes de meses/dias da semana vêm de `I18N[lang].months/weekdays`; a data do balão usa `toLocaleDateString` (`pt-PT` / `en-US`).
- Para acrescentar um idioma: adicionar entrada a `LANGS` e um bloco completo a `I18N` (traduzir valores, nunca chaves). Estão preparados (e propositadamente fora desta versão) es/fr/de.

## 9. Temas e design
- **Material You sem biblioteca**: tokens CSS derivados do rosa-semente `#e91e63`. Claro: `--primary #9c1850`, `--primary-light #ffd9e2` (container), `--bg #fff8f8`, `--card-bg #fff`, `--surface-variant #f3dde3`, `--text #201a1b`. Escuro: `--primary #ffb1c8`, `--primary-light #7d1245`, `--bg #1c1416`, `--card-bg #271e20`, `--surface-variant #524347`, `--text #ece0e1`.
- Formas: cartões `--radius 20px`, campos `12px`, botões de texto em pílula (`999px`), botões de ícone circulares com preenchimento tonal.
- Tema **automático** (`prefers-color-scheme`) com sobreposição manual `data-theme="light|dark"` guardada em `settings.theme`.
- Ícones de ação/navegação em **SVG inline** (`currentColor`); emoji mantidos para identidade (🌸, fases, sintomas, consultas).
- **Regra global obrigatória**: `[hidden] { display: none !important; }` no topo do CSS. Sem ela, regras como `display: flex` anulam o atributo `hidden` (causou popups que nunca fechavam na v3).
- Impressão: `@media print` esconde tudo menos `#reportContent`.
- Responsivo: `clamp()` na tipografia base; `safe-area-inset`; layout a 2 colunas a partir de 860 px.

## 10. PWA, service worker e versões
- **Instalável**: `manifest.json` (`display: standalone`, ícones *any* e *maskable*, `theme_color #e91e63`), `start_url` e `scope` relativos (funciona em sub-caminho do GitHub Pages).
- **Cache**: `ciclo-cache-<CACHE_VERSION>`. Instalação: cada ficheiro de `PRECACHE_URLS` é pedido individualmente (uma falha isolada não aborta a instalação). `activate`: apaga caches `ciclo-cache-*` antigos e faz `clients.claim()`.
- **Estratégia**: *network-first* para pedidos GET da mesma origem, a guardar a resposta em cache; offline → cache → `index.html`.
- **Atualização com confirmação**: o worker novo **não** faz `skipWaiting` sozinho; o banner "Nova versão disponível — Atualizar agora" envia `SKIP_WAITING`; ao mudar o controlador a página recarrega.
- **Falso aviso na primeira instalação**: na primeira ativação o worker faz `clients.claim()`, o que dispara `controllerchange` sem haver atualização real. Por isso o aviso/reload só são aceites depois de `ciclo_sw_seen === "true"` (definido quando já existe controlador ou o worker ativa). Em modo anónimo isto evita o aviso na 1.ª visita.
- **Versionar**: a única ação obrigatória por publicação é subir `CACHE_VERSION` em `sw.js`. O `localStorage` é independente do cache e nunca é apagado.
- **Pré-requisito**: HTTPS (ou `localhost`). Nunca mudar a origem depois de instalada.

## 11. Relatório e cópia de segurança

### 11.1 Relatório (PDF por impressão)
`window.print()` sobre `#reportContent`. Conteúdo:
- Título "Ciclo — Relatório de {nome}" (ou genérico), data de geração.
- **Resumo**: duração média do ciclo, duração média do período, regularidade (§5.5).
- **Gráfico de barras** da duração dos ciclos (HTML/CSS, sem bibliotecas).
- **Tabela de períodos**: início, fim, duração, fluxo predominante — os **últimos 12** períodos registados (ou os que existirem, sem preencher vazio).
- **Tabela de consultas**: todas, por data (tipo, nota).
- Sem períodos → mensagem "sem dados suficientes".

### 11.2 Exportar / importar / apagar
- **Exportar**: JSON `{version: "2.0", exportedAt, periods, symptoms, flow, appointments, settings}` → `ciclo_backup[_Nome]_YYYY-MM-DD.json`. **Não cifrado.**
- **Importar**: exige as chaves `periods` e `symptoms`; pede confirmação; **substitui** os dados (funde `settings` com os valores por omissão); corre `normalizeFlow()`.
- **Apagar**: duas confirmações; repõe dados e durações por omissão (ciclo 28, período 5, lútea 14), modo perimenopausa desligado e nome vazio; **mantém** idioma e tema; remove `ciclo_onboarded` e volta a mostrar o ecrã do nome.

## 12. Verificação e processo de release
Verificações usadas na v10:
- **Estáticas**: sintaxe (`node -c`), equilíbrio de chavetas CSS e tags HTML, todos os `getElementById` do JS existem no HTML, todas as chaves `t()` (incluindo as dinâmicas da §8) existem em pt e en.
- **Verificação inversa**: todo o elemento do HTML que deve receber texto dinâmico é referenciado pelo JS (os únicos não referenciados são contentores estáticos: `appointmentDetails`, `editorDetails`, `reportBtnWrap`). Foi a verificação que faltava e que deixou passar os defeitos da v9.
- **Execução da lógica real** (carregando `app.js` com um DOM simulado): fases ao longo de um ciclo regular de 28 dias, em ciclos projetados, vários ciclos sem registo, sem períodos, com 1 período e com um ciclo de 41 dias em modo perimenopausa; dias de período previsto ancorados em "hoje"; preenchimento dos rótulos das definições, bloqueio com 🔒 e popup (título e confiança) em pt e en.

**Continua a não existir teste em dispositivo real nem uma suite de testes automáticos no repositório** (os testes acima foram executados fora dele). Antes de publicar: testar num telemóvel (long-press, swipe, tema escuro, instalação, atualização) e, idealmente, com um ciclo regular de 28 dias e outro irregular (modo perimenopausa).

Checklist de publicação: ver `README.md`.

## 13. Problemas conhecidos e limitações

### Corrigidos na v10
Defeitos presentes na v9, confirmados lendo/executando o código e agora verificados como resolvidos (§12):
1. **A fase lútea nunca era atribuída** (nem o +1 dia de fertilidade moderada): a fase era calculada contra a *próxima* ovulação, sempre ≥ ao dia, logo `diff ≤ 0`. Os dias 16–21 de um ciclo de 28 dias apareciam como "Folicular". Passou a usar a ovulação do ciclo do dia (`getCycleOvulationFor`, §5.3).
2. **Confiança da previsão invisível**: `#phasePopupConfidence` nunca era preenchido (caixa vazia no popup) e a linha tinha saído do cartão "Dia". Passou a ser escrita por `openPhasePopup()`.
3. **Rótulos vazios em Definições**: `lblCycleLength` e `lblPeriodLength` nunca recebiam texto (um comentário remetia para uma função inexistente). Passam a ser preenchidos, com 🔒 quando o campo está bloqueado.
4. *(relacionado com o 1)* Dias de **período previsto** eram rotulados "Folicular" no cartão "Dia"/popup, em contradição com a cor no calendário. Passam a ser "Fase menstrual".

### Abertos
5. **Nunca testado em dispositivo real**: long-press (temporizador, posicionamento do balão, clique fantasma), layout Material You e contraste no escuro foram só verificados estaticamente/por simulação.
6. **Consultas sem campo de nota na UI** (o campo existe e aparece no relatório, mas fica sempre vazio).
7. **Períodos adjacentes**: marcar início no dia imediatamente **anterior** ao início de outro período não é bloqueado (a verificação só impede iniciar dentro de um período existente).
8. **Balão**: enquanto aberto, expandir o cartão de origem mostra-o vazio (o conteúdo está no balão); o balão não se reposiciona após `render()` (só atualiza conteúdo) nem fecha ao redimensionar.
9. **Sem long-press por rato** (por desenho; ver §6.10).
10. **Desempenho**: os períodos previstos são recalculados por cada célula da grelha (irrelevante para o volume de dados atual).
11. **Backup não cifrado** e sem proteção de acesso à app (sem PIN).
12. **Configurações extremas de duração** (testadas executando a lógica; a UI só valida os limites individuais de cada campo, §4.3): (a) com **fase lútea curta** (testado com 5 dias, ciclo 28) as janelas fértil e de TPM sobrepõem-se; prevalece a fértil pela ordem da §5.4, o TPM só aparece nos dias 26–28 e não há fase lútea; (b) com **fase lútea maior ou quase igual ao ciclo** a ovulação previsível cai antes do início do ciclo ou dentro dos dias de período (testado: ciclo 20/lútea 25 e ciclo 15/lútea 14), pelo que nesses casos não aparecem ovulação nem janela fértil — só lútea e TPM.

## 14. Fora de âmbito e backlog
Decididos como **fora desta versão**:
- PIN / bloqueio da app e trabalho de acessibilidade.
- Idiomas es / fr / de (estrutura pronta).
- Notificações/lembretes fora da app (só o banner interno).
- Sincronização entre dispositivos / contas / servidor.
- Sintomas específicos de perimenopausa (afrontamentos, insónia) como categoria própria.

Ideias consideradas e **adiadas** (baixo custo):
- Comparar os sintomas registados com a referência da fase e destacar divergências; resumo de divergências no relatório (útil para a consulta).
- Atalhos ←/→ para mudar de dia; guardar notas com *debounce*; manter o ponto "hoje" quando o dia está selecionado.
- Edição do campo de nota das consultas.
