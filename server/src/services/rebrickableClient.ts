/**
 * Rebrickable API v3 client with rate limiting.
 * Primary Data_Provider for catalog synchronization.
 * Rate limit: 100 requests/minute (free tier).
 */

const REBRICKABLE_BASE_URL = "https://rebrickable.com/api/v3";
const RATE_LIMIT_DELAY_MS = 650; // ~92 req/min to stay safely under 100/min

interface RebrickablePart {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_url: string;
  part_img_url: string | null;
}

interface RebrickableColor {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
}

interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
  last_modified_dt: string;
}

interface RebrickableSetPart {
  id: number;
  inv_part_id: number;
  part: {
    part_num: string;
    name: string;
    part_cat_id: number;
    part_url: string;
    part_img_url: string | null;
  };
  color: {
    id: number;
    name: string;
    rgb: string;
    is_trans: boolean;
  };
  set_num: string;
  quantity: number;
  is_spare: boolean;
}

interface RebrickableTheme {
  id: number;
  parent_id: number | null;
  name: string;
}

interface RebrickableAlternateBuild {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  moc_img_url: string | null;
  moc_url: string | null;
  designer_name: string;
  designer_url: string;
}

export interface AlternateBuildData {
  id: string;
  title: string;
  designer: string;
  thumbnailUrl: string;
  pieceCount: number;
  theme?: string;
  instructionsUrl?: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CatalogPartData {
  partNumber: string;
  name: string;
  categoryId: number;
  imageUrl: string;
}

export interface CatalogColorData {
  colorId: number;
  name: string;
  hexCode: string;
  isTransparent: boolean;
}

export interface CatalogSetData {
  setNumber: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  imageUrl: string;
}

export interface CatalogSetPartData {
  setNumber: string;
  partNumber: string;
  colorId: number;
  quantity: number;
  isSpare: boolean;
}

class RequestQueue {
  private lastRequestTime = 0;

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }
}

export class RebrickableClient {
  private apiKey: string;
  private queue: RequestQueue;
  private themes: Map<number, string> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.queue = new RequestQueue();
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    await this.queue.throttle();

