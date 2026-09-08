import { createContext, useContext, useState } from "react";

type Language = "ru" | "en";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const translations = {
  ru: {
    // Brand
    brandName: "ГОТОВЬ.ai",
    // Header
    howItWorks: "как это работает?",
    theme: "тема",
    // Hero
    heroTitle: "Перестань перематывать.\nНачни готовить.",
    heroSubtitle: "Вставь ссылку на YouTube, получи красивый рецепт",
    // Input
    inputHeading: "Вставь ссылку на YouTube",
    inputSubhead: "получи красивый рецепт",
    placeholder: "https://youtube.com/watch?v=...",
    generateRecipe: "Сгенерировать рецепт",
    invalidYouTubeUrl: "Неверная ссылка на YouTube",
    // Панель «какие видео подойдут»
    recoTitle: "Какие видео подойдут",
    recoItem1: "кулинарное видео, где рецепт проговаривают вслух",
    recoItem2: "не длиннее 15 минут",
    recoItem3: "публичное, с субтитрами (или авто) на русском или английском",
    recoItem4: "ссылка с YouTube",
    recoNo: "не выйдет: клип под музыку · приватное видео · длиннее 15 минут",
    // Errors
    errorInvalidUrl: "Неверный формат ссылки",
    errorVideoUnavailable: "Видео недоступно",
    errorVideoTooLong: "Видео длиннее 15 минут",
    errorVideoNoAudio: "В видео отсутствует аудиодорожка",
    errorNoSubtitles: "В видео нет субтитров",
    errorSubtitlesFetchFailed: "Не удалось получить субтитры, попробуйте позже",
    errorAiExtractionFailed: "Не удалось извлечь рецепт из видео",
    errorInvalidJsonSchema: "Не удалось обработать ответ AI, попробуйте ещё раз",
    errorLlmRateLimited: "Сервис генерации рецептов временно перегружен, попробуйте позже",
    errorInternalServer: "Внутренняя ошибка сервера",
    // Loading
    analyzing: "Анализируем видео...",
    fetchingSubtitles: "Получаем субтитры...",
    extracting: "Извлекаем ингредиенты и шаги...",
    generating: "Генерируем красивый рецепт...",
    cancel: "Отмена",
    // Recipe
    back: "Назад",
    share: "Поделиться",
    downloadPDF: "Скачать PDF",
    time: "Время",
    minutes: "мин",
    servings: "Порции",
    calories: "Калории",
    protein: "Белки",
    fat: "Жиры",
    carbs: "Углеводы",
    type: "Тип",
    ingredients: "Ингредиенты",
    preparation: "Приготовление",
    newRecipe: "Новый рецепт",
    pdfSuccess: "PDF успешно сохранен!",
    pdfError: "Не удалось создать PDF",
    recipeShared: "Рецепт отправлен!",
    shareUnavailable: "Функция поделиться недоступна в вашем браузере",
    sourceVideo: "Оригинальное видео",
    watchOnYouTube: "Смотреть на YouTube",
    // Footer
    copyright: "© 2026 cooklink.ai. Все права защищены.",
    privacy: "Политика конфиденциальности",
    contacts: "Контакты",
    // How it works modal
    howItWorksTitle: "Как работает cooklink.ai",
    step1Title: "1. Вставьте ссылку",
    step1Text:
      "Скопируйте URL видео-рецепта с YouTube и вставьте в поле ввода.",
    step2Title: "2. Анализ видео",
    step2Text:
      "Наш AI анализирует содержимое видео, извлекает ингредиенты и шаги приготовления.",
    step3Title: "3. Получите рецепт",
    step3Text:
      "Через 10-40 секунд вы получите структурированный рецепт с возможностью скачивания PDF.",
    note: "Примечание:",
    noteText:
      "Для наилучших результатов используйте видео с четкими инструкциями и списком ингредиентов.",
    // Recipe types
    mainDish: "Основное блюдо",
    dessert: "Десерт",
    soup: "Суп",
  },
  en: {
    // Brand
    brandName: "CookLink.ai",
    // Header
    howItWorks: "how it works?",
    theme: "theme",
    // Hero
    heroTitle: "Stop rewinding.\nStart cooking.",
    heroSubtitle: "Paste a YouTube link, get a beautiful recipe",
    // Input
    inputHeading: "Paste a YouTube link",
    inputSubhead: "get a beautiful recipe",
    placeholder: "https://youtube.com/watch?v=...",
    generateRecipe: "Generate recipe",
    invalidYouTubeUrl: "Invalid YouTube URL",
    // "Which videos work" panel
    recoTitle: "Which videos work",
    recoItem1: "a cooking video where the recipe is spoken aloud",
    recoItem2: "15 minutes or shorter",
    recoItem3: "public, with subtitles (or auto-captions) in Russian or English",
    recoItem4: "a YouTube link",
    recoNo: "won't work: music-only clip · private video · longer than 15 min",
    // Errors
    errorInvalidUrl: "Invalid link format",
    errorVideoUnavailable: "Video unavailable",
    errorVideoTooLong: "Video is longer than 15 minutes",
    errorVideoNoAudio: "Video has no audio track",
    errorNoSubtitles: "No subtitles available for this video",
    errorSubtitlesFetchFailed: "Failed to fetch subtitles, please try again",
    errorAiExtractionFailed: "Couldn't extract a recipe from this video",
    errorInvalidJsonSchema: "Failed to process the AI response, please try again",
    errorLlmRateLimited: "Recipe generation service is temporarily overloaded, please try again later",
    errorInternalServer: "Internal server error",
    // Loading
    analyzing: "Analyzing video...",
    fetchingSubtitles: "Fetching subtitles...",
    extracting: "Extracting ingredients and steps...",
    generating: "Generating beautiful recipe...",
    cancel: "Cancel",
    // Recipe
    back: "Back",
    share: "Share",
    downloadPDF: "Download PDF",
    time: "Time",
    minutes: "min",
    servings: "Servings",
    calories: "Calories",
    protein: "Protein",
    fat: "Fat",
    carbs: "Carbs",
    type: "Type",
    ingredients: "Ingredients",
    preparation: "Preparation",
    newRecipe: "New recipe",
    pdfSuccess: "PDF saved successfully!",
    pdfError: "Failed to create PDF",
    recipeShared: "Recipe shared!",
    shareUnavailable: "Share feature is not available in your browser",
    sourceVideo: "Source video",
    watchOnYouTube: "Watch on YouTube",
    // Footer
    copyright: "© 2026 cooklink.ai. All rights reserved.",
    privacy: "Privacy Policy",
    contacts: "Contacts",
    // How it works modal
    howItWorksTitle: "How cooklink.ai works",
    step1Title: "1. Paste a link",
    step1Text: "Copy a YouTube recipe video URL and paste it into the input field.",
    step2Title: "2. Video analysis",
    step2Text:
      "Our AI analyzes the video content, extracts ingredients and cooking steps.",
    step3Title: "3. Get the recipe",
    step3Text:
      "In 10-40 seconds you'll get a structured recipe with PDF download option.",
    note: "Note:",
    noteText:
      "For best results, use videos with clear instructions and ingredient lists.",
    // Recipe types
    mainDish: "Main dish",
    dessert: "Dessert",
    soup: "Soup",
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem("language") as Language;
    return stored || "ru";
  });

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const toggleLanguage = () => {
    changeLanguage(language === "ru" ? "en" : "ru");
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.ru] || key;
  };

  return (
    <LanguageContext.Provider
      value={{ language, toggleLanguage, setLanguage: changeLanguage, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
