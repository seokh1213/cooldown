import React from "react";

export default function ChampionCover({ name, imageSrc, color }) {
  return (
    <div className="ChampionCover">
      <img
        alt={name}
        src={imageSrc}
        style={{
          borderColor: color,
        }}
      ></img>
      <div style={{ color }}>{name}</div>
    </div>
  );
}
