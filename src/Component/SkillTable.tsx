import React, { useMemo, useState, useCallback } from "react";
import styled from "styled-components";
import { PASSIVE_ICON_URL, SKILL_ICON_URL } from "../api";
import { Champion } from "../types";

const GridLayout = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  flex: 1;
  place-items: center;
  color: #676869;
  row-gap: 4px;
  font-size: 1.15em;
`;

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
    <div
      style={{
        position: "relative",
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {!isLoaded && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: "#1a1a1a",
            borderRadius: "5px",
          }}
        />
      )}
      <img
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "5px",
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.2s ease-in-out",
        }}
        src={src}
        alt={rule || "passive"}
        loading="lazy"
        onLoad={handleLoad}
      />
      {rule && (
        <div
          style={{
            borderRadius: "5px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            bottom: "0",
            right: "0",
            width: `${SKILL_SIZE / 2}px`,
            height: `${SKILL_SIZE / 2}px`,
            backgroundColor: "rgba(0,0,0,.7)",
            color: "white",
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
      <div style={{ fontSize: "0.9em", fontWeight: "400" }}>{lv}lv</div>
      {cooldown.map((cool, idx) => (
        <div style={{ color: "#373839", fontSize: "1.2em" }} key={idx}>
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
    <GridLayout>
      <SkillIcon src={passiveIconUrl} />
      {championInfo.spells.map((skill, idx) => (
        <SkillIcon
          key={skill.id}
          src={SKILL_ICON_URL(version, skill.id)}
          rule={SKILL_LETTERS[idx]}
        />
      ))}
      {skills}
    </GridLayout>
  );
}

export default React.memo(SkillTable);
