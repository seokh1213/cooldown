import React, { Component } from "react";
import ChampionCover from "./Component/ChampionCover";
import "./App.css";
import SkillTable from "./Component/SkillTable";
import {
  CHAMPIONIMG_URL,
  getVersion,
  getChampionList,
  getChampionInfo,
} from "./api";

// Todo: Tip list
// Red, Blue, Barone duration, Spell time, Ward time

const [ALLY_COLOR, ENEMY_COLOR] = ["blue", "red"];

export default class App extends Component {
  constructor() {
    super();
    this.state = {
      myChampion: "Camille",
      myChampionInfo: {},
      enemyChampion: "Vladimir",
      enemyChampionInfo: {},
      version: "",
      championList: [],
    };
    this.init();
  }
  async init() {
    await getVersion().then((version) => this.setState({ version }));
    getChampionList(this.state.version).then((championList) =>
      this.setState({ championList })
    );
    getChampionInfo(this.state.version, this.state.myChampion).then((data) =>
      this.setState({ myChampionInfo: data })
    );
    getChampionInfo(this.state.version, this.state.enemyChampion).then((data) =>
      this.setState({ enemyChampionInfo: data })
    );
  }
  render() {
    return (
      <>
        <div className="ChampionCovers">
          <ChampionCover
            name={this.state.myChampion}
            imageSrc={CHAMPIONIMG_URL(
              this.state.version,
              this.state.myChampion
            )}
            color={ALLY_COLOR}
          />
          <ChampionCover
            name={this.state.enemyChampion}
            imageSrc={CHAMPIONIMG_URL(
              this.state.version,
              this.state.enemyChampion
            )}
            color={ENEMY_COLOR}
          />
        </div>
        <div>
          <SkillTable
            skillCoolMap={{
              Q: [
                this.state.myChampionInfo.spells
                  ? this.state.myChampionInfo.spells[0].cooldown
                  : [],
                this.state.enemyChampionInfo.spells
                  ? this.state.enemyChampionInfo.spells[0].cooldown
                  : [],
              ],
              W: [
                this.state.myChampionInfo.spells
                  ? this.state.myChampionInfo.spells[1].cooldown
                  : [],
                this.state.enemyChampionInfo.spells
                  ? this.state.enemyChampionInfo.spells[1].cooldown
                  : [],
              ],
              E: [
                this.state.myChampionInfo.spells
                  ? this.state.myChampionInfo.spells[2].cooldown
                  : [],
                this.state.enemyChampionInfo.spells
                  ? this.state.enemyChampionInfo.spells[2].cooldown
                  : [],
              ],
              R: [
                this.state.myChampionInfo.spells
                  ? this.state.myChampionInfo.spells[3].cooldown
                  : [],
                this.state.enemyChampionInfo.spells
                  ? this.state.enemyChampionInfo.spells[3].cooldown
                  : [],
              ],
            }}
            {...{ ALLY_COLOR, ENEMY_COLOR }}
          />
        </div>
      </>
    );
  }
}
