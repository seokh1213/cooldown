import { decodeDataManifest, type DataManifest } from "@/data/contracts/dataManifest";
import {
  createStaticDataClient,
  type StaticDataClient,
} from "@/data/http/staticDataClient";

export class ManifestRepository {
  private current?: Promise<DataManifest>;

  constructor(private readonly client: StaticDataClient) {}

  get(): Promise<DataManifest> {
    this.current ??= this.client.getJson("data/version.json").then(decodeDataManifest);
    return this.current;
  }
}

export const manifestRepository = new ManifestRepository(createStaticDataClient());