    const url = new URL(`${REBRICKABLE_BASE_URL}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `key ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Rebrickable API error: ${response.status} ${response.statusText} for ${endpoint}`,
      );
    }

    return response.json() as Promise<T>;
  }

  private async fetchAllPages<T>(
    endpoint: string,
    params?: Record<string, string>,
    maxPages = 50,
  ): Promise<T[]> {
    const allResults: T[] = [];
    let page = 1;

    while (page <= maxPages) {
      const response = await this.request<PaginatedResponse<T>>(endpoint, {
        ...params,
        page: String(page),
        page_size: "1000",
      });

      allResults.push(...response.results);

      if (!response.next) break;
      page++;
    }

    return allResults;
  }

  private async ensureThemesLoaded(): Promise<void> {
    if (this.themes.size > 0) return;

    const themes = await this.fetchAllPages<RebrickableTheme>("/lego/themes/");
    for (const theme of themes) {
      this.themes.set(theme.id, theme.name);
    }
  }

  async fetchParts(): Promise<CatalogPartData[]> {
    const parts = await this.fetchAllPages<RebrickablePart>("/lego/parts/");
    return parts.map((p) => ({
      partNumber: p.part_num,
      name: p.name,
      categoryId: p.part_cat_id,
      imageUrl: p.part_img_url ?? "",
    }));
  }

  async fetchColors(): Promise<CatalogColorData[]> {
    const colors = await this.fetchAllPages<RebrickableColor>("/lego/colors/");
    return colors.map((c) => ({
      colorId: c.id,
      name: c.name,
      hexCode: `#${c.rgb}`,
      isTransparent: c.is_trans,
    }));
  }

  async fetchSets(): Promise<CatalogSetData[]> {
    await this.ensureThemesLoaded();

    const sets = await this.fetchAllPages<RebrickableSet>("/lego/sets/");
    return sets.map((s) => ({
      setNumber: s.set_num,
      name: s.name,
      theme: this.themes.get(s.theme_id) ?? "Unknown",
      year: s.year,
      pieceCount: s.num_parts,
      imageUrl: s.set_img_url ?? "",
    }));
  }

  async fetchSetParts(setNumber: string): Promise<CatalogSetPartData[]> {
    const parts = await this.fetchAllPages<RebrickableSetPart>(
      `/lego/sets/${encodeURIComponent(setNumber)}/parts/`,
    );
    return parts.map((p) => ({
      setNumber: p.set_num,
      partNumber: p.part.part_num,
      colorId: p.color.id,
      quantity: p.quantity,
      isSpare: p.is_spare,
    }));
  }

  async searchSets(query: string, limit = 50): Promise<CatalogSetData[]> {
    await this.ensureThemesLoaded();

    const response = await this.request<PaginatedResponse<RebrickableSet>>(
      "/lego/sets/",
      { search: query, page_size: String(limit) },
    );

    return response.results.map((s) => ({
      setNumber: s.set_num,
      name: s.name,
      theme: this.themes.get(s.theme_id) ?? "Unknown",
      year: s.year,
      pieceCount: s.num_parts,
      imageUrl: s.set_img_url ?? "",
    }));
  }

  async fetchAlternates(setNumber: string): Promise<CatalogSetData[]> {
    await this.ensureThemesLoaded();

    const alternates = await this.fetchAllPages<RebrickableSet>(
      `/lego/sets/${encodeURIComponent(setNumber)}/alternates/`,
    );

    return alternates.map((s) => ({
      setNumber: s.set_num,
      name: s.name,
      theme: this.themes.get(s.theme_id) ?? "Unknown",
      year: s.year,
      pieceCount: s.num_parts,
      imageUrl: s.set_img_url ?? "",
    }));
  }

  /**
   * Fetch paginated alternate builds for a set, returning MOC-style data
   * including designer info.
   */
  async fetchSetAlternatesPaginated(
    setNumber: string,
    page = 1,
    pageSize = 50,
  ): Promise<{ results: AlternateBuildData[]; count: number }> {
    await this.ensureThemesLoaded();

    const response = await this.request<PaginatedResponse<RebrickableAlternateBuild>>(
      `/lego/sets/${encodeURIComponent(setNumber)}/alternates/`,
      { page: String(page), page_size: String(pageSize) },
    );

    const results: AlternateBuildData[] = response.results.map((alt) => ({
      id: alt.set_num,
      title: alt.name,
      designer: alt.designer_name ?? "Unknown",
      thumbnailUrl: alt.moc_img_url ?? "",
      pieceCount: alt.num_parts,
      theme: this.themes.get(alt.theme_id) ?? undefined,
      instructionsUrl: alt.moc_url ?? undefined,
    }));

    return { results, count: response.count };
  }

  /**
   * Fetch details for a single alternate build by its set_num identifier.
   */
  async fetchAlternateBuildDetail(altSetNum: string): Promise<AlternateBuildData | null> {
    await this.ensureThemesLoaded();

    try {
      const alt = await this.request<RebrickableAlternateBuild>(
        `/lego/sets/${encodeURIComponent(altSetNum)}/`,
      );
      return {
        id: alt.set_num,
        title: alt.name,
        designer: alt.designer_name ?? "Unknown",
        thumbnailUrl: alt.moc_img_url ?? "",
        pieceCount: alt.num_parts,
        theme: this.themes.get(alt.theme_id) ?? undefined,
        instructionsUrl: alt.moc_url ?? undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch parts list for an alternate build.
   */
  async fetchAlternateParts(altSetNum: string): Promise<CatalogSetPartData[]> {
    const parts = await this.fetchAllPages<RebrickableSetPart>(
      `/lego/sets/${encodeURIComponent(altSetNum)}/parts/`,
    );
    return parts.map((p) => ({
      setNumber: p.set_num,
      partNumber: p.part.part_num,
      colorId: p.color.id,
      quantity: p.quantity,
      isSpare: p.is_spare,
    }));
  }
}

let clientInstance: RebrickableClient | null = null;

export function getRebrickableClient(): RebrickableClient {
  if (!clientInstance) {
    const apiKey = process.env["REBRICKABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("REBRICKABLE_API_KEY environment variable is not set");
    }
    clientInstance = new RebrickableClient(apiKey);
  }
  return clientInstance;
}
