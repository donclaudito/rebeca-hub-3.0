# Rebeca Hub 3.0 — versão na nuvem (Base44)

A mesma ideia do Rebeca Hub 3.0 — **importar imagens de uma pasta → a narração nasce delas** —
mas **alojada na Base44**. Deixa de precisar de ter um servidor a correr no seu computador,
e o problema do `spawn EPERM` desaparece: não há processos locais envolvidos.

---

## O que muda em relação à versão local

| | Versão local (`rebeca-hub-3.0`) | Esta versão (nuvem) |
|---|---|---|
| Servidor no seu PC | precisa | **não precisa** |
| Chave da API | fica no seu PC | **fica como segredo na Base44** |
| Narração (texto) | servidor local → DeepSeek | **função de nuvem** → DeepSeek |
| Voz (áudio) | PowerShell + ffmpeg (SAPI) | **no próprio browser** (Web Speech) |
| Formato do áudio | MP3 | WebM/Opus |
| Vídeo com transições | **sim** (ffmpeg) | **sim, montado no browser** (WebM) |
| Trilha sonora | ficheiro do computador | ficheiro do computador |
| Funciona offline | sim | não (precisa de internet) |

**Resumindo:** ganha independência do seu computador; perde o MP3 e o MP4
(o vídeo daqui sai em WebM). A versão local continua a existir para essas duas coisas.

---

## Quem está a usar a app (conta Base44)

No canto superior direito aparece **quem está a usar** a app: o nome (ou o email,
se não houver nome), com o email e o perfil no detalhe do rato.

- **Entrar é opcional.** A app funciona sem conta: importar imagens, gerar a
  narração, montar o vídeo e guardar projetos no computador funcionam à mesma.
  Isto é de propósito — obrigar a entrar fecharia a app a quem só a quer
  experimentar.
- **Entrar** abre um formulário de email e palavra-passe, com a opção de **criar
  conta**. Ao criar conta, a Base44 manda um **código para o email**, que se
  escreve no mesmo formulário para confirmar.
- **Sair** termina a sessão e o topo volta a dizer *sem conta*.
- Se a Base44 não responder (por exemplo, a app ainda não está publicada), o topo
  diz *sem conta* e **a app continua a funcionar** — nunca fica presa à espera da
  conta.

A autenticação é a do SDK da Base44 (`base44.auth`), por isso a palavra-passe
nunca passa por código nosso.

---

## Antes de começar

Precisa de:

- **Node.js 20.19 ou superior** (já tem o 26)
- **Base44 CLI** — já está instalada nesta máquina (versão 0.1.15)
- **Uma conta na Base44** com o seu Rebeca Hub 2.0 (já tem)

---

## Publicar — passo a passo

### Atalho: duplo clique em `PUBLICAR.cmd`

Se a sessão da CLI já existir, isto publica o site e as funções. Se ainda não,
pede primeiro o login (mostra um código e um link) e depois publica sozinho.

### À mão, passo a passo

### 1. Criar o app na Base44

```powershell
cd "E:\youtube rebeca2\rebeca-hub-3.0-base44"
base44 create
```

Escolha um nome (ex.: *Rebeca Hub 3.0*). No fim, ele mostra o **id do app**.

### 2. Ligar este código ao app

```powershell
base44 link
```

Isto preenche o `base44/.app.jsonc` com o id certo.

### 3. Guardar a chave da DeepSeek como segredo

**Este é o passo que resolve o seu problema** — a chave passa a viver na Base44,
nunca no seu computador nem no browser:

```powershell
base44 secrets set DEEPSEEK_API_KEY=sk_a_sua_chave
```

Para usar outro serviço, o nome do segredo muda:

| Serviço | Nome do segredo |
|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |

Confirme que ficou guardado:

```powershell
base44 secrets list
```

> **Regra desta app: nenhum crédito de integrações da Base44.** Toda a IA
> (narração, prompts, temas e a análise do Diretor) chama a DeepSeek
> diretamente com este segredo — em `base44/shared/deepseek.ts`. Nenhuma função
> usa `integrations.Core.InvokeLLM`, por isso a fatura das integrações fica a
> zero; só conta o saldo da sua conta DeepSeek. Há um teste que falha se alguém
> voltar a meter um `InvokeLLM` no código (`npm test` → `testes/deepseek.mjs`).

### 4. Pôr o id no ficheiro de ambiente

