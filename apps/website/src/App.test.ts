import { describe, it, expect } from "vite-plus/test";
import { parseLocation, getThumbnailColor, THUMBNAIL_COLORS } from "./App";

describe("parseLocation", () => {
  it("resolves root and empty paths to home", () => {
    expect(parseLocation("/")).toEqual({ currentView: "home", viewParam: null });
    expect(parseLocation("")).toEqual({ currentView: "home", viewParam: null });
  });

  it("resolves static top-level views", () => {
    expect(parseLocation("/search")).toEqual({ currentView: "search", viewParam: null });
    expect(parseLocation("/settings")).toEqual({ currentView: "settings", viewParam: null });
    expect(parseLocation("/favorites")).toEqual({ currentView: "favorites", viewParam: null });
    expect(parseLocation("/about")).toEqual({ currentView: "about", viewParam: null });
    expect(parseLocation("/privacy")).toEqual({ currentView: "privacy", viewParam: null });
    expect(parseLocation("/terms")).toEqual({ currentView: "terms", viewParam: null });
    expect(parseLocation("/contact")).toEqual({ currentView: "contact", viewParam: null });
    expect(parseLocation("/writers")).toEqual({ currentView: "writers", viewParam: null });
  });

  it("resolves auth views", () => {
    expect(parseLocation("/login")).toEqual({ currentView: "login", viewParam: null });
    expect(parseLocation("/register")).toEqual({ currentView: "register", viewParam: null });
    expect(parseLocation("/forgot-password")).toEqual({
      currentView: "forgotPassword",
      viewParam: null,
    });
    expect(parseLocation("/reset-password")).toEqual({
      currentView: "resetPassword",
      viewParam: null,
    });
  });

  it("resolves dashboard views", () => {
    expect(parseLocation("/writer-dash")).toEqual({ currentView: "writerDash", viewParam: null });
    expect(parseLocation("/writer-dash/new")).toEqual({
      currentView: "writerNew",
      viewParam: null,
    });
    expect(parseLocation("/writer-dash/series")).toEqual({
      currentView: "writerSeries",
      viewParam: null,
    });
    expect(parseLocation("/editor-dash")).toEqual({ currentView: "editorDash", viewParam: null });
    expect(parseLocation("/editor-dash/articles")).toEqual({
      currentView: "editorArticles",
      viewParam: null,
    });
    expect(parseLocation("/editor-dash/recommend")).toEqual({
      currentView: "editorRecommend",
      viewParam: null,
    });
    expect(parseLocation("/editor-dash/writers")).toEqual({
      currentView: "editorWriters",
      viewParam: null,
    });
    expect(parseLocation("/editor-dash/applications")).toEqual({
      currentView: "editorApplications",
      viewParam: null,
    });
  });

  it("extracts path parameters correctly", () => {
    expect(parseLocation("/articles/art-12345")).toEqual({
      currentView: "article",
      viewParam: "art-12345",
    });
    expect(parseLocation("/writers/usr-999")).toEqual({
      currentView: "profile",
      viewParam: "usr-999",
    });
    expect(parseLocation("/writer-dash/edit/art-edit-01")).toEqual({
      currentView: "writerEdit",
      viewParam: "art-edit-01",
    });
  });

  it("returns notFound for unknown paths", () => {
    expect(parseLocation("/unknown-page")).toEqual({ currentView: "notFound", viewParam: null });
    expect(parseLocation("/foo/bar/baz")).toEqual({ currentView: "notFound", viewParam: null });
  });
});

describe("getThumbnailColor", () => {
  it("returns the corresponding color object when given a valid color ID", () => {
    const green = getThumbnailColor("green");
    expect(green.id).toBe("green");
    expect(green.bg).toBe("bg-green-100");
    expect(green.text).toBe("text-green-400");
  });

  it("falls back to the first color (blue) when given null or an unknown color ID", () => {
    const fallbackNull = getThumbnailColor(null);
    expect(fallbackNull).toEqual(THUMBNAIL_COLORS[0]);
    expect(fallbackNull.id).toBe("blue");

    const fallbackUnknown = getThumbnailColor("nonexistent-color");
    expect(fallbackUnknown).toEqual(THUMBNAIL_COLORS[0]);
  });
});
