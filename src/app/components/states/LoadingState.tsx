import { useState, useEffect } from "react";
import { Progress } from "../ui/progress";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

interface LoadingStateProps {
  onCancel: () => void;
}

export function LoadingState({ onCancel }: LoadingStateProps) {
  const { t } = useLanguage();
  const [currentStage, setCurrentStage] = useState(0);

  const LOADING_STAGES = [
    { text: t("analyzing"), progress: 33 },
    { text: t("extracting"), progress: 66 },
    { text: t("generating"), progress: 100 },
  ];

  useEffect(() => {
    const timers = [
      setTimeout(() => setCurrentStage(1), 2000),
      setTimeout(() => setCurrentStage(2), 4000),
    ];

    return () => timers.forEach(timer => clearTimeout(timer));
  }, []);

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
            <motion.p
              key={currentStage}
              className="text-lg font-medium text-foreground"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {LOADING_STAGES[currentStage].text}
            </motion.p>
            <Progress
              value={LOADING_STAGES[currentStage].progress}
              className="h-2"
            />
            <p className="text-sm text-muted-foreground">
              {LOADING_STAGES[currentStage].progress}%
            </p>
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
