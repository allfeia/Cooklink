import type { JobStatus } from "@/app/api/recipesApi";

/**
 * Прогресс на экране загрузки ненастоящий: сервер отдаёт только этап, а не
 * процент. Чтобы полоса не замирала на минуту (этап модели длится от ~8 до
 * 90+ секунд), внутри этапа она медленно ползёт к верхней границе и никогда
 * её не достигает. При смене этапа подтягивается к нижней границе.
 */
interface StageRange {
  floor: number;
  cap: number;
}

const STAGE_RANGE: Partial<Record<JobStatus, StageRange>> = {
  scanning: { floor: 5, cap: 24 },
  transcribing: { floor: 25, cap: 48 },
  llm_processing: { floor: 50, cap: 88 },
  generating_pdf: { floor: 90, cap: 98 },
};

const FALLBACK_RANGE: StageRange = { floor: 90, cap: 98 };

/** Какую долю оставшегося до границы пути проходим за один тик. */
const CREEP_PER_TICK = 0.06;

export const PROGRESS_TICK_MS = 700;

export function stageRange(status: JobStatus): StageRange {
  return STAGE_RANGE[status] ?? FALLBACK_RANGE;
}

export function nextProgress(current: number, status: JobStatus): number {
  const { floor, cap } = stageRange(status);
  const base = Math.max(current, floor);
  if (base >= cap) return base;
  return base + (cap - base) * CREEP_PER_TICK;
}

/** Порог, после которого пишем, что видео обрабатывается дольше обычного. */
export const SLOW_AFTER_SEC = 45;
/** Порог, после которого предлагаем подождать или отменить и попробовать снова. */
export const VERY_SLOW_AFTER_SEC = 90;

export type WaitNoteKey = "loadingExpect" | "loadingSlow" | "loadingVerySlow";

export function waitNoteKey(elapsedSec: number): WaitNoteKey {
  if (elapsedSec >= VERY_SLOW_AFTER_SEC) return "loadingVerySlow";
  if (elapsedSec >= SLOW_AFTER_SEC) return "loadingSlow";
  return "loadingExpect";
}

/** Как часто меняем фразу-подсказку. */
export const HINT_INTERVAL_MS = 3200;
