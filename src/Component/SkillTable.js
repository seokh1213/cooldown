import React from "react";
import SkillCooldown from "./SkillCooldown";

export default function SkillTable({ skillCoolMap, ALLY_COLOR, ENEMY_COLOR }) {
  return (
    <div className="SkillTable">
      <div>
        <div>1lv</div>
        <div>2lv</div>
        <div>3lv</div>
        <div>4lv</div>
        <div>5lv</div>
      </div>
      <div className="indicator"></div>
      <SkillCooldown
        skill={"Q"}
        cooldown={skillCoolMap.Q}
        {...{ ALLY_COLOR, ENEMY_COLOR }}
      />
      <div className="indicator"></div>
      <SkillCooldown
        skill={"W"}
        cooldown={skillCoolMap.W}
        {...{ ALLY_COLOR, ENEMY_COLOR }}
      />
      <div className="indicator"></div>
      <SkillCooldown
        skill={"E"}
        cooldown={skillCoolMap.E}
        {...{ ALLY_COLOR, ENEMY_COLOR }}
      />
      <div className="indicator"></div>
      <SkillCooldown
        skill={"R"}
        cooldown={skillCoolMap.R}
        {...{ ALLY_COLOR, ENEMY_COLOR }}
      />
    </div>
  );
}
