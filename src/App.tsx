import { Download, ImagePlus, LoaderCircle, Printer, Sparkles } from "lucide-react";
import { type ChangeEvent, type DragEvent, type ReactNode, useDeferredValue, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  applyDither,
  type DitherAlgorithm,
  type DitherOptions,
  drawPixelated,
  getPaletteLabel,
  type OrderedMatrixSize,
  type PaletteMode,
} from "@/lib/dither";

const PREVIEW_LIMIT = 900;
const MAX_EXPORT_DIMENSION = 2200;

const initialOptions: DitherOptions = {
  algorithm: "floyd-steinberg",
  brightness: 0,
  contrast: 12,
  threshold: 128,
  pixelSize: 2,
  matrixSize: 4,
  invert: false,
  paletteMode: "bw",
};

type RenderState = "idle" | "processing" | "ready";

function App() {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("dithered-image");
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<DitherOptions>(initialOptions);
  const [isDragging, setIsDragging] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const deferredOptions = useDeferredValue(options);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const clearPrintImage = () => {
      setPrintImageUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
    };

    window.addEventListener("afterprint", clearPrintImage);
    return () => {
      window.removeEventListener("afterprint", clearPrintImage);
    };
  }, []);

  useEffect(() => {
    if (!imageElement || !previewCanvasRef.current) {
      return;
    }

    let active = true;
    setRenderState("processing");
    const canvas = previewCanvasRef.current;

    const render = () => {
      if (!active) {
        return;
      }

      const dimensions = fitDimensions(imageElement.naturalWidth, imageElement.naturalHeight, PREVIEW_LIMIT);
      const workingCanvas = document.createElement("canvas");
      drawPixelated(imageElement, dimensions.width, dimensions.height, workingCanvas, deferredOptions.pixelSize);
      const context = workingCanvas.getContext("2d", { willReadFrequently: true });
      const targetContext = canvas.getContext("2d");

      if (!context || !targetContext) {
        return;
      }

      const processed = applyDither(
        context.getImageData(0, 0, workingCanvas.width, workingCanvas.height),
        deferredOptions,
      );

      canvas.width = processed.width;
      canvas.height = processed.height;
      targetContext.imageSmoothingEnabled = false;
      targetContext.putImageData(processed, 0, 0);
      setRenderState("ready");
    };

    const handle = window.setTimeout(render, 16);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [deferredOptions, imageElement]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadFile(file);
      event.target.value = "";
    }
  };

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
      setImageElement(image);
      setFileName(file.name.replace(/\.[^.]+$/, "") || "dithered-image");
    };
    image.src = url;
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  const updateOption = <K extends keyof DitherOptions>(key: K, value: DitherOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const createExportCanvas = () => {
    if (!imageElement) {
      return null;
    }

    const exportCanvas = document.createElement("canvas");
    const dimensions = fitDimensions(
      imageElement.naturalWidth,
      imageElement.naturalHeight,
      MAX_EXPORT_DIMENSION,
    );

    drawPixelated(imageElement, dimensions.width, dimensions.height, exportCanvas, options.pixelSize);
    const context = exportCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }

    const processed = applyDither(context.getImageData(0, 0, exportCanvas.width, exportCanvas.height), options);
    context.putImageData(processed, 0, 0);
    return exportCanvas;
  };

  const handleDownload = () => {
    const exportCanvas = createExportCanvas();
    if (!exportCanvas) {
      return;
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileName}-dithered.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const handlePrint = () => {
    const exportCanvas = createExportCanvas();
    if (!exportCanvas) {
      return;
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const url = URL.createObjectURL(blob);
      setPrintImageUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return url;
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.print();
        });
      });
    }, "image/png");
  };

  const paletteModes: PaletteMode[] = ["bw", "mono", "duo", "retro", "forest"];
  const matrixSizes: OrderedMatrixSize[] = [2, 4, 8];
  const algorithms: Array<{ value: DitherAlgorithm; label: string }> = [
    { value: "floyd-steinberg", label: "Floyd-Steinberg" },
    { value: "atkinson", label: "Atkinson" },
    { value: "ordered", label: "Ordered Bayer" },
    { value: "threshold", label: "Threshold" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 print-shell sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/45 px-6 py-8 panel-glow backdrop-blur-sm print-panel sm:px-8 sm:py-10">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-orange-100/70 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-4 print-hidden lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
                <Sparkles className="h-3.5 w-3.5" />
                Dither Lab
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                Upload a photo, tune the noise, and export a crisp dithered print.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Lightweight, client-side, and built for GitHub Pages. Everything runs directly in your browser.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => hiddenInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                Upload image
              </Button>
              <Button variant="secondary" onClick={handlePrint} disabled={!imageElement || renderState === "processing"}>
                <Printer className="h-4 w-4" />
                Print image
              </Button>
              <Button onClick={handleDownload} disabled={!imageElement || renderState === "processing"}>
                <Download className="h-4 w-4" />
                Download PNG
              </Button>
            </div>
          </div>

          <div className="grid gap-6 print-grid lg:grid-cols-[minmax(0,1.25fr)_360px]">
            <Card className="overflow-hidden print-stage">
              <CardContent className="p-4 sm:p-6">
                {!imageElement ? (
                  <button
                    type="button"
                    onClick={() => hiddenInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={[
                      "group flex min-h-[420px] w-full flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed px-6 text-center transition-colors",
                      isDragging ? "border-primary bg-orange-50" : "border-border bg-white/60 hover:border-primary/60",
                    ].join(" ")}
                  >
                    <div className="mb-5 rounded-full bg-secondary p-4 text-primary">
                      <ImagePlus className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-semibold">Drop an image here</h2>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                      Use JPG, PNG, or WebP. The preview updates in real time while you tune the dithering.
                    </p>
                    <span className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                      Pick a photo
                    </span>
                  </button>
                ) : (
                  <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-[#f7f1e8] print-preview-shell">
                    <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 text-sm text-muted-foreground print-hidden">
                      <span className="truncate font-medium text-foreground">{fileName}</span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1">
                        {renderState === "processing" ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Rendering
                          </>
                        ) : (
                          "Preview ready"
                        )}
                      </span>
                    </div>
                    <div className="flex min-h-[420px] items-center justify-center p-4 sm:p-6">
                      <canvas
                        ref={previewCanvasRef}
                        className="max-h-[70vh] max-w-full rounded-xl border border-black/5 bg-white shadow-sm"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {printImageUrl ? (
                        <img
                          src={printImageUrl}
                          alt={`${fileName} dithered print`}
                          className="print-only print-image"
                        />
                      ) : null}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="print-hidden">
              <CardHeader>
                <CardTitle>Controls</CardTitle>
                <CardDescription>Keep it simple, but give the output enough range to feel custom.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ControlBlock label="Algorithm" value={algorithms.find((item) => item.value === options.algorithm)?.label ?? ""}>
                  <Select value={options.algorithm} onValueChange={(value) => updateOption("algorithm", value as DitherAlgorithm)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select algorithm" />
                    </SelectTrigger>
                    <SelectContent>
                      {algorithms.map((algorithm) => (
                        <SelectItem key={algorithm.value} value={algorithm.value}>
                          {algorithm.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ControlBlock>

                <ControlBlock label="Palette" value={getPaletteLabel(options.paletteMode)}>
                  <Select value={options.paletteMode} onValueChange={(value) => updateOption("paletteMode", value as PaletteMode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select palette" />
                    </SelectTrigger>
                    <SelectContent>
                      {paletteModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {getPaletteLabel(mode)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ControlBlock>

                <ControlBlock label="Matrix size" value={`${options.matrixSize}x${options.matrixSize}`}>
                  <Select
                    value={String(options.matrixSize)}
                    disabled={options.algorithm !== "ordered"}
                    onValueChange={(value) => updateOption("matrixSize", Number(value) as OrderedMatrixSize)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select matrix size" />
                    </SelectTrigger>
                    <SelectContent>
                      {matrixSizes.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}x{size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ControlBlock>

                <SliderBlock
                  label="Pixel size"
                  value={options.pixelSize}
                  min={1}
                  max={12}
                  step={1}
                  onValueChange={(value) => updateOption("pixelSize", value)}
                />

                <SliderBlock
                  label="Brightness"
                  value={options.brightness}
                  min={-120}
                  max={120}
                  step={1}
                  onValueChange={(value) => updateOption("brightness", value)}
                />

                <SliderBlock
                  label="Contrast"
                  value={options.contrast}
                  min={-100}
                  max={100}
                  step={1}
                  onValueChange={(value) => updateOption("contrast", value)}
                />

                <SliderBlock
                  label="Threshold"
                  value={options.threshold}
                  min={0}
                  max={255}
                  step={1}
                  disabled={options.algorithm !== "threshold"}
                  onValueChange={(value) => updateOption("threshold", value)}
                />

                <div className="flex items-center justify-between rounded-[1.25rem] border border-border/80 bg-white/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Invert output</p>
                    <p className="text-xs text-muted-foreground">Flip the tonal mapping before dithering.</p>
                  </div>
                  <Switch checked={options.invert} onCheckedChange={(checked) => updateOption("invert", checked)} />
                </div>

                <Button
                  variant="ghost"
                  className="w-full border border-border/80 bg-white/60"
                  onClick={() => setOptions(initialOptions)}
                >
                  Reset controls
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <input
          ref={hiddenInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </section>
    </main>
  );
}

type ControlBlockProps = {
  label: string;
  value: string;
  children: ReactNode;
};

function ControlBlock({ label, value, children }: ControlBlockProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}

type SliderBlockProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
};

function SliderBlock({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onValueChange,
}: SliderBlockProps) {
  return (
    <div className={disabled ? "space-y-3 opacity-50" : "space-y-3"}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onValueChange(next[0] ?? value)}
      />
    </div>
  );
}

function fitDimensions(width: number, height: number, limit: number) {
  const ratio = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export default App;