Crie um ficheiro **`.env.local`** na raiz do projeto com:

```
VITE_BASE44_APP_ID=o_id_do_seu_app
```

### 5. Desenvolver localmente (para ver antes de publicar)

```powershell
npm install
npm run dev
```

Abre em `http://localhost:5173`. Aqui o site corre no seu PC, mas a narração já é
pedida à função de nuvem — é o melhor sítio para testar.

### 6. Publicar

```powershell
base44 deploy
```

Isto publica a função **e** o site. No fim, abra o site publicado:

```powershell
base44 site open
```

A partir daí, a app funciona em **qualquer computador**, sem nada instalado.

### Se aparecer "Could not validate credentials"

A sessão da CLI expirou. O `deploy` precisa de sessão e o login é **por código de
dispositivo**, com prazo de poucos minutos:

```powershell
base44 login
```

Aparece um `Verification code` e um link. Abra o link, escreva o código e
confirme — **dentro do prazo**, senão expira e é preciso repetir. Entre com a
conta **dona do app**, senão o deploy falha por permissão.

Depois do login, o `deploy` volta a funcionar. **Faça o login num terminal à sua
frente**: o código aparece na hora e não tem de ser copiado de lado nenhum.

---

## Testar a função antes de publicar

Não quer publicar às cegas? Há um teste que corre a **mesma lógica** da função
de nuvem contra a API real:

```powershell
cd "E:\youtube rebeca2\rebeca-hub-3.0-base44"
node TESTAR-FUNCAO.mjs sk_a_sua_chave deepseek
```

Ele mostra o que o modelo respondeu, cena por cena. Assim sabe se a chave e o
modelo funcionam **antes** de gastar tempo com deploy.

## Testes automáticos (sem browser, sem chave)

Há uma bateria que corre o código real da pasta `public/` contra um browser falso
(canvas, MediaRecorder, AudioContext, DOM e relógio controlado) e apanha defeitos
antes de publicar:

```powershell
npm test
```

Cobre as transições sem saltos, o tempo de cada cena, a entrada do áudio, o botão
Parar, a trilha em ciclo a 16 %, o corte da narração em blocos de legenda e o
ficheiro `.srt`, a letra da música distribuída pelo tempo, a repetição das imagens
até a música acabar, o painel da página e a ligação entre os `id` do HTML e o
JavaScript. Detalhes em `testes/LEIAME.md`.

---

## Como funciona

```
public/index.html      A página (sem framework, sem build)
public/app.js          Importar, reordenar, gerar, gravar áudio, ZIP
public/video.mjs       Montagem do vídeo no browser: transições + gravação WebM
public/musica.mjs      Trilha sonora: lê o ficheiro do utilizador, toca em ciclo
public/style.css       Estilo
src/base44Client.js    Cliente do SDK da Base44
base44/functions/generateNarration/entry.ts
                       A FUNÇÃO DE NUVEM: recebe as imagens, fala com o modelo
                       de visão e devolve a narração. É aqui que vive a chave.
TESTAR-FUNCAO.mjs      Testa a lógica da função localmente
testes/                Testes automáticos (npm test) — ver testes/LEIAME.md
```

### O percurso de uma imagem

1. Você arrasta uma pasta → as imagens ficam **só na memória do browser**;
2. A imagem é **reduzida para 1280 px** antes de sair (o modelo encolhe tudo para
   ~1300 px de qualquer forma — enviar 2,6 MB por imagem não acrescenta nada);
3. A página envia as imagens reduzidas à função `generateNarration`;
4. A função lê a chave do segredo e chama o modelo **com visão**;
5. Volta a narração, uma frase por imagem, em sequência;
6. O áudio é gerado **no seu browser** e fica disponível para ouvir e descarregar.

**A chave nunca chega ao browser.** É a razão de existir a função de nuvem.

### O vídeo e a trilha (aba 🎬 Vídeo)

Não há ffmpeg na nuvem, por isso o vídeo é montado **no próprio browser**: as
imagens são desenhadas num canvas com as transições escolhidas, o som é tocado
por cima e tudo é gravado em tempo real com `MediaRecorder`.

**O que entra** — três formas de montar:

| Modo | O que precisa | O que sai |
|---|---|---|
| 🎙️ Só narração | narração gerada | as imagens com a voz |
| 🎙️🎵 Narração + música | narração gerada + trilha | a voz com a música por baixo |
| 🎵 Só música | imagens + trilha | as imagens com a música, **sem voz nenhuma** |

