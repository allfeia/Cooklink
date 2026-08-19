import { Progress } from "../ui/progress";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useState, useEffect } from "react";
import type { JobStatus } from "@/app/api/recipesApi";

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
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <motion.div
        className="max-w-md w-full space-y-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
      >
        {/* Spinner */}
        <div className="flex justify-center">
          <motion.div
            className="w-20 h-20 border-4 border-muted border-t-[#2563EB] rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Progress */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <div className="h-8 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={`${status}-${hintIndex}`}
                  className="text-lg font-medium text-foreground"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  {hints[hintIndex] ?? stage.text}
                </motion.p>
              </AnimatePresence>
            </div>
            <Progress value={stage.progress} className="h-2" />
          </div>

          {/* Cancel Button */}
          <button
            onClick={onCancel}
            className="w-full py-3 px-4 flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted transition-colors mt-8"
            aria-label={t("cancel")}
          >
            <X className="w-4 h-4" />
            <span>{t("cancel")}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
