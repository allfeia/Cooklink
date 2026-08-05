import { useRef, useState } from "react";
import { toast } from "sonner";
import { Header } from "./components/layout/Header";
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <AnimatePresence mode="wait">
        {state === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            <InputSection onJobCreated={handleJobCreated} />

            {/* Footer */}
            <footer className="border-t border-border py-6">
              <div className="container mx-auto px-4 md:px-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                  <p>{t("copyright")}</p>
                  <div className="flex gap-6">
                    <button className="hover:text-foreground transition-colors">
                      {t("privacy")}
                    </button>
                    <button className="hover:text-foreground transition-colors">
                      {t("contacts")}
                    </button>
                  </div>
                </div>
              </div>
            </footer>
          </motion.div>
        )}

        {state === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <LoadingState status={jobStatus} onCancel={handleCancel} />
          </motion.div>
        )}

        {state === "result" && recipe && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
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
