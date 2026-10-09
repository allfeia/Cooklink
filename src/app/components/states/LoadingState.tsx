import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../../context/LanguageContext";
import { useState, useEffect } from "react";
import type { JobStatus } from "@/app/api/recipesApi";
import { ClBurst } from "../decor/ClDecor";
import {
  HINT_INTERVAL_MS,
  PROGRESS_TICK_MS,
  nextProgress,
  stageRange,
  waitNoteKey,
} from "./loadingProgress";

interface LoadingStateProps {
  status: JobStatus;
  onCancel: () => void;
}

const STAGE_HINTS: Partial<Record<JobStatus, string[]>> = {
  scanning: [
    "Проверяем ссылку на видео...",
    "Читаем метаданные...",
    "Проверяем длительность...",
    "Убеждаемся, что видео доступно...",
  ],
  transcribing: [
    "Загружаем субтитры...",
    "Читаем транскрипцию...",
    "Обрабатываем текст видео...",
    "Убираем дубликаты строк...",
  ],
  llm_processing: [
    "Анализируем рецепт...",
    "Ищем ингредиенты...",
    "Определяем шаги приготовления...",
    "Считаем порции...",
    "Оцениваем КБЖУ...",
    "Проверяем структуру рецепта...",
  ],
  generating_pdf: [
    "Оформляем рецепт...",
    "Собираем PDF...",
    "Почти готово...",
  ],
};

export function LoadingState({ status, onCancel }: LoadingStateProps) {
  const { t } = useLanguage();
  const [hintIndex, setHintIndex] = useState(0);
  const [progress, setProgress] = useState(() => stageRange(status).floor);
  const [elapsedSec, setElapsedSec] = useState(0);

  const stageText: Partial<Record<JobStatus, string>> = {
    scanning: t("analyzing"),
    transcribing: t("fetchingSubtitles"),
    llm_processing: t("extracting"),
    generating_pdf: t("generating"),
  };
  const text = stageText[status] ?? stageText.generating_pdf!;
  const hints = STAGE_HINTS[status] ?? [];

  useEffect(() => {
    setHintIndex(0);
    if (hints.length === 0) return;
    const id = setInterval(() => {
      setHintIndex((i) => Math.min(i + 1, hints.length));
    }, HINT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    setProgress((p) => Math.max(p, stageRange(status).floor));
    const id = setInterval(() => {
      setProgress((p) => nextProgress(p, status));
    }, PROGRESS_TICK_MS);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="cl-center cl-loading">
        <ClBurst className="cl-loader-burst" />

        <div className="cl-status" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.h2
              key={`${status}-${hintIndex}`}
              className="cl-heading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {hints[hintIndex] ?? text}
            </motion.h2>
          </AnimatePresence>
        </div>

        <div className="cl-bar" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>

        <p className="cl-wait-note">{t(waitNoteKey(elapsedSec))}</p>

        <div className="cl-actions">
          <button type="button" className="cl-pill two" onClick={onCancel}>
            ✕ {t("cancel")}
          </button>
        </div>
    </section>
  );
}
