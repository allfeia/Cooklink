import { useState } from "react";
import { Youtube, Check, AlertCircle } from "lucide-react";
import { EXAMPLE_RECIPES } from "../features/recipe/recipe";
import { motion } from "motion/react";
import { useLanguage } from "../../context/LanguageContext";
import { parseVideoUrl, type ValidVideoUrl } from "../../../../common/validation/validatePipeline";
import { createRecipeJob, RecipeApiError } from "@/app/api/recipesApi";
import type { ApiRecipeData } from "../features/recipe/recipe";

interface InputSectionProps {
    onSubmit: (result: { recipe: ApiRecipeData; sourceUrl: string; pdfUrl?: string }) => void;
}

export function InputSection({ onSubmit }: InputSectionProps) {
    const [url, setUrl] = useState("");
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [parsed, setParsed] = useState<ValidVideoUrl | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const { t } = useLanguage();

    const errorMessageByCode: Record<string, string> = {
        INVALID_URL: t("errorInvalidUrl"),
        VIDEO_UNAVAILABLE: t("errorVideoUnavailable"),
        VIDEO_TOO_LONG: t("errorVideoTooLong"),
        VIDEO_NO_AUDIO: t("errorVideoNoAudio"),
        NO_SUBTITLES: t("errorNoSubtitles"),
        SUBTITLES_FETCH_FAILED: t("errorSubtitlesFetchFailed"),
        AI_EXTRACTION_FAILED: t("errorAiExtractionFailed"),
        INVALID_JSON_SCHEMA: t("errorInvalidJsonSchema"),
    };

    const handleUrlChange = (value: string) => {
        setUrl(value);
        setErrorMessage(null);

        if (!value) {
            setIsValid(null);
            setParsed(null);
            return;
        }

        const result = parseVideoUrl(value);
        setIsValid(result !== null);
        setParsed(result);

        if (result === null && value.length > 10) {
            setErrorMessage(t("invalidYouTubeUrl"));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!parsed || isSubmitting) return;

        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            const { data, pdf_url } = await createRecipeJob(parsed.sourceUrl);
            if (!data) {
                setErrorMessage(t("errorInternalServer"));
                return;
            }
            onSubmit({ recipe: data, sourceUrl: parsed.sourceUrl, pdfUrl: pdf_url });
        } catch (error) {
            if (error instanceof RecipeApiError) {
                setErrorMessage(errorMessageByCode[error.code] ?? t("errorInternalServer"));
            } else {
                setErrorMessage(t("errorInternalServer"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // const handleExampleClick = (exampleUrl: string) => {
    //   setUrl(exampleUrl);
    //   setIsValid(true);
    //   onSubmit(exampleUrl);
    // };

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
                ${isValid === null && !errorMessage ? "border-border" : ""}
                ${isValid === true && !errorMessage ? "border-green-500 shadow-lg shadow-green-500/20" : ""}
                ${(isValid === false || errorMessage) ? "border-red-500" : ""}
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
                                disabled={isSubmitting}
                            />
                            {isValid === true && !errorMessage && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                >
                                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                                </motion.div>
                            )}
                            {(isValid === false || errorMessage) && (
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            )}
                        </div>
                        {errorMessage && (
                            <motion.p
                                className="text-sm text-red-500 mt-2 ml-1"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                {errorMessage}
                            </motion.p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={!isValid || isSubmitting}
                        className={`
              w-full py-4 rounded-xl font-medium text-white transition-all
              ${isValid && !isSubmitting
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
                                // onClick={() => handleExampleClick(example.url)}
                                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent text-sm text-foreground transition-colors"
                                disabled={isSubmitting}
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