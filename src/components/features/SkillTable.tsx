import React, { useMemo, useState, useCallback } from "react";
import { PASSIVE_ICON_URL, SKILL_ICON_URL } from "@/services/api";
import { Champion } from "@/types";
import { cn } from "@/lib/utils";

const PASSIVE_SIZE = 37.5;
const SKILL_SIZE = 50;
const SKILL_LETTERS = ["Q", "W", "E", "R"] as const;

interface SkillIconProps {
  src: string;
  rule?: string;
}

const SkillIcon = React.memo(function SkillIcon({ src, rule }: SkillIconProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const size = rule ? SKILL_SIZE : PASSIVE_SIZE;

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="relative" style={{ width: `${size}px`, height: `${size}px` }}>
      {!isLoaded && (
        <div
          className="absolute top-0 left-0 bg-muted rounded"
          style={{ width: `${size}px`, height: `${size}px` }}
        />
      )}
      <img
        className={cn(
          "w-full h-full rounded transition-opacity duration-200",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        src={src}
        alt={rule ? `${rule} skill` : "Passive skill"}
        loading="lazy"
        onLoad={handleLoad}
        role="img"
      />
      {rule && (
        <div
          className="absolute bottom-0 right-0 rounded flex items-center justify-center bg-black/70 text-white text-xs"
          style={{
            width: `${SKILL_SIZE / 2}px`,
            height: `${SKILL_SIZE / 2}px`,
          }}
        >
          {rule}
        </div>
      )}
    </div>
  );
});

SkillIcon.displayName = "SkillIcon";

interface SkillInfoProps {
  lv: number;
  cooldown: (number | string)[];
}

const SkillInfo = React.memo(function SkillInfo({ lv, cooldown }: SkillInfoProps) {
  return (
    <>
      <div className="text-sm font-normal text-muted-foreground">{lv}lv</div>
      {cooldown.map((cool, idx) => (
        <div className="text-lg text-foreground" key={idx}>
          {cool !== "" ? `${cool}s` : ""}
        </div>
      ))}
    </>
  );
});

SkillInfo.displayName = "SkillInfo";

interface SkillTableProps {
  championInfo: Champion;
  version: string;
}

function SkillTable({ championInfo, version }: SkillTableProps) {
  const skills = useMemo(() => {
    if (!championInfo.spells) return [];

    const maxLv = championInfo.spells.reduce(
      (acc, v) => Math.max(acc, v.maxrank),
      0
    );

    return Array.from({ length: maxLv }, (_, i) => {
      const cooldown = championInfo.spells!.map((skill) =>
        skill.cooldown[i] !== undefined ? skill.cooldown[i] : ""
      );
      return <SkillInfo key={i} lv={i + 1} cooldown={cooldown} />;
    });
  }, [championInfo.spells]);

  if (!championInfo.spells) return null;

  const passiveIconUrl = PASSIVE_ICON_URL(
    version,
    championInfo.passive?.image?.full || ""
  );

  return (
    <div 
      className="grid grid-cols-5 flex-1 place-items-center text-muted-foreground text-lg gap-y-1"
      role="grid"
      aria-label="Champion skills"
    >
      <SkillIcon src={passiveIconUrl} />
      {championInfo.spells.map((skill, idx) => (
        <SkillIcon
          key={skill.id}
          src={SKILL_ICON_URL(version, skill.id)}
          rule={SKILL_LETTERS[idx]}
        />
      ))}
      {skills}
    </div>
  );
}

export default React.memo(SkillTable);
