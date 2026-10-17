/* eslint-disable @typescript-eslint/unbound-method */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Article, Series } from "../types";
import type { Profile } from "../supabase";
import { UIProvider } from "../context/UIContext";

// React act 環境を有効化
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * テスト用の Article オブジェクトを生成するファクトリ関数
 */
export function createTestArticle(overrides?: Partial<Article>): Article {
  return {
    id: `article-${Math.random().toString(36).substring(2, 9)}`,
    title: "テスト記事のタイトル",
    thumbnail: "",
    thumbnailUrl: null,
    thumbnailColor: "blue",
    writerId: "writer-1",
    views: 100,
    likes: 10,
    tags: ["プログラミング", "理科"],
    isRecommended: false,
    isPopular: false,
    status: "published",
    summary: "これはテスト記事の要約です。",
    content: "<p>テスト記事の本文です。</p>",
    seriesId: null,
    episodeNumber: null,
    ...overrides,
  };
}

/**
 * テスト用の Profile オブジェクトを生成するファクトリ関数
 */
export function createTestProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: "writer-1",
    email: "writer@example.com",
    role: "writer",
    display_name: "テストライター",
    username: "testwriter",
    avatar_url: null,
    bio: "テストライターの自己紹介です。",
    x_account: "testwriter_x",
    ...overrides,
  };
}

/**
 * テスト用の Series オブジェクトを生成するファクトリ関数
 */
export function createTestSeries(overrides?: Partial<Series>): Series {
  return {
    id: `series-${Math.random().toString(36).substring(2, 9)}`,
    title: "テスト連載",
    description: "テスト連載の説明です。",
    writerId: "writer-1",
    ...overrides,
  };
}

/**
 * input / textarea の値を変更し、input と change イベントを発火するヘルパー
 */
export function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface RenderResult {
  container: HTMLDivElement;
  unmount: () => void;
  rerender: (ui: React.ReactElement) => void;
}

export interface RenderOptions {
  route?: string;
  container?: HTMLDivElement;
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * テストコンポーネントを DOM にマウントする共通レンダラー
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options: RenderOptions = {},
): RenderResult {
  const { route = "/", container: customContainer, wrapper: CustomWrapper } = options;
  const container = customContainer || document.createElement("div");

  if (!customContainer) {
    document.body.appendChild(container);
  }

  const root = createRoot(container);

  const renderContent = (content: React.ReactElement) => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[route]}>
          <UIProvider>
            {CustomWrapper ? <CustomWrapper>{content}</CustomWrapper> : content}
          </UIProvider>
        </MemoryRouter>,
      );
    });
  };

  renderContent(ui);

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (!customContainer && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
    rerender: (newUi: React.ReactElement) => {
      renderContent(newUi);
    },
  };
}
