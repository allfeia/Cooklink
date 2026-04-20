import { Info, Moon, Sun, Languages } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../overlays/dialog";
import { Logo } from "./Logo";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo />
          <h1 className="font-semibold text-foreground">{t("brandName")}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle language"
            title={language === "ru" ? "Switch to English" : "Переключить на русский"}
          >
            <div className="flex items-center gap-1.5">
              <Languages className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {language.toUpperCase()}
              </span>
            </div>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Sun className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          {/* How It Works */}
          <Dialog>
            <DialogTrigger asChild>
              <button
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("howItWorks")}
              >
                <Info className="w-5 h-5" />
                <span className="hidden sm:inline">{t("howItWorks")}</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("howItWorksTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-muted-foreground">
                <div className="space-y-2">
                  <h3 className="font-medium text-foreground">{t("step1Title")}</h3>
                  <p>{t("step1Text")}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium text-foreground">{t("step2Title")}</h3>
                  <p>{t("step2Text")}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium text-foreground">{t("step3Title")}</h3>
                  <p>{t("step3Text")}</p>
                </div>
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong className="text-foreground">{t("note")}</strong> {t("noteText")}
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
