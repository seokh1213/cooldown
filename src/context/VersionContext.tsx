import React, { createContext, useContext, useMemo, useState } from "react";

interface VersionContextValue {
  ddragonVersion: string | null;
  cdragonVersion: string | null;
  setDDragonVersion: (version: string | null) => void;
  setCDragonVersion: (version: string | null) => void;
}

const VersionContext = createContext<VersionContextValue | undefined>(
  undefined
);

interface VersionProviderProps {
  initialDDragonVersion?: string | null;
  children: React.ReactNode;
}

export function VersionProvider({
  initialDDragonVersion = null,
  children,
}: VersionProviderProps) {
  const [ddragonVersion, setDDragonVersion] = useState<string | null>(
    initialDDragonVersion ?? null
  );
  const [cdragonVersion, setCDragonVersion] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      ddragonVersion,
      cdragonVersion,
      setDDragonVersion,
      setCDragonVersion,
    }),
    [ddragonVersion, cdragonVersion]
  );

  return (
    <VersionContext.Provider value={value}>{children}</VersionContext.Provider>
  );
}

export function useVersionContext(): VersionContextValue {
  const ctx = useContext(VersionContext);
  if (!ctx) {
    throw new Error("useVersionContext must be used within VersionProvider");
  }
  return ctx;
}


