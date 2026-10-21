// ============================================================
//  Água em movimento.
//
//  Desloca os pixéis da imagem com ruído suave, na GPU, só na zona da água:
//  a força cresce com a profundidade e é zero acima da linha. Junta um brilho
//  que corre com a crista da onda — é isso que faz ler-se como água em vez de
//  uma imagem a tremer.
//
//  Não é IA e não chama nada lá fora: o mesmo export dá sempre o mesmo vídeo.
//
//  LIMITE DO BROWSER: só se podem ter ~16 contextos WebGL vivos ao mesmo tempo.
//  Um por cena (25 cenas) rebentava com isso. Por isso os efeitos são criados
//  à medida da necessidade e libertados por ordem de uso — nunca há mais de
//  três vivos (a cena que entra, a que sai e a seguinte).
// ============================================================

export const NIVEIS_AGUA = {
  suave: { forca: 0.0045, velocidade: 0.45, brilho: 0.1 },
  medio: { forca: 0.0075, velocidade: 0.6, brilho: 0.13 },
  forte: { forca: 0.012, velocidade: 0.85, brilho: 0.17 },
};

export const MAX_VIVOS = 3;

const VERTEX = `#version 300 es
in vec2 pos;
out vec2 vUv;
void main() {
  vUv = vec2(pos.x * 0.5 + 0.5, 1.0 - (pos.y * 0.5 + 0.5));
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAGMENTO = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform float uTime;
uniform float uAmp;
uniform float uVel;
uniform float uLinha;
uniform float uBrilho;

in vec2 vUv;
out vec4 outCor;

float ruido(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float ruidoSuave(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = ruido(i);
  float b = ruido(i + vec2(1.0, 0.0));
  float c = ruido(i + vec2(0.0, 1.0));
  float d = ruido(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  float yTopo = uv.y;

  // Força crescente com a profundidade; zero acima da linha da água.
  float prof = clamp((yTopo - uLinha) / max(0.0001, 1.0 - uLinha), 0.0, 1.0);
  prof = smoothstep(0.0, 1.0, prof);

  float n1 = ruidoSuave(vec2(uv.x * 6.0, yTopo * 16.0 + uTime * uVel));
  float n2 = ruidoSuave(vec2(uv.x * 15.0 + 4.0, yTopo * 34.0 + uTime * uVel * 1.8));

  float deslocX = (n1 - 0.5) + (n2 - 0.5) * 0.45;
  float deslocY = (n2 - 0.5) * 0.35;

  uv.x = clamp(uv.x + deslocX * uAmp * prof, 0.0, 1.0);
  uv.y = clamp(uv.y + deslocY * uAmp * prof, 0.0, 1.0);

  vec3 cor = texture(uTex, uv).rgb;
  float brilho = smoothstep(0.70, 1.0, n1) * prof * uBrilho;
  outCor = vec4(cor + brilho, 1.0);
}`;

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const erro = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${erro}`);
  }
  return s;
}

// Um efeito = um canvas WebGL com a imagem como textura.
function criarUm(fonte, cfg, linhaAgua) {
  const larguraFonte = fonte.videoWidth || fonte.naturalWidth || fonte.width;
  const alturaFonte = fonte.videoHeight || fonte.naturalHeight || fonte.height;
  if (!larguraFonte || !alturaFonte) throw new Error('imagem sem dimensoes');

  // A ondulação é suave: não vale a pena gastar GPU acima disto.
  const limite = 1600;
  const escala = Math.min(1, limite / Math.max(larguraFonte, alturaFonte));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(larguraFonte * escala));
  canvas.height = Math.max(2, Math.round(alturaFonte * escala));

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('sem WebGL2');

  const prog = gl.createProgram();
  gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('ligacao do programa falhou');
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // É aqui que uma imagem de outra origem sem CORS rebenta. Quem chama apanha
  // e fica com a imagem normal — o vídeo nunca deixa de ser gerado por isto.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = {
    tempo: gl.getUniformLocation(prog, 'uTime'),
    amp: gl.getUniformLocation(prog, 'uAmp'),
    vel: gl.getUniformLocation(prog, 'uVel'),
    linha: gl.getUniformLocation(prog, 'uLinha'),
    brilho: gl.getUniformLocation(prog, 'uBrilho'),
  };
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(u.amp, cfg.forca);
  gl.uniform1f(u.vel, cfg.velocidade);
  gl.uniform1f(u.linha, linhaAgua);
  gl.uniform1f(u.brilho, cfg.brilho);

  return {
    canvas,
    largura: canvas.width,
    altura: canvas.height,
    atualizar(t) {
      gl.uniform1f(u.tempo, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    descartar() {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* já foi */
      }
    },
  };
}

// Gestor com poucos contextos vivos.
//
// `pedir(indice, fonte)` devolve o efeito daquela cena (a criar se preciso) ou
// null quando não é possível. Nunca há mais de MAX_VIVOS abertos.
export function criarGestorAgua({ nivel = 'medio', linhaAgua = 0.55 } = {}) {
  const cfg = NIVEIS_AGUA[nivel];
  if (!cfg || typeof document === 'undefined') return null;

  const vivos = new Map(); // indice -> { efeito, usadoEm }
  let relogio = 0;
  let avisou = false;

  const libertarMaisAntigo = (excepto) => {
    let alvo = null;
    for (const [i, v] of vivos) {
      if (i === excepto) continue;
      if (!alvo || v.usadoEm < alvo.usadoEm) alvo = { i, usadoEm: v.usadoEm };
    }
    if (!alvo) return;
    const v = vivos.get(alvo.i);
    v.efeito.descartar();
    vivos.delete(alvo.i);
  };

  return {
    // Devolve o efeito da cena `indice`, criando-o ou reciclando outro.
    pedir(indice, fonte) {
      relogio += 1;
      const existente = vivos.get(indice);
      if (existente) {
        existente.usadoEm = relogio;
        return existente.efeito;
      }
      if (vivos.size >= MAX_VIVOS) libertarMaisAntigo(indice);
      try {
        const efeito = criarUm(fonte, cfg, linhaAgua);
        vivos.set(indice, { efeito, usadoEm: relogio });
        return efeito;
      } catch (e) {
        if (!avisou) {
          avisou = true;
          console.warn(
            '[rebeca] agua: este browser nao deixou aplicar o efeito ' +
              `(${e && e.message}); o video segue com as imagens normais.`,
          );
        }
        return null;
      }
    },
    limpar() {
      for (const v of vivos.values()) v.efeito.descartar();
      vivos.clear();
    },
  };
}
