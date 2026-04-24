export type DitherAlgorithm = "floyd-steinberg" | "atkinson" | "ordered" | "threshold";
export type PaletteMode = "bw" | "mono" | "duo" | "retro" | "forest";
export type OrderedMatrixSize = 2 | 4 | 8;

export type DitherOptions = {
  algorithm: DitherAlgorithm;
  brightness: number;
  contrast: number;
  threshold: number;
  pixelSize: number;
  matrixSize: OrderedMatrixSize;
  invert: boolean;
  paletteMode: PaletteMode;
};

type Rgb = [number, number, number];

const palettes: Record<PaletteMode, Rgb[]> = {
  bw: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  mono: [
    [24, 24, 24],
    [245, 239, 232],
  ],
  duo: [
    [30, 46, 72],
    [230, 223, 206],
  ],
  retro: [
    [43, 31, 28],
    [125, 83, 64],
    [219, 161, 94],
    [248, 233, 205],
  ],
  forest: [
    [28, 36, 31],
    [85, 108, 74],
    [167, 188, 145],
    [234, 235, 220],
  ],
};

const lumWeights: Rgb = [0.299, 0.587, 0.114];
const orderedMatrices: Record<OrderedMatrixSize, number[][]> = {
  2: [
    [0, 2],
    [3, 1],
  ],
  4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ],
  8: [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ],
};

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function luminance(pixel: Rgb) {
  return pixel[0] * lumWeights[0] + pixel[1] * lumWeights[1] + pixel[2] * lumWeights[2];
}

function adjustChannel(value: number, brightness: number, contrast: number) {
  const contrasted = ((value - 128) * (1 + contrast / 100)) + 128 + brightness;
  return clamp(contrasted);
}

function nearestPaletteColor(color: Rgb, palette: Rgb[]) {
  let best = palette[0];
  let smallest = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const distance =
      (candidate[0] - color[0]) ** 2 +
      (candidate[1] - color[1]) ** 2 +
      (candidate[2] - color[2]) ** 2;
    if (distance < smallest) {
      smallest = distance;
      best = candidate;
    }
  }

  return best;
}

function distributeError(
  buffer: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  error: Rgb,
  pattern: Array<[number, number, number]>,
) {
  for (const [dx, dy, weight] of pattern) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }

    const index = (ny * width + nx) * 3;
    buffer[index] += error[0] * weight;
    buffer[index + 1] += error[1] * weight;
    buffer[index + 2] += error[2] * weight;
  }
}

export function applyDither(source: ImageData, options: DitherOptions) {
  const { data, width, height } = source;
  const palette = palettes[options.paletteMode];
  const orderedMatrix = orderedMatrices[options.matrixSize];
  const orderedArea = orderedMatrix.length * orderedMatrix.length;
  const output = new Uint8ClampedArray(data.length);
  const working = new Float32Array(width * height * 3);

  for (let i = 0, px = 0; i < data.length; i += 4, px += 3) {
    const original: Rgb = [
      adjustChannel(data[i], options.brightness, options.contrast),
      adjustChannel(data[i + 1], options.brightness, options.contrast),
      adjustChannel(data[i + 2], options.brightness, options.contrast),
    ];

    const next = options.invert
      ? ([255 - original[0], 255 - original[1], 255 - original[2]] as Rgb)
      : original;

    working[px] = next[0];
    working[px + 1] = next[1];
    working[px + 2] = next[2];
    output[i + 3] = data[i + 3];
  }

  const floydPattern: Array<[number, number, number]> = [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ];
  const atkinsonPattern: Array<[number, number, number]> = [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgbIndex = (y * width + x) * 3;
      const pixel: Rgb = [
        clamp(working[rgbIndex]),
        clamp(working[rgbIndex + 1]),
        clamp(working[rgbIndex + 2]),
      ];

      let mapped: Rgb;
      if (options.algorithm === "threshold") {
        const tone = luminance(pixel) >= options.threshold ? 255 : 0;
        mapped = nearestPaletteColor([tone, tone, tone], palette);
      } else if (options.algorithm === "ordered") {
        const tone = luminance(pixel);
        const thresholdBias =
          ((orderedMatrix[y % orderedMatrix.length][x % orderedMatrix.length] + 0.5) / orderedArea - 0.5) * 96;
        const value = clamp(tone + thresholdBias);
        mapped = nearestPaletteColor([value, value, value], palette);
      } else {
        mapped = nearestPaletteColor(pixel, palette);
      }

      const outIndex = (y * width + x) * 4;
      output[outIndex] = mapped[0];
      output[outIndex + 1] = mapped[1];
      output[outIndex + 2] = mapped[2];

      if (options.algorithm === "floyd-steinberg" || options.algorithm === "atkinson") {
        const error: Rgb = [
          pixel[0] - mapped[0],
          pixel[1] - mapped[1],
          pixel[2] - mapped[2],
        ];
        distributeError(
          working,
          width,
          height,
          x,
          y,
          error,
          options.algorithm === "floyd-steinberg" ? floydPattern : atkinsonPattern,
        );
      }
    }
  }

  return new ImageData(output, width, height);
}

export function drawPixelated(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetCanvas: HTMLCanvasElement,
  pixelSize: number,
) {
  const safePixel = Math.max(1, Math.round(pixelSize));
  const scaledWidth = Math.max(1, Math.round(sourceWidth / safePixel));
  const scaledHeight = Math.max(1, Math.round(sourceHeight / safePixel));
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = scaledWidth;
  tempCanvas.height = scaledHeight;
  const tempContext = tempCanvas.getContext("2d", { willReadFrequently: true });
  const targetContext = targetCanvas.getContext("2d");

  if (!tempContext || !targetContext) {
    throw new Error("Canvas context not available");
  }

  tempContext.imageSmoothingEnabled = true;
  tempContext.clearRect(0, 0, scaledWidth, scaledHeight);
  tempContext.drawImage(image, 0, 0, scaledWidth, scaledHeight);

  targetCanvas.width = scaledWidth;
  targetCanvas.height = scaledHeight;
  targetContext.putImageData(
    new ImageData(
      new Uint8ClampedArray(tempContext.getImageData(0, 0, scaledWidth, scaledHeight).data),
      scaledWidth,
      scaledHeight,
    ),
    0,
    0,
  );
}

export function getPaletteLabel(mode: PaletteMode) {
  return {
    bw: "Black & white",
    mono: "Mono paper",
    duo: "Ink blue",
    retro: "Warm retro",
    forest: "Forest print",
  }[mode];
}
