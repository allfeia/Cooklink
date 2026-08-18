import { ArrowLeft, Download, Share2, Clock, Users, ChefHat, ExternalLink, Flame } from "lucide-react";
import { useState } from "react";
import { Recipe } from "./recipe";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useLanguage } from "../../../context/LanguageContext";

interface RecipeCardProps {
  recipe: Recipe;
  onBack: () => void;
  onNewRecipe: () => void;
}

export function RecipeCard({ recipe, onBack, onNewRecipe }: RecipeCardProps) {
  const { t } = useLanguage();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!recipe.pdfUrl || isDownloading) {
      toast.error(t("pdfError"));
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch(recipe.pdfUrl, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const link = document.createElement("a");
      link.href = recipe.pdfUrl;
      link.download = `${recipe.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success(t("pdfSuccess"));
    } catch (error) {
      console.error("Ошибка при скачивании PDF:", error);
      toast.error(t("pdfError"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: recipe.title,
        text: `${t("preparation")}: ${recipe.title}`,
      }).then(() => {
        toast.success(t("recipeShared"));
      }).catch(() => {
        // User cancelled
      });
    } else {
      toast.info(t("shareUnavailable"));
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">{t("back")}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="px-4 py-2 flex items-center gap-2 rounded-lg border border-border hover:bg-muted transition-colors"
              aria-label={t("share")}
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("share")}</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-4 py-2 flex items-center gap-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label={t("downloadPDF")}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("downloadPDF")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recipe Content */}
      <div className="flex-1 overflow-y-auto bg-muted/30">
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
          <motion.div
            className="max-w-5xl mx-auto bg-background rounded-2xl shadow-xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* AI Generated Dish Image */}
            {recipe.dishImage && (
              <div className="w-full h-64 md:h-96 overflow-hidden">
                <img
                  src={recipe.dishImage}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Recipe Header */}
            <div className="p-6 md:p-10 border-b border-border">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                {recipe.title}
              </h1>

              {/* Meta Info */}
              <div className="grid grid-cols-2 md:flex md:flex-wrap gap-4 md:gap-6">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("time")}</p>
                    <p className="font-medium">{recipe.time} {t("minutes")}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("servings")}</p>
                    <p className="font-medium">{recipe.servings}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("type")}</p>
                    <p className="font-medium">{recipe.type}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">КБЖУ на 100г</p>
                    <p className="font-medium">
                      К {recipe.nutrition.calories} · Б {recipe.nutrition.protein} · Ж {recipe.nutrition.fat} · У {recipe.nutrition.carbs}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipe Body */}
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Ingredients */}
              <div className="p-6 md:p-10">
                <h2 className="text-xl font-bold text-foreground mb-4">
                  {t("ingredients")}
                </h2>
                <ul className="space-y-3">
                  {recipe.ingredients.map((ingredient, index) => {
                    const amount = [ingredient.quantity, ingredient.unit]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                    return (
                      <li
                        key={index}
                        className="flex items-start gap-3 text-foreground"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#2563EB] mt-2 flex-shrink-0" />
                        <span>
                          {ingredient.name}
                          {amount && (
                            <>
                              {" "}—{" "}
                              <span className="font-medium">{amount}</span>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Steps */}
              <div className="p-6 md:p-10">
                <h2 className="text-xl font-bold text-foreground mb-4">
                  {t("preparation")}
                </h2>
                <ol className="space-y-4">
                  {recipe.steps.map((step, index) => (
                    <li key={index} className="flex gap-4">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                      <p className="text-foreground pt-1">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Comment */}
            {recipe.comment && (
              <div className="p-6 md:p-10 bg-muted">
                <p className="text-sm md:text-base text-muted-foreground italic">
                  💭 {recipe.comment}
                </p>
              </div>
            )}

            {/* YouTube Link */}
            {recipe.youtubeUrl && (
              <div className="p-6 md:p-10 border-t border-border">
                <a
                  href={recipe.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span className="font-medium">{t("watchOnYouTube")}</span>
                </a>
              </div>
            )}
          </motion.div>

          {/* Bottom Actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 max-w-5xl mx-auto">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex-1 py-4 px-6 flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-5 h-5" />
              {t("downloadPDF")}
            </button>
            <button
              onClick={onNewRecipe}
              className="flex-1 py-4 px-6 rounded-xl border-2 border-border hover:bg-muted transition-colors font-medium"
            >
              {t("newRecipe")}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Button */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <button
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="w-full py-4 flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-white shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Download className="w-5 h-5" />
          {t("downloadPDF")}
        </button>
      </div>
    </div>
  );
}
