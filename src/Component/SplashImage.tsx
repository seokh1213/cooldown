import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import LeftArrow from "../resource/LeftArrow";
import RightArrow from "../resource/RightArrow";
import { useImagePreload } from "../hooks/useImagePreload";

const SplashImgContainer = styled.div`
  position: relative;
  width: 100%;
  min-height: 250px;
  background-color: #1a1a1a;
  border-radius: 5px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  overflow: hidden;
`;

const SplashImg = styled.img<{ loaded: boolean }>`
  width: 100%;
  min-height: 250px;
  border-radius: 5px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  opacity: ${(props) => (props.loaded ? 1 : 0)};
  transition: opacity 0.3s ease-in-out;
  object-fit: cover;
`;

const LoadingPlaceholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%);
  background-size: 200% 100%;
  animation: loading 1.5s ease-in-out infinite;
  
  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const SkinName = styled.div`
  font-size: 0.8em;
  color: #676869;
  text-align: right;
  padding: 2px;
  text-transform: capitalize;
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
`;

const arrowStyle: React.CSSProperties = {
  width: "20px",
  height: "40px",
  position: "absolute",
  top: "105px",
  cursor: "pointer",
  zIndex: 1,
};

interface SplashImageProps {
  src: string;
  name: string;
  changeHandler: (inc: number) => void;
  nextSkinSrc?: string;
  prevSkinSrc?: string;
}

function SplashImage({ src, name, changeHandler, nextSkinSrc, prevSkinSrc }: SplashImageProps) {
  const { isLoaded, hasError } = useImagePreload(src);
  const [nextLoaded, setNextLoaded] = useState(false);
  const [prevLoaded, setPrevLoaded] = useState(false);

  // 다음/이전 스킨 이미지 preload
  useEffect(() => {
    if (nextSkinSrc && !nextLoaded) {
      const img = new Image();
      img.onload = () => setNextLoaded(true);
      img.src = nextSkinSrc;
    }
  }, [nextSkinSrc, nextLoaded]);

  useEffect(() => {
    if (prevSkinSrc && !prevLoaded) {
      const img = new Image();
      img.onload = () => setPrevLoaded(true);
      img.src = prevSkinSrc;
    }
  }, [prevSkinSrc, prevLoaded]);

  const handlePrevious = useCallback(() => {
    changeHandler(-1);
  }, [changeHandler]);

  const handleNext = useCallback(() => {
    changeHandler(1);
  }, [changeHandler]);

  return (
    <SplashImgContainer>
      {!isLoaded && !hasError && <LoadingPlaceholder />}
      <SplashImg
        src={src}
        alt={name}
        loaded={isLoaded}
        loading="eager"
        onLoad={() => {
          // 이미지 로드 완료 확인
        }}
      />
      <SkinName>{name}</SkinName>
      <LeftArrow
        handler={handlePrevious}
        style={{ ...arrowStyle, left: "10px" }}
      />
      <RightArrow
        handler={handleNext}
        style={{ ...arrowStyle, right: "10px" }}
      />
    </SplashImgContainer>
  );
}

export default React.memo(SplashImage);
