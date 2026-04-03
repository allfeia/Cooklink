import { useState } from "react";
import { Youtube, Check, AlertCircle } from "lucide-react";
import { EXAMPLE_RECIPES } from "../types/recipe";
import { motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";

interface InputSectionProps {
  onSubmit: (url: string) => void;
}

export function InputSection({ onSubmit }: InputSectionProps) {
  const [url, setUrl] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const { t } = useLanguage();

  const validateYouTubeUrl = (url: string): boolean => {
    if (!url) return false;
    const patterns = [
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError("");

    if (value.length === 0) {
      setIsValid(null);
      return;
    }

    const valid = validateYouTubeUrl(value);
    setIsValid(valid);

    if (!valid && value.length > 10) {
      setError(t("invalidYouTubeUrl"));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(url);
    }
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setIsValid(true);
    setError("");
    onSubmit(exampleUrl);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 md:py-20">
      <motion.div
        className="max-w-3xl w-full space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Hero Text */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground whitespace-pre-line">
            {t("heroTitle")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("heroSubtitle")}
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div
              className={`
                relative flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all
                bg-background
                ${isValid === null ? "border-border" : ""}
                ${isValid === true ? "border-green-500 shadow-lg shadow-green-500/20" : ""}
                ${isValid === false && url.length > 10 ? "border-red-500" : ""}
                focus-within:border-[#2563EB] focus-within:shadow-lg focus-within:shadow-blue-500/20
              `}
            >
              <Youtube className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={t("placeholder")}
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                aria-label={t("placeholder")}
              />
              {isValid === true && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                </motion.div>
              )}
              {isValid === false && url.length > 10 && (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
            </div>
            {error && (
              <motion.p
                className="text-sm text-red-500 mt-2 ml-1"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className={`
              w-full py-4 rounded-xl font-medium text-white transition-all
              ${isValid
                ? "bg-[#2563EB] hover:bg-[#1d4ed8] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
                : "bg-muted text-muted-foreground cursor-not-allowed"
              }
            `}
            aria-label={t("generateRecipe")}
          >
            {t("generateRecipe")}
          </button>
        </form>

        {/* Examples */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            {t("tryExamples")}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {Object.entries(EXAMPLE_RECIPES).map(([key, example]) => (
              <button
                key={key}
                onClick={() => handleExampleClick(example.url)}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent text-sm text-foreground transition-colors"
              >
                {t(`example${key.charAt(0).toUpperCase() + key.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
