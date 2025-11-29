import React from "react";
import { useTranslation } from "@/i18n";

function LaningTipsPage() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-4">{t.pages.laningTips.title}</h1>
      <p className="text-muted-foreground">
        {t.pages.laningTips.description}
      </p>
    </div>
  );
}

export default LaningTipsPage;

