import { useState, useEffect } from "react";

export type DeviceType = "mobile" | "desktop";

const MOBILE_BREAKPOINT = 768;

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>(() => {
    if (typeof window === "undefined") return "desktop";
    return window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop";
  });

  useEffect(() => {
    const checkDeviceType = () => {
      setDeviceType(
        window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop"
      );
    };

    checkDeviceType();
    window.addEventListener("resize", checkDeviceType);
    return () => window.removeEventListener("resize", checkDeviceType);
  }, []);

  return deviceType;
}

