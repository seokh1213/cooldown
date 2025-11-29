import React from "react";

interface SplashScreenProps {
  logo?: string;
}

function SplashScreen({ logo }: SplashScreenProps) {
  const logoPath = logo || `${import.meta.env.BASE_URL}poro_logo.png`;
  
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse">
          <img
            src={logoPath}
            alt="Loading"
            className="w-32 h-32 object-contain shadow-none border-none"
          />
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;

