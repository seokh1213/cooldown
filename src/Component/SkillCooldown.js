import React from "react";

export default function SkillCooldown({
  skill,
  cooldown,
  ALLY_COLOR,
  ENEMY_COLOR,
}) {
  console.log(cooldown);
  return (
    <div className="SkillCooldown">
      <div className="SkillName">{skill}</div>
      <div className="line" style={{ backgroundColor: ALLY_COLOR }}></div>
      <div className="line" style={{ backgroundColor: ENEMY_COLOR }}></div>
      <div>
        {cooldown[0]
          ? cooldown[0].map((cooldown) => <div>{cooldown}S</div>)
          : null}
      </div>
      <div>
        {cooldown[1]
          ? cooldown[1].map((cooldown) => <div>{cooldown}S</div>)
          : null}
      </div>
    </div>
  );
}
