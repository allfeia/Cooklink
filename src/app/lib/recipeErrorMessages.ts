export function getRecipeErrorMessage(code: string, t: (key: string) => string): string {
    const errorMessageByCode: Record<string, string> = {
        INVALID_URL: t("errorInvalidUrl"),
        VIDEO_UNAVAILABLE: t("errorVideoUnavailable"),
        VIDEO_TOO_LONG: t("errorVideoTooLong"),
        VIDEO_NO_AUDIO: t("errorVideoNoAudio"),
        NO_SUBTITLES: t("errorNoSubtitles"),
        SUBTITLES_FETCH_FAILED: t("errorSubtitlesFetchFailed"),
        AI_EXTRACTION_FAILED: t("errorAiExtractionFailed"),
        INVALID_JSON_SCHEMA: t("errorInvalidJsonSchema"),
        LLM_RATE_LIMITED: t("errorLlmRateLimited"),
    };

    return errorMessageByCode[code] ?? t("errorInternalServer");
}
