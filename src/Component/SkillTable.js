import React from "react";
import styled from "styled-components";
import { PASSIVE_ICON_URL, SKILL_ICON_URL } from "../api";

const GridLayout = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  flex: 1;
  place-items: center;
  color: #676869;
  row-gap: 4px;
  font-size: 0.9em;
`;

const SkillIcon = function ({ src, rule }) {
  return (
    <div
      style={{
        position: "relative",
        width: rule ? "30px" : "20px",
        height: rule ? "30px" : "20px",
      }}
    >
      <img
        style={{ width: "100%", height: "100%", borderRadius: "3px" }}
        src={src}
        alt={rule ? rule : "passive"}
      />
      {rule ? (
        <div
          style={{
            borderRadius: "3px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            bottom: "0",
            right: "0",
            width: rule ? "15px" : "10px",
            height: rule ? "15px" : "10px",
            backgroundColor: "rgba(0,0,0,.7)",
            color: "white",
            fontSize: "0.6em",
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

const SkillInfo = function ({ lv, cooldown }) {
  return (
    <>
      <div style={{ fontSize: "0.7em", fontWeight: "400" }}>{lv}lv</div>
      {cooldown.map((cool, idx) => (
        <div style={{ color: "#373839" }} key={idx}>
          {cool !== "" ? `${cool}s` : ""}
        </div>
      ))}
    </>
  );
};

export default function SkillTable({ championInfo, version }) {
  const maxLv = championInfo.spells.reduce(
    (acc, v) => (acc > v.maxrank ? acc : v.maxrank),
    0
  );
  let skills = [];
  for (let i = 0; i < maxLv; i++) {
    let cooldown = championInfo.spells.map((skill) =>
      skill.cooldown[i] !== undefined ? skill.cooldown[i] : ""
    );
    skills.push(<SkillInfo key={i} lv={i + 1} cooldown={cooldown} />);
  }
  return (
    <GridLayout>
      <SkillIcon
        src={PASSIVE_ICON_URL(version, championInfo.passive.image.full)}
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