No modo **só música** não é preciso gerar narração: cada imagem fica o tempo
escolhido em “Cada imagem” (2 s a 8 s) e a trilha toca em ciclo por baixo. É o
modo para fazer um vídeo de ambiente, uma capa animada ou uma montagem de fotos.

**Duração** — duas formas de decidir quanto tempo o vídeo dura:

| Opção | O que faz |
|---|---|
| 🖼️ As imagens | o vídeo dura o que durar a narração das cenas |
| 🔁 Até acabar a música | as **imagens repetem em ciclo** até a trilha acabar |

A segunda resolve o caso de um vídeo curto (poucas imagens) com uma música longa:
em vez de a música ser cortada a meio, as imagens voltam a passar — pela mesma
ordem, com a narração e as legendas a acompanhar cada passagem. A contagem é por
**passagens inteiras**: o vídeo pode passar um pouco do fim da música (nunca fica
cortado a meio de uma imagem). Uma música enorme (5 horas) fica limitada a 100
passagens, para não gerar milhares de cenas.

**Enquadramento** — decide como a imagem é cortada quando as proporções não batem
certo com o vídeo (uma foto 4:3 num vídeo 16:9, ou uma imagem horizontal num vídeo
vertical):

| Opção | O que faz |
|---|---|
| 🎯 Seguir o assunto | procura o personagem na imagem e centra o recorte nele |
| ⭕ Cortar pelo centro | recorte centrado de sempre; perde o assunto se ele estiver deslocado |

O recorte inteligente calcula onde está o "assunto" — as zonas com mais variação
de cor e detalhe, que é onde estão caras, olhos, contornos e o corpo do
personagem — e desloca a janela do vídeo para o apanhar. Tem uma ligeira
preferência pelo centro (para não saltar para uma árvore ao canto), mas o assunto
manda. A análise é feita numa cópia pequena da imagem (no máximo 160 px), por isso
é rápida mesmo no telemóvel.

**Legendas** (💬, ligadas por omissão) — a narração é cortada em blocos curtos e
desenhada no fundo do vídeo, e sai também um ficheiro **`.srt`** com os mesmos
blocos, para a faixa de legendas do YouTube. A regra de legibilidade é a do
Rebeca Hub 2.0:

- no máximo **9 palavras** e **42 caracteres** por bloco, quebrando antes numa
  vírgula/travessão quando dá (corta na pausa da fala, não no meio da ideia);
- **nenhuma palavra é descartada** — se não couber em 2 linhas, a fonte encolhe
  até 55 % e, no limite, mostra todas as linhas;
- cada bloco fica no ecrã em proporção às suas palavras, com um piso de 0,8 s
  **compensado nos blocos longos**, para a soma não invadir a cena seguinte;
