import React, { useCallback } from "react";
import styled from "styled-components";
import LeftArrow from "../resource/LeftArrow";
import RightArrow from "../resource/RightArrow";

const SplashImg = styled.img`
  width: 100%;
  min-height: 250px;
  border-radius: 5px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
`;
const SkinName = styled.div`
  font-size: 0.8em;
  color: #676869;
  text-align: right;
  padding: 2px;
  text-transform: capitalize;
`;

const arrowStyle: React.CSSProperties = {
  width: "20px",
  height: "40px",
  position: "absolute",
  top: "105px",
  cursor: "pointer",
};

interface SplashImageProps {
  src: string;
  name: string;
  changeHandler: (inc: number) => void;
}

function SplashImage({ src, name, changeHandler }: SplashImageProps) {
  const handlePrevious = useCallback(() => {
    changeHandler(-1);
  }, [changeHandler]);

  const handleNext = useCallback(() => {
    changeHandler(1);
  }, [changeHandler]);

  return (
    <div style={{ position: "relative", marginBottom: "5px" }}>
      <SplashImg src={src} alt={name} />
      <SkinName>{name}</SkinName>
      <LeftArrow
        handler={handlePrevious}
        style={{ ...arrowStyle, left: "10px" }}
      />
      <RightArrow
        handler={handleNext}
        style={{ ...arrowStyle, right: "10px" }}
      />
    </div>
  );
}

export default React.memo(SplashImage);
