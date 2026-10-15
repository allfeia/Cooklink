import { useEffect, useRef, useState } from "react";
import { BrowserRouter, useLocation, useMatch, useNavigate } from "react-router";
import { toast } from "sonner";
import { InputSection } from "./components/forms/InputSection";
import { LoadingState } from "./components/states/LoadingState";
import { RecipeCard } from "./components/features/recipe/RecipeCard";
import { Toaster } from "./components/feedback/sonner";
import { Recipe, mapApiRecipeToRecipe } from "./components/features/recipe/recipe";
import { motion, AnimatePresence } from "motion/react";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { DISH_IMAGE_ENABLED, searchDishImage } from "@/app/components/features/image/imageSearch";
import { pollRecipeJob, cancelRecipeJob, PollCancelledError, RecipeApiError, type JobStatus } from "@/app/api/recipesApi";
import { getRecipeErrorMessage } from "@/app/lib/recipeErrorMessages";

type AppState = "input" | "loading" | "result";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AppContent() {
  const [state, setState] = useState<AppState>("input");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("scanning");
  const pollAbortRef = useRef<AbortController | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeMatch = useMatch("/recipe/:jobId");
  const routeJobId = routeMatch?.params.jobId ?? null;

  const stopTracking = () => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    currentJobIdRef.current = null;
  };

  const trackJob = (jobId: string) => {
    pollAbortRef.current?.abort();
    setJobStatus("scanning");
    setState("loading");
    currentJobIdRef.current = jobId;

    const controller = new AbortController();
    pollAbortRef.current = controller;

    pollRecipeJob(jobId, { onStatusChange: setJobStatus, signal: controller.signal })
      .then(async (job) => {
        if (!job.data) {
          toast.error(t("errorInternalServer"));
          navigate("/", { replace: true });
          return;
        }
        const mapped = mapApiRecipeToRecipe(job.data, job.source_url, job.pdf_url);
        const dishImage = DISH_IMAGE_ENABLED ? await searchDishImage(mapped.title) : "";
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
        navigate("/", { replace: true });
      });
  };

  const handleJobCreated = ({ jobId }: { jobId: string; sourceUrl: string }) => {
    trackJob(jobId);
    navigate(`/recipe/${jobId}`);
  };

  useEffect(() => {
    if (routeJobId) {
      if (!JOB_ID_PATTERN.test(routeJobId)) {
        navigate("/", { replace: true });
        return;
      }
      if (currentJobIdRef.current !== routeJobId) {
        trackJob(routeJobId);
      }
      return;
    }

    stopTracking();
    setState("input");
    if (pathname !== "/") {
      navigate("/", { replace: true });
    }
  }, [routeJobId, pathname]);

  useEffect(() => stopTracking, []);

  const handleCancel = () => {
    const jobId = currentJobIdRef.current;
    stopTracking();
    if (jobId) {
      cancelRecipeJob(jobId).catch((error) => {
        console.error("Не удалось отменить задачу на сервере:", error);
      });
    }
    setRecipe(null);
    navigate("/");
  };

  const handleBack = () => {
    navigate("/");
  };

  const handleNewRecipe = () => {
    setRecipe(null);
    navigate("/");
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
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}
