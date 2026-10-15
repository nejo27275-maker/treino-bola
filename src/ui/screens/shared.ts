/** Utilidades compartilhadas pelas telas. */
import { exerciseById } from '../../content/exercises.ts';
import { mentalById } from '../../content/mental.ts';
import { workoutById } from '../../content/physical.ts';
import { formatDayMonth, weekdayName } from '../../core/dates.ts';
import { clock, millis, percent } from '../../core/format.ts';
import type { PlanBlock } from '../../core/planner.ts';
import { SIM_MODES, isSimModeId } from '../../core/sim/index.ts';
import type { ActivityKind, TrainingSession } from '../../core/types.ts';
import { h } from '../dom.ts';

export const KIND_LABEL: Record<ActivityKind, string> = {
  tecnico: 'Treino técnico',
  teste: 'Teste de linha de base',
  simulador: 'Simulador',
  fisico: 'Preparação física',
  mental: 'Preparação mental',
  leitura: 'Leitura de jogo',
  video: 'Análise de vídeo',
  camera: 'Câmera',
  autoavaliacao: 'Autoavaliação',
};

/** Endereço da tela que inicia uma atividade do plano. */
export function blockHref(block: PlanBlock): string {
  switch (block.kind) {
    case 'tecnico':
    case 'teste':
      return `#/tecnico/${encodeURIComponent(block.activityId)}`;
    case 'simulador':
      return `#/simuladores/${encodeURIComponent(block.simMode ?? block.activityId)}`;
    case 'fisico':
    case 'aquecimento':
      return `#/fisico/${encodeURIComponent(block.activityId)}`;
    case 'mental':
      return `#/mental/${encodeURIComponent(block.activityId)}`;
    case 'leitura':
      return '#/leitura';
    default:
      return '#/treinar';
  }
}

/** Endereço para repetir a atividade de uma sessão registrada. */
export function activityHref(session: TrainingSession): string | null {
  switch (session.kind) {
    case 'tecnico':
    case 'teste':
      return exerciseById(session.activityId) ? `#/tecnico/${session.activityId}` : null;
    case 'simulador':
      return isSimModeId(session.activityId) ? `#/simuladores/${session.activityId}` : null;
    case 'fisico':
      return workoutById(session.activityId) ? `#/fisico/${session.activityId}` : null;
    case 'mental':
      return mentalById(session.activityId) ? `#/mental/${session.activityId}` : null;
    case 'leitura':
      return '#/leitura';
    case 'video':
      return '#/video';
    case 'camera':
      return '#/camera';
    case 'autoavaliacao':
      return '#/avaliacao';
    default:
      return null;
  }
}

export function sessionSummaryText(s: TrainingSession): string {
  const parts: string[] = [];
  if (s.summary && s.summary.attempts > 0) {
    parts.push(`${s.summary.successes}/${s.summary.attempts} acertos (${percent(s.summary.successes / s.summary.attempts)})`);
    if (s.summary.avgResponseMs) parts.push(`tempo médio ${millis(s.summary.avgResponseMs)}`);
    if (typeof s.summary.score === 'number') parts.push(`${s.summary.score} pontos`);
  } else if (s.kind === 'autoavaliacao') {
    parts.push('notas de 1 a 5');
  } else {
    parts.push('sem contagem de acertos');
  }
  if (s.durationSec > 0) parts.push(clock(s.durationSec));
  if (typeof s.rpe === 'number') parts.push(`esforço ${s.rpe}/10`);
  if (s.status === 'interrompida') parts.push('interrompida');
  return parts.join(' · ');
}

export function dayLabel(date: string, today: string): string {
  if (date === today) return `Hoje (${formatDayMonth(date)})`;
  return `${weekdayName(date)}, ${formatDayMonth(date)}`;
}

export function simName(id: string): string {
  return isSimModeId(id) ? SIM_MODES[id].nome : id;
}

export function loadingView(): HTMLElement {
  return h('div', { class: 'boot', role: 'status', 'aria-live': 'polite' }, h('p', null, 'Carregando…'));
}
