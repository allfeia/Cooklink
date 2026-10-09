import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Recipe } from "./recipe";
import { DISH_IMAGE_ENABLED } from "../image/imageSearch";
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
      navigator
        .share({
          title: recipe.title,
          text: `${t("preparation")}: ${recipe.title}`,
        })
        .then(() => {
          toast.success(t("recipeShared"));
        })
        .catch(() => {
          // User cancelled
        });
    } else {
      toast.info(t("shareUnavailable"));
    }
  };

  return (
    <>
      <div className="cl-recipe-bar">
        <button type="button" className="cl-pill two" onClick={onBack}>
          ← {t("back")}
        </button>
      </div>

      <div className="cl-body flex-1">
        <motion.section
          className="cl-section"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <h2 className="cl-heading dish">{recipe.title}</h2>

        <p className="cl-meta">
          <span>
            {t("time")}: <b>{recipe.time} {t("minutes")}</b>
          </span>
          <span>
            {t("servings")}: <b>{recipe.servings}</b>
          </span>
          <span>
            {t("type")}: <b>{recipe.type}</b>
          </span>
        </p>

        {DISH_IMAGE_ENABLED && (
          <div className="cl-photo">
            {recipe.dishImage ? (
              <img src={recipe.dishImage} alt={recipe.title} />
            ) : (
              <span>{recipe.title}</span>
            )}
          </div>
        )}

        <div className="cl-rgrid">
          <div>
            <h3 className="cl-rubric">{t("ingredients")}</h3>
            <ul className="cl-ings">
              {recipe.ingredients.map((ingredient, index) => {
                const amount = [ingredient.quantity, ingredient.unit]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                return (
                  <li key={index}>
                    <span className="nm">{ingredient.name}</span>
                    <span className="ld" />
                    {amount && <span className="am">{amount}</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="cl-rubric">{t("preparation")}</h3>
            <ol className="cl-steps">
              {recipe.steps.map((step, index) => (
                <li key={index}>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {recipe.comment && (
            <p className="cl-chef">💭 {recipe.comment}</p>
          )}

          <div className="cl-kbju" aria-label={t("calories")}>
            <div>
              <span className="v">{recipe.nutrition.calories}</span>
              <span className="k">{t("calories")}</span>
            </div>
            <div>
              <span className="v">{recipe.nutrition.protein}</span>
              <span className="k">{t("protein")}</span>
            </div>
            <div>
              <span className="v">{recipe.nutrition.fat}</span>
              <span className="k">{t("fat")}</span>
            </div>
            <div>
              <span className="v">{recipe.nutrition.carbs}</span>
              <span className="k">{t("carbs")}</span>
            </div>
          </div>

          <div className="cl-rfoot cl-actions">
            {recipe.youtubeUrl && (
              <a
                href={recipe.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-pill two"
              >
                {t("watchOnYouTube")}
              </a>
            )}
            <button
              type="button"
              className="cl-pill"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              {t("downloadPDF")}
            </button>
            <button type="button" className="cl-pill two" onClick={handleShare}>
              {t("share")}
            </button>
            <button type="button" className="cl-pill two" onClick={onNewRecipe}>
              {t("newRecipe")}
            </button>
          </div>
        </div>
        </motion.section>
      </div>
    </>
  );
}
