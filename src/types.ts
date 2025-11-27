export interface Champion {
  name: string;
  id: string;
  key: string;
  title: string;
  version?: string;
  hangul?: string;
  skins?: Array<{
    num: number;
    name: string;
  }>;
  spells?: Array<{
    id: string;
    maxrank: number;
    cooldown: (number | string)[];
  }>;
  passive?: {
    image: {
      full: string;
    };
  };
  [key: string]: any;
}


