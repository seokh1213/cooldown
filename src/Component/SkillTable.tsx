import React from "react";
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

interface SkillIconProps {
  src: string;
  rule?: string;
}

const SkillIcon = function ({ src, rule }: SkillIconProps) {
  return (
    <div
      style={{
        position: "relative",
        width: rule ? SKILL_SIZE + "px" : PASSIVE_SIZE + "px",
        height: rule ? SKILL_SIZE + "px" : PASSIVE_SIZE + "px",
      }}
    >
      <img
        style={{ width: "100%", height: "100%", borderRadius: "5px" }}
        src={src}
        alt={rule ? rule : "passive"}
      />
      {rule ? (
        <div
          style={{
            borderRadius: "5px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            bottom: "0",
            right: "0",
            width: SKILL_SIZE / 2 + "px",
            height: SKILL_SIZE / 2 + "px",
            backgroundColor: "rgba(0,0,0,.7)",
            color: "white",
          }}
        >
          {rule}
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

interface SkillInfoProps {
  lv: number;
  cooldown: (number | string)[];
}

const SkillInfo = function ({ lv, cooldown }: SkillInfoProps) {
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
};

interface SkillTableProps {
  championInfo: Champion;
  version: string;
}

export default function SkillTable({ championInfo, version }: SkillTableProps) {
  if (!championInfo.spells) return null;
  
  const maxLv = championInfo.spells.reduce(
    (acc, v) => (acc > v.maxrank ? acc : v.maxrank),
    0
  );
  const skills = [];
  for (let i = 0; i < maxLv; i++) {
    const cooldown = championInfo.spells.map((skill) =>
      skill.cooldown[i] !== undefined ? skill.cooldown[i] : ""
    );
    skills.push(<SkillInfo key={i} lv={i + 1} cooldown={cooldown} />);
  }
  return (
    <GridLayout>
      <SkillIcon
        src={PASSIVE_ICON_URL(version, championInfo.passive?.image?.full || "")}
      />
      {championInfo.spells.map((skill, idx) => (
        <SkillIcon
          key={idx}
          src={SKILL_ICON_URL(version, skill.id)}
          rule={["Q", "W", "E", "R"][idx]}
        />
      ))}
      {skills}
    </GridLayout>
  );
}


