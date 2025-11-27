import React, { Component } from "react";
import { getVersion, getChampionList } from "./api";
import { createGlobalStyle } from "styled-components";
import Nav from "./Component/Nav";
import Body from "./Component/Body";
import { Champion } from "./types";

const GlobalStyle = createGlobalStyle`

  #root{
    font-family:"Noto Sans KR","Malgun Gothic";
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items:center;
  }
  img {
    box-shadow:3px 3px 5px rgba(0,0,0,0.3);
  }
`;

interface AppState {
  lang: string;
  version: string;
  championList: Champion[] | null;
  selectedChampions: Champion[];
}

/* Todo: Tip list

  Duration
    Red, Blue: 2m
    Barone, Elder dragon: 3m

  Regen Time
    Inhibitor: 5m
  
   Spell time, Ward time
*/
export default class App extends Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      lang: "ko_KR",
      version: "10.8.1",
      championList: null,
      selectedChampions: [],
    };

    this.init();
  }
  async init() {
    await getVersion().then((version) => this.setState({ version }));
    getChampionList(this.state.version, this.state.lang).then((championList) =>
      this.setState({ championList })
    );
  }
  render() {
    return (
      <>
        <GlobalStyle />
        <Nav
          version={this.state.version}
          lang={this.state.lang}
          selectHandler={(lang) => {
            this.setState({ lang, selectedChampions: [] });
            this.init();
          }}
        />
        <Body
          lang={this.state.lang}
          championList={this.state.championList}
          selectedChampions={this.state.selectedChampions}
          setChampions={(list) => this.setState({ selectedChampions: list })}
        />
      </>
    );
  }
}


