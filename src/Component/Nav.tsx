import React, { useCallback } from "react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface NavProps {
  version?: string;
  lang: string;
  selectHandler: (lang: string) => void;
}

function Nav({ version = "10.8.1", lang, selectHandler }: NavProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      selectHandler(e.target.value);
    },
    [selectHandler]
  );

  return (
    <>
      <nav className="box-border w-full max-w-[600px] mx-auto px-2.5 py-2.5 flex items-baseline">
        <div className="text-lg font-semibold">Cooldown</div>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">v{version}</div>
        <Select
          defaultValue={lang}
          onChange={handleChange}
          className="ml-2 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <option value="ko_KR">한국어</option>
          <option value="en_US">Eng</option>
        </Select>
      </nav>
      <div className="w-full h-px bg-border" />
    </>
  );
}

export default React.memo(Nav);
