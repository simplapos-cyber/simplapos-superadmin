import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { SupportedLang, TranslationKey, t, getStoredLang, setStoredLang } from "@/lib/i18n";

interface LanguageContextType {
  lang: SupportedLang;
  setLang: (lang: SupportedLang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "de",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>(getStoredLang);

  const setLang = useCallback((newLang: SupportedLang) => {
    setLangState(newLang);
    setStoredLang(newLang);
  }, []);

  const translate = useCallback((key: TranslationKey) => t(lang, key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
