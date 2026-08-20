import { describe, expect, it } from "vitest";
import {
  guideJsonLd,
  guideMetadata,
  guideQuestions,
  renderGuideBody,
} from "./seo-guide";

describe("division guide", () => {
  it("answers each question in the raw markup", () => {
    const html = renderGuideBody("/", 12_679);
    for (const entry of guideQuestions) {
      expect(html).toContain(`<h2>${entry.question}</h2>`);
      expect(html).toContain(entry.answer[0]!.slice(0, 24));
    }
    expect(html).toContain("12,679명");
  });

  it("states the transition dates the classification depends on", () => {
    const html = renderGuideBody("/", 0);
    expect(html).toContain("2022-07-01");
    expect(html).toContain("2017-01-01");
    expect(html).toContain("분당구청장기");
    expect(html).not.toContain("명입니다");
  });

  it("honours a nested base path", () => {
    expect(renderGuideBody("/pingpong-busu/", 1)).toContain(
      'href="/pingpong-busu/directory/"',
    );
  });

  it("publishes the same questions as FAQ structured data", () => {
    const [faq, breadcrumb] = guideJsonLd() as Record<string, unknown>[];
    expect(faq?.["@type"]).toBe("FAQPage");
    expect(faq?.url).toBe("https://busu.iamdenny.com/guide/");
    expect(faq?.name).toBe(guideMetadata.title);
    const questions = faq?.mainEntity as Record<string, unknown>[];
    expect(questions).toHaveLength(guideQuestions.length);
    expect(questions[0]?.name).toBe(guideQuestions[0]?.question);
    const answer = questions[0]?.acceptedAnswer as Record<string, unknown>;
    expect(answer.text).toContain(guideQuestions[0]?.answer[0]);
    expect(breadcrumb?.["@type"]).toBe("BreadcrumbList");
  });

  it("keeps every answer opening with a self-contained statement", () => {
    for (const entry of guideQuestions) {
      expect(entry.answer.length).toBeGreaterThan(0);
      expect(entry.answer[0]!.length).toBeGreaterThan(40);
      expect(entry.answer[0]!.endsWith(".")).toBe(true);
    }
  });
});
