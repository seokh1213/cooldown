import { decodeDataManifest, type DataManifest } from "@/domain/game/contracts/dataManifest";
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/infrastructure/http/staticDataClient";

export class ManifestRepository {
  private current?: Promise<DataManifest>;

  constructor(private readonly client: StaticDataClient) {}

  get(): Promise<DataManifest> {
    if (this.current) return this.current;
    const request = this.client
      .getJson("data/version.json", decodeDataManifest)
      .then(decodeDataManifest)
      .catch((error) => {
        if (this.current === request) this.current = undefined;
        throw error;
      });
    this.current = request;
    return this.current;
  }
}

export const manifestRepository = new ManifestRepository(createStaticDataClient());
