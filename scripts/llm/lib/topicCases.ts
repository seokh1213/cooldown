/**
 * 주제 판정 시험 문항 — 손으로 쓴 것
 *
 * 학습 자료(`build-topic-train.ts`)는 틀 문장 합성이라, 시험은 틀과 다른 말투로 따로
 * 쓴다. 여기 나온 챔피언은 학습에서 뺀다 — 외운 이름이 아니라 갈래를 가리는 힘을 잰다.
 *
 * 관점은 챔피언이 하나인 문항에만 붙는다. 둘이면 상성이라 `routeAsk` 가 시점을 가른다.
 * 조사나 낱말이 관점을 드러내지 않으면 `both` 다 — 모르는 것을 아는 척하지 않게.
 */
import type { NotePerspective } from "../../../src/lib/advisor/noteSelect";
import type { TopicLabel } from "../../../src/lib/advisor/topicJudge";

export type TopicLang = "ko_KR" | "en_US" | "zh_CN";

export interface TopicCase {
  lang: TopicLang;
  question: string;
  champions: string[];
  topic: TopicLabel;
  perspective?: NotePerspective;
}

type Row = [TopicLabel, string[], NotePerspective | undefined, string];

const KO: Row[] = [
  ["combo", ["Yasuo"], "playing", "야스오 콤보 순서 알려줘"],
  ["combo", ["Zed"], "playing", "제드로 풀콤 어떻게 넣어"],
  ["combo", ["LeeSin"], "playing", "리신 인섹킥 어떻게 해"],
  ["laning", ["Darius"], "against", "다리우스 상대로 라인전 어떻게 버텨"],
  ["laning", ["Teemo"], "playing", "티모로 라인 어떻게 서야 해"],
  ["laning", ["Garen"], "against", "초반에 가렌한테 계속 밀리는데"],
  ["teamfight", ["Malphite"], "playing", "말파이트로 한타 때 뭐 해야 돼"],
  ["teamfight", ["Ahri"], "against", "한타에서 아리 어떻게 잡아"],
  ["teamfight", ["Lux"], "both", "럭스는 한타 때 어디 서"],
  ["phase", ["Nasus"], "both", "나서스 후반에 얼마나 세?"],
  ["phase", ["MonkeyKing"], "both", "오공 몇 레벨부터 강해져"],
  ["phase", ["Katarina"], "against", "카타리나 상대로 중반 운영 어떻게 해"],
  ["situational-item", ["Rumble"], "against", "럼블 상대로 뭐 사야 돼"],
  ["situational-item", ["Aatrox"], "playing", "아트록스 빌드 뭐 가"],
  ["situational-item", ["Fiora"], "against", "피오라한테 방어력 올려?"],
  ["escape-window", ["Akali"], "against", "아칼리 언제 들어가야 돼"],
  ["escape-window", ["Ezreal"], "against", "이즈리얼 점멸 빠지면 물어도 돼?"],
  ["escape-window", ["Graves"], "playing", "그레이브즈로 언제 진입해"],
  ["skill", ["Lux"], "playing", "럭스 E 어떻게 써"],
  ["skill", ["Zed"], "against", "제드 궁 피하는 법"],
  ["skill", ["Malphite"], "playing", "말파이트 패시브 어떻게 굴려"],
  ["general", ["Viktor"], "both", "빅토르 팁 좀"],
  ["general", ["MonkeyKing"], "both", "오공 어떤 챔피언이야"],
  ["general", ["MonkeyKing", "Rumble"], undefined, "오공으로 럼블이 너무어려운데 팁이 없나?"],
];

