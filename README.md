# Ciclo — PWA de acompanhamento menstrual

App pessoal, 100% offline e sem servidor: HTML + CSS + JavaScript próprios, sem frameworks, sem bibliotecas de UI e sem recursos externos em tempo de execução. Os dados ficam apenas no `localStorage` do dispositivo.

> **Versão documentada: v10** (`CACHE_VERSION` em `sw.js`).
> A especificação funcional completa (regras de cálculo, modelo de dados, gestos, PWA) está em [`SPEC.md`](SPEC.md) — incluindo a lista de **problemas conhecidos**.

## O que faz
- Calendário mensal com período real, período previsto, janela fértil, ovulação e TPM previstos (as previsões nunca se misturam com registos reais).
- Registo diário de fluxo (fraco / médio / abundante) e de 4 sintomas (humor, físico, energia, libido) + notas.
- Duração do ciclo e do período calculadas automaticamente a partir dos últimos 6 ciclos (4 em modo perimenopausa).
- Modo perimenopausa: intervalos em vez de datas fixas, filtros mais largos, linguagem neutra.
- Consultas médicas (ginecologia, perimenopausa, análises, exame, outra) com aviso "faltam X dias".
- Popup ℹ️ com a referência de sintomas típicos da fase do dia selecionado.
- Edição rápida por *long-press* num dia do calendário.
- Relatório para consulta (PDF via impressão), cópia de segurança em JSON.
- Idiomas: português (por omissão) e inglês. Tema automático / claro / escuro (Material You em rosa).
- Instalável no telemóvel, com aviso de nova versão sem perda de dados.

## Estrutura
```
index.html           página principal
css/styles.css       estilos (tokens Material You, claro/escuro, responsivo, impressão)
js/i18n.js           traduções (pt, en) e função t()
js/app.js            lógica da aplicação
manifest.json        metadados da PWA (nome, ícones, cores)
sw.js                service worker (offline + atualizações)
icons/               192, 512, maskable 192/512, apple-touch-icon, favicon
README.md            este ficheiro
SPEC.md              especificação funcional e técnica
```

## Publicar no GitHub Pages
1. Cria um repositório (ex. `ciclo`) e envia todos os ficheiros para a raiz da branch `main`.
2. **Settings → Pages → Source → Deploy from a branch**, escolhe `main` e a pasta `/ (root)`.
3. A app fica em `https://<utilizador>.github.io/ciclo/`.
4. No telemóvel, abre o link e usa **"Adicionar ao ecrã principal"** (Android/Chrome) ou **"Adicionar ao Ecrã de Início"** (iOS/Safari).

⚠️ Depois de instalada, **não mudes o nome do repositório nem o domínio**: os dados estão associados a essa origem exata (`localStorage`) e deixavam de ser encontrados.

## Publicar uma versão nova (sem perder dados)
Os dados vivem no `localStorage` (por origem), não nos ficheiros — publicar ficheiros novos nunca os apaga.

1. Edita os ficheiros que precisares.
2. **Sobe sempre** a constante no topo de `sw.js`:
   ```js
   const CACHE_VERSION = 'v11'; // era 'v10'
   ```
   Sem isto o browser pode continuar a servir os ficheiros antigos em cache. Este valor é o que o service worker usa para detetar a nova versão, avisar quem já tem a app ("Nova versão disponível") e apagar o cache antigo (nunca toca nos dados).
3. Acrescenta uma linha ao histórico de versões deste README.
4. Faz commit e push para `main`; o GitHub Pages publica em ~1 minuto.
5. Quem tem a app aberta/instalada vê o banner; ao tocar em **"Atualizar agora"** recarrega já com a versão nova.

### Checklist antes de cada publicação
- [ ] `node -c js/app.js && node -c js/i18n.js && node -c sw.js` sem erros
- [ ] Todos os `getElementById('x')` do JS existem em `index.html` **e** todo o elemento do HTML com texto dinâmico é preenchido pelo JS (verificação inversa: foi a que faltou na v9)
- [ ] Todas as chaves `t('...')` existem em **pt e en**
- [ ] `CACHE_VERSION` subida e README atualizado
- [ ] Fases verificadas num ciclo regular (28 dias → menstrual, folicular, pré-ovulatória, fértil, ovulação, lútea, TPM) e num irregular (modo perimenopausa)
- [ ] Testado num telemóvel real (long-press, swipe, modo escuro, instalação)

