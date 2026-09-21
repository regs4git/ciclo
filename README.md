# Ciclo — PWA de acompanhamento menstrual

## Estrutura
```
index.html          página principal
css/styles.css       todos os estilos (claro/escuro, responsivo, impressão)
js/i18n.js            traduções (pt/en/es/fr/de)
js/app.js             lógica da aplicação
manifest.json         metadados da PWA (nome, ícones, cores)
sw.js                  service worker (offline + atualizações)
icons/                 ícones gerados (192, 512, maskable, favicon, apple-touch)
```

## Publicar no GitHub Pages
1. Cria um repositório novo (ex. `ciclo`) e envia todos estes ficheiros para a raiz da branch `main`.
2. No repositório: **Settings → Pages → Source → Deploy from a branch**, escolhe `main` e pasta `/ (root)`.
3. Fica disponível em `https://<utilizador>.github.io/ciclo/`.
4. Abre esse link no telemóvel → menu do browser → **"Adicionar ao ecrã principal"** (Android/Chrome) ou **"Adicionar ao Ecrã de Início"** (iOS/Safari).

⚠️ Depois de instalado, **nunca mudes o nome do repositório nem o domínio** — os dados ficam associados a essa origem exata (`localStorage`).

## Publicar uma versão nova (sem perder dados do utilizador)
Os dados vivem no `localStorage` do telemóvel, por origem (domínio), não por ficheiro — nunca são apagados ao publicares ficheiros novos.

Para cada atualização:
1. Edita os ficheiros normalmente.
2. Abre `sw.js` e incrementa a constante no topo:
   ```js
   const CACHE_VERSION = 'v2'; // era 'v1'
   ```
   Isto é o único passo obrigatório — é o que faz o service worker detetar a nova versão, avisar quem já tem a app instalada ("Nova versão disponível") e limpar o cache de ficheiros antigo (nunca toca nos dados).
3. Faz commit e push para `main`. O GitHub Pages publica automaticamente em ~1 minuto.
4. Quem já tem a app aberta vê o banner de atualização; ao tocar em "Atualizar agora", recarrega já com a versão nova.

## Gerar/alterar os ícones
Os ícones atuais (gota branca sobre fundo rosa) foram gerados por script Python simples com a biblioteca Pillow — sem precisar de nenhuma imagem externa. Se quiseres um design diferente, a forma mais simples é:
- Desenhar um ícone quadrado 512×512 (ex. em Figma, Canva, ou até uma app de desenho simples), exportar como PNG.
- Usar um gerador online gratuito tipo **realfavicongenerator.net** ou **progressier.com/pwa-icons-generator** — fazes upload da imagem 512×512 e ele devolve automaticamente todos os tamanhos (192, 512, maskable, apple-touch, favicon) já prontos para substituir os da pasta `icons/`.
- Importante: no maskable, mantém o desenho principal dentro dos 80% centrais da imagem (zona seguro), porque o Android recorta as bordas em forma de círculo/quadrado arredondado consoante o telemóvel.

## Testar localmente antes de publicar
Não basta abrir `index.html` a fazer duplo-clique (o service worker exige `http://` ou `https://`, não `file://`). No terminal, dentro da pasta do projeto:
```bash
python3 -m http.server 8000
```
depois abre `http://localhost:8000` no browser.
