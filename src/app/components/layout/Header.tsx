import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../overlays/dialog";
import { useLanguage } from "../../context/LanguageContext";
import { ClBurst } from "../decor/ClDecor";
import { ThemeLangControls } from "./ThemeLangControls";

export function Header() {
  const { t } = useLanguage();

  return (
    <header>
      <div className="cl-topbar">
        <ThemeLangControls />

        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="cl-pill">
              {t("howItWorks")}
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

      <div className="cl-awning">
        <ClBurst className="cl-burst spin" />
        <span className="cl-script-word">cooklink</span>
        <h1 className="cl-wordmark">
          COOKLINK<i>.ai</i>
        </h1>
        <p className="cl-tagline">{t("heroTitle")}</p>
      </div>
      <div className="cl-valance" aria-hidden="true" />
    </header>
  );
}