const EN: Row[] = [
  ["combo", ["Yasuo"], "playing", "What's Yasuo's combo?"],
  ["combo", ["Zed"], "playing", "How do I combo as Zed?"],
  ["combo", ["LeeSin"], "playing", "Best Lee Sin combo order"],
  ["laning", ["Darius"], "against", "How do I survive lane against Darius?"],
  ["laning", ["Teemo"], "both", "Teemo laning tips"],
  ["laning", ["Garen"], "against", "Garen keeps bullying me early in lane"],
  ["teamfight", ["Malphite"], "playing", "What should I do in teamfights as Malphite?"],
  ["teamfight", ["Ahri"], "against", "How do I deal with Ahri in teamfights?"],
  ["teamfight", ["Lux"], "both", "Where should Lux stand in fights?"],
  ["phase", ["Nasus"], "both", "When does Nasus get strong?"],
  ["phase", ["MonkeyKing"], "both", "Is Wukong good late game?"],
  ["phase", ["Katarina"], "against", "Mid game macro against Katarina"],
  ["situational-item", ["Rumble"], "against", "What should I build against Rumble?"],
  ["situational-item", ["Aatrox"], "playing", "Aatrox build path"],
  ["situational-item", ["Fiora"], "against", "Should I buy armor vs Fiora?"],
  ["escape-window", ["Akali"], "against", "When can I go in on Akali?"],
  ["escape-window", ["Ezreal"], "against", "Can I all-in Ezreal when his Flash is down?"],
  ["escape-window", ["Graves"], "playing", "When should I engage as Graves?"],
  ["skill", ["Lux"], "playing", "How do I use Lux E properly?"],
  ["skill", ["Zed"], "against", "How to dodge Zed ult"],
  ["skill", ["Malphite"], "both", "How does Malphite passive work?"],
  ["general", ["Viktor"], "both", "Viktor tips"],
  ["general", ["MonkeyKing"], "both", "Tell me about Wukong"],
  ["general", ["MonkeyKing", "Rumble"], undefined, "Wukong into Rumble feels impossible, any tips?"],
];

const ZH: Row[] = [
  ["combo", ["Yasuo"], "playing", "疾风剑豪连招顺序是什么"],
  ["combo", ["Zed"], "playing", "我玩影流之主怎么打出全套连招"],
  ["combo", ["LeeSin"], "playing", "盲僧回旋踢怎么操作"],
  ["laning", ["Darius"], "against", "对线诺克萨斯之手怎么活下来"],
  ["laning", ["Teemo"], "playing", "我用迅捷斥候怎么对线"],
  ["laning", ["Garen"], "against", "前期一直被德玛西亚之力压"],
  ["teamfight", ["Malphite"], "playing", "熔岩巨兽团战该干什么"],
  ["teamfight", ["Ahri"], "against", "团战怎么抓九尾妖狐"],
  ["teamfight", ["Lux"], "both", "光辉女郎团战站哪里"],
  ["phase", ["Nasus"], "both", "沙漠死神后期有多强"],
  ["phase", ["MonkeyKing"], "both", "齐天大圣几级开始强"],
  ["phase", ["Katarina"], "against", "对面不祥之刃中期怎么运营"],
  ["situational-item", ["Rumble"], "against", "打机械公敌出什么装备"],
  ["situational-item", ["Aatrox"], "playing", "暗裔剑魔出装"],
  ["situational-item", ["Fiora"], "against", "对无双剑姬要出护甲吗"],
  ["escape-window", ["Akali"], "against", "什么时候可以切离群之刺"],
  ["escape-window", ["Ezreal"], "against", "探险家闪现没了能不能直接开"],
  ["escape-window", ["Graves"], "playing", "法外狂徒什么时候进场"],
  ["skill", ["Lux"], "playing", "光辉女郎E怎么用"],
  ["skill", ["Zed"], "against", "怎么躲影流之主的大招"],
  ["skill", ["Malphite"], "both", "熔岩巨兽被动怎么用"],
  ["general", ["Viktor"], "both", "奥术先驱有什么技巧"],
  ["general", ["MonkeyKing"], "both", "齐天大圣是什么样的英雄"],
  ["general", ["MonkeyKing", "Rumble"], undefined, "齐天大圣打机械公敌太难了，有什么技巧"],
];

const expand = (lang: TopicLang, rows: Row[]): TopicCase[] =>
  rows.map(([topic, champions, perspective, question]) => ({ lang, question, champions, topic, perspective }));

export const TOPIC_TEST: TopicCase[] = [...expand("ko_KR", KO), ...expand("en_US", EN), ...expand("zh_CN", ZH)];

export const HELD_TOPIC_CHAMPIONS = new Set(TOPIC_TEST.flatMap((c) => c.champions));
