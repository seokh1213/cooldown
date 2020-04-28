import React from "react";
import styled from "styled-components";
import LeftArrow from "../resource/LeftArrow";
import RightArrow from "../resource/RightArrow";

const SplashImg = styled.img`
  width: 100%;
  height: 166px;
  border-radius: 5px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
`;
const SkinName = styled.div`
  font-size: 0.6em;
  color: #676869;
  text-align: right;
  padding: 2px;
  text-transform: capitalize;
`;
export default function SplashImage({ src, name, changeHandler }) {
  return (
    <div style={{ position: "relative", marginBottom: "5px" }}>
      <SplashImg src={src} alt={name} />
      <SkinName>{name}</SkinName>
      <LeftArrow
        handler={() => changeHandler(-1)}
        style={{
          position: "absolute",
          top: "70px",
          left: "10px",
          cursor: "pointer",
        }}
      />
      <RightArrow
        handler={() => changeHandler(1)}
        style={{
          position: "absolute",
          top: "70px",
          right: "10px",
          cursor: "pointer",
        }}
      />
    </div>
  );
}
