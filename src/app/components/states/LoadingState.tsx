import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../../context/LanguageContext";
import { useState, useEffect } from "react";
import type { JobStatus } from "@/app/api/recipesApi";
import { ClBurst } from "../decor/ClDecor";

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

  const ACTIVE_STAGE_BY_STATUS: Partial<Record<JobStatus, { text: string; progress: number }>> = {
    scanning: { text: t("analyzing"), progress: 20 },
    transcribing: { text: t("fetchingSubtitles"), progress: 45 },
    llm_processing: { text: t("extracting"), progress: 70 },
    generating_pdf: { text: t("generating"), progress: 95 },
  };

  const stage = ACTIVE_STAGE_BY_STATUS[status] ?? ACTIVE_STAGE_BY_STATUS.generating_pdf!;
  const hints = STAGE_HINTS[status] ?? [];

  useEffect(() => {
    setHintIndex(0);
    if (hints.length <= 1) return;
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % hints.length);
    }, 1500);
    return () => clearInterval(id);
  }, [status]);

  return (
    <section className="cl-center cl-loading">
        <ClBurst className="cl-loader-burst" />

        <div className="cl-status">
          <AnimatePresence mode="wait">
            <motion.h2
              key={`${status}-${hintIndex}`}
              className="cl-heading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {hints[hintIndex] ?? stage.text}
            </motion.h2>
          </AnimatePresence>
        </div>

        <div className="cl-bar" aria-hidden="true">
          <i style={{ width: `${stage.progress}%` }} />
        </div>

        <div className="cl-actions">
          <button type="button" className="cl-pill two" onClick={onCancel}>
            ✕ {t("cancel")}
          </button>
        </div>
    </section>
  );
}
