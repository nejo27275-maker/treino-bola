/**
 * Adaptador OPCIONAL para estimativa de pose com MediaPipe Tasks Vision (PoseLandmarker).
 *
 * Os arquivos não fazem parte do repositório: são instalados no servidor com
 * `npm run pose:prepare` (veja docs/VISAO_COMPUTACIONAL.md). Sem eles, o aplicativo
 * informa que o detector não está instalado e segue funcionando com a avaliação guiada.
 *
 * Esta integração segue a API documentada (FilesetResolver.forVisionTasks,
 * PoseLandmarker.createFromOptions, detectForVideo), mas NÃO pôde ser validada com a
 * biblioteca real no ambiente de desenvolvimento (sem acesso à rede). Falhas são tratadas
 * e exibidas; nada é inventado quando o detector não roda.
 */
import { MIN_VISIBILITY, POSE_CONNECTIONS, type Landmark } from '../core/poseMetrics.ts';

export const POSE_FILES = {
  bundle: 'vendor/mediapipe/vision_bundle.mjs',
  wasmDir: 'vendor/mediapipe/wasm',
  manifest: 'vendor/mediapipe/manifest.json',
  model: 'models/pose_landmarker_lite.task',
} as const;

export interface PoseAvailability {
  available: boolean;
  detail: string;
  version?: string;
  files?: string[];
}

interface BuildPoseInfo {
  available?: boolean;
  package?: string;
  version?: string;
  files?: string[];
}

function url(path: string): string {
  return new URL(path, document.baseURI).href;
}

let availabilityCache: Promise<PoseAvailability> | null = null;

/**
 * O build registra em build-info.json se os arquivos do detector foram instalados; assim
 * o aplicativo não precisa sondar arquivos que não existem (e funciona offline).
 */
export function checkPoseAvailability(): Promise<PoseAvailability> {
  availabilityCache ??= (async (): Promise<PoseAvailability> => {
    try {
      const res = await fetch(url('build-info.json'), { cache: 'no-cache' });
      if (!res.ok) return { available: false, detail: 'informações do build indisponíveis' };
      const info = (await res.json()) as { pose?: BuildPoseInfo };
      const pose = info.pose;
      if (!pose?.available) {
        return {
          available: false,
          detail:
            'os arquivos opcionais não foram instalados (npm run pose:prepare antes do build)',
        };
      }
      return {
        available: true,
        detail: `${pose.package ?? '@mediapipe/tasks-vision'} ${pose.version ?? 'versão desconhecida'}`,
        ...(pose.version ? { version: pose.version } : {}),
        files: Array.isArray(pose.files) ? pose.files : [],
      };
    } catch {
      return { available: false, detail: 'não foi possível verificar' };
    }
  })();
  return availabilityCache;
}

export interface PoseDetector {
  readonly delegate: 'GPU' | 'CPU';
  /** Detecta a pose no quadro atual. `timestampMs` deve aumentar a cada chamada. */
  detect(frame: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): Landmark[] | null;
  close(): void;
}

interface LandmarkerLike {
  detectForVideo(
    frame: unknown,
    timestamp: number,
    callback?: (result: ResultLike) => void,
  ): ResultLike | undefined;
  close(): void;
}

interface ResultLike {
  landmarks?: { x: number; y: number; z?: number; visibility?: number }[][];
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(fileset: unknown, options: unknown): Promise<LandmarkerLike>;
  };
}

function copyLandmarks(result: ResultLike | undefined): Landmark[] | null {
  const first = result?.landmarks?.[0];
  if (!first || first.length === 0) return null;
  return first.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 0 }));
}

/** Carrega o detector (tenta GPU e cai para CPU). Lança erro com mensagem clara se falhar. */
export async function loadPoseDetector(): Promise<PoseDetector> {
  let vision: VisionModule;
  try {
    vision = (await import(url(POSE_FILES.bundle))) as VisionModule;
  } catch (error) {
    throw new Error(
      `Não foi possível carregar a biblioteca de pose: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!vision?.FilesetResolver || !vision?.PoseLandmarker) {
    throw new Error(
      'A biblioteca instalada não tem a interface esperada (FilesetResolver/PoseLandmarker).',
    );
  }
  const fileset = await vision.FilesetResolver.forVisionTasks(url(POSE_FILES.wasmDir));
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: url(POSE_FILES.model), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let landmarker: LandmarkerLike;
  let delegate: 'GPU' | 'CPU' = 'GPU';
  try {
    landmarker = await make('GPU');
  } catch {
    delegate = 'CPU';
    landmarker = await make('CPU');
  }
  let lastTs = 0;
  return {
    delegate,
    detect(frame, timestampMs) {
      // O MediaPipe exige carimbos de tempo estritamente crescentes no modo VIDEO.
      const ts = Math.max(lastTs + 1, Math.round(timestampMs));
      lastTs = ts;
      let captured: Landmark[] | null = null;
      const returned = landmarker.detectForVideo(frame, ts, (result) => {
        captured = copyLandmarks(result);
      });
      return captured ?? copyLandmarks(returned);
    },
    close() {
      try {
        landmarker.close();
      } catch {
        // ignora
      }
    },
  };
}

/** Desenha o esqueleto simplificado; pontos pouco visíveis ficam de fora. */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = Math.max(2, width / 240);
  ctx.strokeStyle = 'rgba(61, 220, 132, 0.95)';
  ctx.fillStyle = 'rgba(255, 209, 102, 0.95)';
  for (const [a, b] of POSE_CONNECTIONS) {
    const p = landmarks[a];
    const q = landmarks[b];
    if (!p || !q || (p.visibility ?? 0) < MIN_VISIBILITY || (q.visibility ?? 0) < MIN_VISIBILITY)
      continue;
    ctx.beginPath();
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);
    ctx.stroke();
  }
  for (const p of landmarks) {
    if ((p.visibility ?? 0) < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, Math.max(3, width / 160), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cache separado (o service worker o consulta para vendor/ e models/). */
const OPTIONAL_CACHE = 'cfa-opcional-v1';

function poseFilePaths(files: string[]): string[] {
  return [
    POSE_FILES.bundle,
    POSE_FILES.model,
    POSE_FILES.manifest,
    ...files.map((f) => `${POSE_FILES.wasmDir}/${f}`),
  ];
}

/**
 * Guarda os arquivos do detector no cache opcional para uso offline. Só grava se TODOS os
 * arquivos forem baixados; devolve quantos foram guardados.
 */
export async function cachePoseFiles(files: string[]): Promise<number> {
  if (typeof caches === 'undefined') throw new Error('Cache offline indisponível neste navegador.');
  const paths = poseFilePaths(files);
  const responses: [string, Response][] = [];
  for (const path of paths) {
    const res = await fetch(url(path), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao baixar ${path} (HTTP ${res.status}).`);
    responses.push([url(path), res]);
  }
  const cache = await caches.open(OPTIONAL_CACHE);
  for (const [key, res] of responses) await cache.put(key, res);
  return responses.length;
}

/** Indica se todos os arquivos do detector já estão no cache opcional deste aparelho. */
export async function isPoseCached(files: string[]): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    if (!(await caches.has(OPTIONAL_CACHE))) return false;
    const cache = await caches.open(OPTIONAL_CACHE);
    for (const path of poseFilePaths(files)) {
      if (!(await cache.match(url(path)))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
