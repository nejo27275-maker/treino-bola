/** Geometria 2D usada pelos simuladores (unidades em metros). */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Vec): Vec {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Vetor unitário a partir de um ângulo em radianos (0 = direita, π/2 = para baixo na tela). */
export function fromAngle(angle: number): Vec {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function angleOf(a: Vec): number {
  return Math.atan2(a.y, a.x);
}

/** Menor diferença angular absoluta entre dois ângulos (radianos). */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** Parâmetro t ∈ [0,1] do ponto do segmento AB mais próximo de P. */
export function closestT(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return 0;
  return clamp(dot(sub(p, a), ab) / len2, 0, 1);
}

export function closestPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const t = closestT(p, a, b);
  return add(a, scale(sub(b, a), t));
}

export function distPointSegment(p: Vec, a: Vec, b: Vec): number {
  return dist(p, closestPointOnSegment(p, a, b));
}

/**
 * Distância de um adversário P ao corredor de passe A→B. Quem está atrás da origem
 * (projeção antes de A) não consegue cortar o passe: retorna Infinity.
 */
export function laneDistance(p: Vec, a: Vec, b: Vec): number {
  if (dot(sub(p, a), sub(b, a)) <= 0) return Number.POSITIVE_INFINITY;
  return distPointSegment(p, a, b);
}

/**
 * Primeiro ponto (t em [0,1]) em que o segmento AB entra no círculo (centro c, raio r).
 * Retorna null se não houver interseção.
 */
export function segmentCircleEntry(a: Vec, b: Vec, c: Vec, r: number): number | null {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  if (C <= 0) return 0; // começa dentro do círculo
  if (A === 0) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-B - sqrt) / (2 * A);
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

export function insideRect(
  p: Vec,
  rect: { x: number; y: number; w: number; h: number },
  margin = 0,
): boolean {
  return (
    p.x >= rect.x - margin &&
    p.x <= rect.x + rect.w + margin &&
    p.y >= rect.y - margin &&
    p.y <= rect.y + rect.h + margin
  );
}

/** Ponto dentro de uma elipse alinhada aos eixos (centro c, semieixos rx, ry). */
export function insideEllipse(p: Vec, c: Vec, rx: number, ry: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - c.x) / rx;
  const dy = (p.y - c.y) / ry;
  return dx * dx + dy * dy <= 1;
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Limita a direção do passe à metade da frente (ângulos de −π a 0; −π/2 = reto para o
 * ataque, já que o campo cresce para baixo). Um ponto atrás do passador vai para o lado mais
 * próximo, nunca para o oposto.
 */
export function clampForward(a: number): number {
  const MIN = -Math.PI + 0.05;
  const MAX = -0.05;
  if (a > 0) return a > Math.PI / 2 ? MIN : MAX;
  return Math.max(MIN, Math.min(MAX, a));
}
