import { useRef, useState } from "react";
import { toast } from "sonner";
import { InputSection } from "./components/forms/InputSection";
import { LoadingState } from "./components/states/LoadingState";
import { RecipeCard } from "./components/features/recipe/RecipeCard";
import { Toaster } from "./components/feedback/sonner";
import { Recipe, mapApiRecipeToRecipe } from "./components/features/recipe/recipe";
import { motion, AnimatePresence } from "motion/react";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { searchDishImage } from "@/app/components/features/image/imageSearch";
import { pollRecipeJob, cancelRecipeJob, PollCancelledError, RecipeApiError, type JobStatus } from "@/app/api/recipesApi";
import { getRecipeErrorMessage } from "@/app/lib/recipeErrorMessages";

type AppState = "input" | "loading" | "result";

function AppContent() {
  const [state, setState] = useState<AppState>("input");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("scanning");
  const pollAbortRef = useRef<AbortController | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const { t } = useLanguage();

  const handleJobCreated = ({ jobId, sourceUrl }: { jobId: string; sourceUrl: string }) => {
    setJobStatus("scanning");
    setState("loading");
    currentJobIdRef.current = jobId;

    const controller = new AbortController();
    pollAbortRef.current = controller;

    pollRecipeJob(jobId, { onStatusChange: setJobStatus, signal: controller.signal })
      .then(async (job) => {
        if (!job.data) {
          toast.error(t("errorInternalServer"));
          setState("input");
          return;
        }
        const mapped = mapApiRecipeToRecipe(job.data, sourceUrl, job.pdf_url);
        const dishImage = await searchDishImage(mapped.title);
        setRecipe({ ...mapped, dishImage });
        setState("result");
      })
      .catch((error) => {
        if (error instanceof PollCancelledError) {
          return;
        }
        const message =
          error instanceof RecipeApiError
            ? getRecipeErrorMessage(error.code, t)
            : t("errorInternalServer");
        toast.error(message);
        setState("input");
      });
  };

  const handleCancel = () => {
    pollAbortRef.current?.abort();
    const jobId = currentJobIdRef.current;
    if (jobId) {
      cancelRecipeJob(jobId).catch((error) => {
        console.error("Не удалось отменить задачу на сервере:", error);
      });
    }
    setState("input");
    setRecipe(null);
  };

  const handleBack = () => {
    setState("input");
  };

  const handleNewRecipe = () => {
    setState("input");
    setRecipe(null);
  };

  const pageTransition = {
    initial: { opacity: 0, x: 32 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -32 },
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  };

  return (
    <div className="cl-app">
      <div className="cl-grain" aria-hidden="true" />

      <AnimatePresence mode="wait" initial={false}>
        {state === "input" && (
          <motion.div key="input" className="cl-screen" {...pageTransition}>
            <InputSection onJobCreated={handleJobCreated} />
          </motion.div>
        )}

        {state === "loading" && (
          <motion.div key="loading" className="cl-screen" {...pageTransition}>
            <LoadingState status={jobStatus} onCancel={handleCancel} />
          </motion.div>
        )}

        {state === "result" && recipe && (
          <motion.div key="result" className="cl-screen" {...pageTransition}>
            <RecipeCard
              recipe={recipe}
              onBack={handleBack}
              onNewRecipe={handleNewRecipe}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
