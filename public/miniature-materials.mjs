import * as T from './vendor/three/three.module.min.js';

export const MINIATURE_PALETTE = Object.freeze({
  plaster: '#e9e3d7', lime: '#e3ded1',
  wood: '#8f7866', floor: '#c5aa87', door: '#9e8872',
  brass: '#a58c5f', ceramic: '#d7d9cc', porcelain: '#ecebe0',
  tile: '#bcc8bb', chrome: '#9da79f', cloth: '#99a99b', paper: '#e9ddc3',
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function canvasTexture(size, paint, name) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#faf9f6';
  context.fillRect(0, 0, size, size);
  paint(context, size);
  const texture = new T.CanvasTexture(canvas);
  texture.name = `miniature/${name}`;
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  // surface() already supplies world UVs: 2.8 m walls / 2.65 m floor.
  // Keep texture repeat at 1 so adjoining architecture remains continuous.
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

function paintedPlaster() {
  return canvasTexture(256, (ctx, size) => {
    const random = seededRandom(402);
    const pixels = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const variation = Math.round((random() - 0.5) * 5);
      pixels.data[i] += variation;
      pixels.data[i + 1] += variation;
      pixels.data[i + 2] += variation;
    }
    ctx.putImageData(pixels, 0, 0);
    // Broad, periodic roller traces: no dark stains or hard patch borders.
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = `rgba(120,113,100,${0.007 + 0.005 * Math.cos(x / size * Math.PI * 8)})`;
      ctx.fillRect(x, 0, 1, size);
    }
  }, 'painted-plaster');
}

function woodGrain(planks = false) {
  return canvasTexture(512, (ctx, size) => {
    const random = seededRandom(planks ? 206 : 107);
    const boardCount = planks ? 8 : 1;
    const boardWidth = size / boardCount;
    for (let board = 0; board < boardCount; board++) {
      const left = board * boardWidth;
      ctx.fillStyle = `rgba(137,111,82,${0.015 + random() * 0.025})`;
      ctx.fillRect(left, 0, boardWidth, size);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, 0, boardWidth, size);
      ctx.clip();
      const lineCount = planks ? 17 : 96;
      for (let line = 0; line < lineCount; line++) {
        const x = left + random() * boardWidth;
        const amplitude = 0.5 + random() * 1.8;
        const phase = random() * Math.PI * 2;
        ctx.strokeStyle = `rgba(133,113,87,${0.022 + random() * 0.033})`;
        ctx.lineWidth = 0.5 + random() * 0.8;
        ctx.beginPath();
        for (let y = 0; y <= size; y += 8) {
          const offset = amplitude * Math.sin(y / size * Math.PI * 2 + phase);
          if (y === 0) ctx.moveTo(x + offset, y);
          else ctx.lineTo(x + offset, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (planks) {
        // Eight broad boards per 2.65 m; joints are quiet, shallow lines.
        ctx.strokeStyle = 'rgba(115,95,72,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left + 0.5, 0);
        ctx.lineTo(left + 0.5, size);
        const joint = ((board % 3) + 0.5) * size / 3;
        ctx.moveTo(left, joint);
        ctx.lineTo(left + boardWidth, joint);
        ctx.stroke();
      }
    }
  }, planks ? 'wide-floorboards' : 'soft-wood-grain');
}

function fabricWeave() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = 'rgba(113,126,111,0.035)';
    for (let i = 0; i < size; i += 4) {
      ctx.fillRect(i, 0, 1, size);
      ctx.fillRect(0, i, size, 1);
    }
  }, 'linen-weave');
}

/** Create owned materials/textures; caller controls assignment and disposal. */
export function createMiniatureMaterials() {
  const plasterMap = paintedPlaster();
  const woodMap = woodGrain();
  const floorMap = woodGrain(true);
  const clothMap = fabricWeave();
  const make = (name, roughness, extra = {}) => new T.MeshStandardMaterial({
    name: `miniature/${name}`, color: MINIATURE_PALETTE[name],
    roughness, metalness: 0, emissive: '#000000', emissiveIntensity: 0,
    ...extra,
  });
  return {
    plaster: make('plaster', 0.96, { map: plasterMap }),
    lime: make('lime', 0.97, { map: plasterMap }),
    wood: make('wood', 0.87, { map: woodMap }),
    floor: make('floor', 0.88, { map: floorMap }),
    door: make('door', 0.86, { map: woodMap }),
    brass: make('brass', 0.68, { metalness: 0.3 }),
    ceramic: make('ceramic', 0.69),
    porcelain: make('porcelain', 0.56),
    tile: make('tile', 0.76),
    chrome: make('chrome', 0.58, { metalness: 0.45 }),
    cloth: make('cloth', 1, { map: clothMap }),
    paper: make('paper', 0.97, { map: plasterMap }),
  };
}
