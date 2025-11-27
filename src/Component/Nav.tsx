import React from "react";
import styled from "styled-components";

const NavWrapper = styled.div`
  box-sizing: border-box;
  padding: 10px;
  width: 600px;
  display: flex;
  align-items: baseline;
  margin: 0 auto;
`;
export const HorizontalLine = styled.div<{ backgroundColor?: string }>`
  width: 100%;
  height: 1px;
  background-color: ${(props) =>
    props.backgroundColor ? props.backgroundColor : "black"};
`;

const SelectItem = styled.select`
  border: 0;
  background-color: #f8f9fa;
  &:active,
  &:focus {
    outline: 0;
  }
`;

interface NavProps {
  version?: string;
  lang: string;
  selectHandler: (lang: string) => void;
}

export default function Nav({ version = "10.8.1", lang, selectHandler }: NavProps) {
  return (
    <>
      <NavWrapper>
        <div>Cooldown</div>
        <div style={{ flex: "1" }} />
        <div style={{ fontSize: "0.6em" }}>v{version}</div>
        <SelectItem
          defaultValue={lang}
          onChange={(e) => selectHandler(e.target.value)}
        >
          <option value="ko_KR">한국어</option>
          <option value="en_US">Eng</option>
        </SelectItem>
      </NavWrapper>
      <HorizontalLine />
    </>
  );
}


