import { useState } from "react";
import { motion } from "motion/react";
import { useLanguage } from "../../context/LanguageContext";
import { parseVideoUrl, type ValidVideoUrl } from "../../../../common/validation/validatePipeline";
import { createRecipeJob, RecipeApiError } from "@/app/api/recipesApi";
import { getRecipeErrorMessage } from "@/app/lib/recipeErrorMessages";
import { ClArrow, ClLinkIcon } from "../decor/ClDecor";
import { Header } from "../layout/Header";

interface InputSectionProps {
    onJobCreated: (result: { jobId: string; sourceUrl: string }) => void;
}

export function InputSection({ onJobCreated }: InputSectionProps) {
    const [url, setUrl] = useState("");
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [parsed, setParsed] = useState<ValidVideoUrl | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const { t } = useLanguage();

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
            const { job_id } = await createRecipeJob(parsed.sourceUrl);
            onJobCreated({ jobId: job_id, sourceUrl: parsed.sourceUrl });
        } catch (error) {
            if (error instanceof RecipeApiError) {
                setErrorMessage(getRecipeErrorMessage(error.code, t));
            } else {
                setErrorMessage(t("errorInternalServer"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasError = isValid === false || Boolean(errorMessage);
    const formState = hasError ? "is-error" : isValid === true ? "is-valid" : "";

    return (
        <>
            <Header />

            <div className="cl-body flex-1 flex flex-col">
              <motion.section
                className="cl-section flex-1 flex flex-col justify-center"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <h2 className="cl-heading">{t("inputHeading")}</h2>
                <p className="cl-subhead">{t("inputSubhead")}</p>

                <form onSubmit={handleSubmit} className={`cl-form ${formState}`}>
                    <label className="sr-only" htmlFor="cl-url">
                        {t("placeholder")}
                    </label>
                    <span className="cl-field">
                        <ClLinkIcon />
                        <input
                            id="cl-url"
                            type="text"
                            value={url}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            placeholder={t("placeholder")}
                            disabled={isSubmitting}
                        />
                        {isValid === true && !hasError && (
                            <span className="cl-mark" aria-hidden="true">✓</span>
                        )}
                        {hasError && (
                            <span className="cl-mark" aria-hidden="true">✕</span>
                        )}
                    </span>
                    <button
                        type="submit"
                        className="cl-go"
                        disabled={!isValid || isSubmitting}
                        aria-label={t("generateRecipe")}
                        title={t("generateRecipe")}
                    >
                        <ClArrow />
                    </button>
                </form>

                {errorMessage && (
                    <motion.p
                        className="cl-field-note err"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        {errorMessage}
                    </motion.p>
                )}
              </motion.section>

              <p className="cl-footlinks">
                <span>{t("copyright")}</span>
                <button type="button">{t("privacy")}</button>
                <span className="sep">·</span>
                <button type="button">{t("contacts")}</button>
              </p>
            </div>
        </>
    );
}