- estilo fixo, igual ao 2.0: fonte **Luckiest Guy**, cor **amarela (#FBBF24)**,
  contorno preto grosso e sombra. Sem rede para o Google Fonts, cai na alternativa
  local e o vídeo sai na mesma.

O resumo por baixo dos controlos diz quantos blocos vão sair e mostra o primeiro,
para se ver como a fala foi cortada antes de gravar dois minutos de vídeo.

### A letra da música como legenda (aba 🎬 Vídeo)

No painel **Letra da música** cola-se a letra, **uma linha por verso**, e o botão
**💬 Usar a letra como legenda** passa a letra a ser a legenda do vídeo — em vez
da narração (as duas juntas enchiam o ecrã).

- O tempo é dividido **igualmente** pelos versos: uma música de 3:00 com 20 versos
  dá 9 s a cada um. O painel diz o tempo de cada verso, para se ver logo se a
  divisão faz sentido.
- **▶️ Ver a letra a passar** toca a música e mostra os versos um a um, para
  confirmar o sincronismo antes de gravar.
- A letra sai também no ficheiro **`.srt`**, com os mesmos versos.
- **A letra não precisa de narração nenhuma.** Se colar a letra e escolher a
  música, o vídeo é montado como um vídeo de letra: uma imagem de cada vez, ao
  ritmo escolhido em “Cada imagem”.
- Para acertar o tempo, o caminho é juntar ou separar linhas da letra (a divisão
  é igual entre versos).

**Porque não há transcrição automática:** transcrever música cantada com
instrumentos por cima é notoriamente pouco fiável, e a app não tem nenhuma chave
que aceite áudio — a da DeepSeek é só de texto e visão. Colar a letra dá um
resultado certo, custa zero e o utilizador pode corrigir o que quiser. Um dia,
com uma chave da OpenAI, o Whisper (~0,006 dólares por minuto) pode alimentar
este mesmo painel: a parte de temporizar e legendar já está feita.

- **Grava em tempo real** — um vídeo de 2 minutos leva 2 minutos.
- **Sai em WebM, em VP8 por omissão.** O controlo **Ficheiro** tem duas opções:
  **⬛ Compatível (VP8)**, que abre no Windows, no VLC, no YouTube e nos browsers, e
  **🟪 Mais pequeno (VP9)**, que dá ficheiros menores mas **o Windows recusa abrir**
  (erro `0xC00D36C4`). O VP8 vem primeiro porque foi ele que se provou legível em
  todo o lado — o Rebeca Hub 2.0 também punha o VP8 primeiro. Se o browser não
  souber o codec escolhido, cai no outro em vez de falhar.
- Ao acabar, aparece uma caixa com o resultado e o botão **▶️ Ver o vídeo aqui**, que
  o toca dentro da página: é o que distingue «o ficheiro está mau» de «o leitor do
  Windows não o abre». Há também **💾 Guardar o vídeo…** e **💾 Guardar as legendas
  (.srt)…**.
- **Guardar pergunta ONDE.** No Chrome e no Edge abre-se a janela «Guardar como»,
  onde se escolhe a pasta e o nome. No Firefox e no Safari, que não têm essa janela,
  os botões passam a dizer «Descarregar» e o ficheiro vai para a pasta das
  transferências, como antes. Cancelar a janela **não** guarda nada — cancelar é
  uma decisão, não uma falha.
- **Para abrir o ficheiro no Windows, use o VLC** — lê WebM sem instalar nada. O
  leitor da Microsoft recusa WebM mesmo quando o ficheiro está bom.
- Não mude de janela enquanto grava; o botão **⏹ Parar** responde logo.

A **trilha sonora** vem de um ficheiro do seu computador (MP3, WAV, M4A, OGG…),
tal como as imagens. A app **não traz música dentro dela**, de propósito: trazer
faixas obrigaria a alguns MB por faixa e à contabilidade de licença de cada uma.
A música toca **em ciclo, a 16 % do volume**, por baixo da voz — o mesmo valor que
o Hub 2.0 usava. Ficheiros com mais de 15 minutos são cortados (a música repete de
qualquer forma) e um ficheiro ilegível nunca estraga o vídeo: ele sai sem música e
a página diz porquê.

---

## Limites desta versão

- **Sem MP3.** O áudio sai em **WebM/Opus**, porque converter para MP3 exige ffmpeg.
  O Chrome, o Edge, o Firefox, o VLC e o DaVinci leem WebM sem problema.
- **Sem MP4.** O vídeo é gravado no browser, e o browser só grava WebM. Para MP4,
  use a versão local (que tem ffmpeg). Para ver o WebM no Windows, use o **VLC**.
- **A gravação demora o tempo do vídeo**, porque é feita em tempo real.
- **Precisa de internet** para gerar a narração (o áudio e o vídeo funcionam
  offline, porque é o browser que os faz).
- **A voz é a do sistema** onde estiver a usar a app. Num telemóvel, as vozes são
  as do telemóvel.
- **A trilha não fica guardada** entre sessões: um ficheiro de música não cabe no
  armazenamento do browser sem o encher. Escolhe-se de novo a cada sessão.

---

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| "Falta o VITE_BASE44_APP_ID" | Crie o `.env.local` (passo 4) e reinicie o `npm run dev`. |
| "Falta o segredo DEEPSEEK_API_KEY" | Corra `base44 secrets set DEEPSEEK_API_KEY=sk_...` (passo 3). |
| "A chave da API foi recusada" | Confirme o nome do segredo e o serviço escolhido nas Configurações. |
| "A conta deste serviço está SEM SALDO" | Carregue créditos no painel do serviço, ou mude de serviço. |
| A voz não sai | Autorize o microfone. No Chrome/Edge funciona; alguns browsers não gravam áudio. |
| O áudio ficou vazio | Aumente o volume das colunas — no modo microfone, a gravação capta o som da sala. |
| "o modelo não devolveu JSON válido" | Volte a tentar; se persistir, troque de modelo nas Configurações. |