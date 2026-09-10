import { Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";

export function ThemeLangControls() {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();

  return (
    <>
      <button
        type="button"
        className="cl-icon-btn"
        onClick={toggleLanguage}
        aria-label="Toggle language"
        title={language === "ru" ? "Switch to English" : "Переключить на русский"}
      >
        <Languages className="w-5 h-5" />
        <span>{language.toUpperCase()}</span>
      </button>

      <button
        type="button"
        className="cl-icon-btn"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === "light" ? (
          <Moon className="w-5 h-5" />
        ) : (
          <Sun className="w-5 h-5" />
        )}
      </button>
    </>
  );
}
