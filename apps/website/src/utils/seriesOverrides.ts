import type { Series } from "../types";

const SERIES_OVERRIDES_KEY = "quest_qlub_series_overrides_v1";

export interface SeriesOverride {
  title: string;
  description?: string | null;
  writerId?: string;
  deleted?: boolean;
}

export function getLocalSeriesOverrides(): Record<string, SeriesOverride> {
  try {
    const raw = localStorage.getItem(SERIES_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, SeriesOverride>) : {};
  } catch {
    return {};
  }
}

export function setLocalSeriesOverride(seriesId: string, override: SeriesOverride): void {
  if (!seriesId) return;
  try {
    const map = getLocalSeriesOverrides();
    map[seriesId] = override;
    localStorage.setItem(SERIES_OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function removeLocalSeriesOverride(seriesId: string): void {
  if (!seriesId) return;
  try {
    const map = getLocalSeriesOverrides();
    delete map[seriesId];
    localStorage.setItem(SERIES_OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function applySeriesOverrides(seriesList: Series[]): Series[] {
  const overrides = getLocalSeriesOverrides();
  if (Object.keys(overrides).length === 0) return seriesList;

  return seriesList
    .filter((s) => !overrides[s.id]?.deleted)
    .map((s) => {
      const ov = overrides[s.id];
      if (!ov) return s;
      return {
        ...s,
        title: ov.title,
        description: ov.description,
      };
    });
}