## Testar localmente
O service worker exige `http://` ou `https://` (não funciona com `file://`). Na pasta do projeto:
```bash
python3 -m http.server 8000
```
e abre `http://localhost:8000`. Para testar a primeira instalação, usa uma janela anónima; para repor o estado, limpa os dados do site nas ferramentas do browser.

## Ícones
Os ícones atuais (gota branca sobre fundo rosa) foram gerados uma vez com um script Python (Pillow) que **não está incluído** neste repositório. Para os trocar:
- Cria um PNG quadrado 512×512 e gera todos os tamanhos com um gerador online (ex. realfavicongenerator.net ou progressier.com/pwa-icons-generator); substitui os ficheiros em `icons/` mantendo os mesmos nomes.
- Nos ícones *maskable*, mantém o desenho dentro dos 80% centrais (o Android recorta as bordas).

## Resolução de problemas
| Sintoma | Causa provável / o que fazer |
|---|---|
| Alterações publicadas não aparecem no telemóvel | Esqueceste de subir `CACHE_VERSION` em `sw.js`; sobe-a e volta a publicar. |
| Banner "Nova versão disponível" aparece sempre | Confirma que `sw.js` não muda entre pedidos (cache da CDN) e que a versão só sobe quando há alterações reais. |
| Dados desapareceram | O domínio/caminho do site mudou (nova origem = `localStorage` vazio), ou os dados do site foram limpos. Restaura com **Importar** a partir de um backup JSON. |
| Popup/aviso que nunca desaparece | Verifica que a regra global `[hidden] { display: none !important; }` continua no topo de `css/styles.css`. |

## Privacidade
Nada sai do dispositivo: não há servidor, contas, analítica nem pedidos de rede para além dos ficheiros da própria app. O nome opcional (onboarding) só é usado localmente (cabeçalho, relatório, nome do ficheiro de backup). A cópia de segurança JSON **não é cifrada** — trata-a como um documento com dados de saúde.

## Problemas conhecidos (v10)
Lista completa em [`SPEC.md` §13](SPEC.md#13-problemas-conhecidos-e-limitações).
- As funcionalidades de *long-press*, o redesenho Material You e o layout colapsável foram verificados estaticamente e por simulação, mas **ainda não foram testados em dispositivo real**.
- As consultas têm um campo de nota (que aparece no relatório) sem interface para o preencher.
- O backup JSON não é cifrado e a app não tem PIN.

## Histórico de versões (`CACHE_VERSION` em `sw.js`)
- **v1** — primeira versão publicada.
- **v2** — correções: traduções (bug do `window.state`), fluxo/período incremental em vez de bloco fixo, ovulação nunca marcada, período previsto ausente no calendário futuro, janela de médias (6/4 ciclos), modo escuro ilegível em alertas/definições.
- **v3** — botão "Marcar início" desativado em dias que estendem um período existente; confiança em perimenopausa sem dados; marcador extra no dia de ovulação; emojis de sintomas também em dias de período; 2 emojis em ecrã estreito e 4 em ecrã largo; popup ℹ️ com referência de sintomas por fase; onboarding opcional do nome; rodapé; correção do aviso falso de "nova versão".
- **v4** — corrigido o bug que impedia popups/onboarding/aviso de desaparecerem (`display: flex` anulava o atributo `hidden`); regra global `[hidden]{display:none!important}`; Enter no campo do nome guarda.
- **v5** — rodapé com mais contraste ("Piquinho Software — Crafted with altitude. Built with joy."); campos "Duração do ciclo/período" bloqueados (só leitura, com o valor real) quando passam a ser calculados automaticamente.
- **v6** — (experiência) mini-calendários abertos por omissão.
- **v7** — mini-calendários voltam a ficar fechados por omissão, por preferência de ecrã mais compacto.
- **v8** — corrigido bug em que "próxima ovulação" e "próximo período" ficavam presos numa data passada quando passava mais de um ciclo sem novo período registado.
- **v9** — redesenho Material You (paleta tonal rosa, formas em pílula, claro/escuro); ícones SVG próprios; "Consultas" e "Edição" colapsáveis; balão de edição rápida por *long-press* com a data no topo (move o conteúdo real das caixas "Edição"/"Consultas", sem o duplicar).
- **v10** — corrigidos três defeitos da v9: a **fase lútea** nunca era atribuída (os dias a seguir à ovulação apareciam como "folicular"); a **confiança da previsão** não aparecia na interface (agora está no popup ℹ️); os **rótulos** de "Duração do ciclo/período" em Definições estavam vazios (agora preenchidos, com 🔒 quando bloqueados). Os dias de período previsto passam a ser rotulados "Fase menstrual".
