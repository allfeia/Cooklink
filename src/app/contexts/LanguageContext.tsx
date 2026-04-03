import { createContext, useContext, useState } from "react";

type Language = "ru" | "en";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
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
    howItWorks: "Как это работает",
    // Hero
    heroTitle: "Перестань перематывать.\nНачни готовить.",
    heroSubtitle: "Вставь ссылку на YouTube, получи красивый рецепт",
    // Input
    placeholder: "https://youtube.com/watch?v=...",
    generateRecipe: "Сгенерировать рецепт",
    invalidYouTubeUrl: "Неверная ссылка на YouTube",
    tryExamples: "Попробуйте примеры для быстрого теста:",
    // Loading
    analyzing: "Анализируем видео...",
    extracting: "Извлекаем ингредиенты и шаги...",
    generating: "Генерируем красивый рецепт...",
    cancel: "Отмена",
    // Recipe
    back: "Назад",
    share: "Поделиться",
    downloadPDF: "Скачать PDF",
    time: "Время",
    minutes: "мин",
    difficulty: "Сложность",
    servings: "Порции",
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
    copyright: "© 2026 ГОТОВЬ.ai. Все права защищены.",
    privacy: "Политика конфиденциальности",
    contacts: "Контакты",
    // How it works modal
    howItWorksTitle: "Как работает ГОТОВЬ.ai",
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
    // Examples
    exampleCarbonara: "Паста Карбонара",
    exampleBorscht: "Классический Борщ",
    exampleNapoleon: "Торт Наполеон",
    // Recipe types
    mainDish: "Основное блюдо",
    dessert: "Десерт",
    soup: "Суп",
  },
  en: {
    // Brand
    brandName: "CookLink.ai",
    // Header
    howItWorks: "How it works",
    // Hero
    heroTitle: "Stop rewinding.\nStart cooking.",
    heroSubtitle: "Paste a YouTube link, get a beautiful recipe",
    // Input
    placeholder: "https://youtube.com/watch?v=...",
    generateRecipe: "Generate recipe",
    invalidYouTubeUrl: "Invalid YouTube URL",
    tryExamples: "Try examples for a quick test:",
    // Loading
    analyzing: "Analyzing video...",
    extracting: "Extracting ingredients and steps...",
    generating: "Generating beautiful recipe...",
    cancel: "Cancel",
    // Recipe
    back: "Back",
    share: "Share",
    downloadPDF: "Download PDF",
    time: "Time",
    minutes: "min",
    difficulty: "Difficulty",
    servings: "Servings",
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
    copyright: "© 2026 CookLink.ai. All rights reserved.",
    privacy: "Privacy Policy",
    contacts: "Contacts",
    // How it works modal
    howItWorksTitle: "How CookLink.ai works",
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
    // Examples
    exampleCarbonara: "Pasta Carbonara",
    exampleBorscht: "Classic Borscht",
    exampleNapoleon: "Napoleon Cake",
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

  const toggleLanguage = () => {
    const newLang = language === "ru" ? "en" : "ru";
    setLanguage(newLang);
    localStorage.setItem("language", newLang);
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.ru] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
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
