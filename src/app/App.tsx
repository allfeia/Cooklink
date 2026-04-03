import { useState } from "react";
import { Header } from "./components/Header";
import { InputSection } from "./components/InputSection";
import { LoadingState } from "./components/LoadingState";
import { RecipeCard } from "./components/RecipeCard";
import { Toaster } from "./components/ui/sonner";
import { Recipe, MOCK_RECIPE } from "./types/recipe";
import { motion, AnimatePresence } from "motion/react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { searchDishImage } from "./utils/imageSearch";

type AppState = "input" | "loading" | "result";

function AppContent() {
  const [state, setState] = useState<AppState>("input");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const { t } = useLanguage();

  const handleSubmit = async (url: string) => {
    setState("loading");

    // Симуляция обработки (в реальном приложении здесь будет API запрос)
    setTimeout(async () => {
      const recipeWithYoutube = {
        ...MOCK_RECIPE,
        youtubeUrl: url,
      };

      // Generate dish image based on recipe title
      const dishImage = await searchDishImage(recipeWithYoutube.title);
      const finalRecipe = {
        ...recipeWithYoutube,
        dishImage,
      };

      setRecipe(finalRecipe);
      setState("result");
    }, 6000); // 6 секунд для демонстрации
  };

  const handleCancel = () => {
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
            <InputSection onSubmit={handleSubmit} />

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
            <LoadingState onCancel={handleCancel} />
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
