import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackSubmissionError,
  type FeedbackRepository,
} from "../lib/feedback-repository";
import { FeedbackDialog } from "./FeedbackDialog";

const submissionId = "00000000-0000-4000-8000-000000000023";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FeedbackDialog", () => {
  it("discloses public browser context and submits it without contact or image fields", async () => {
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>();
    submitFeedback.mockResolvedValue({
      accepted: true,
      referenceId: "feedback-23",
      status: "published",
      issueUrl: "https://github.com/example/busu/issues/23",
    });
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(submissionId);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "BUSU test browser",
    );
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("ko-KR");
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    const user = userEvent.setup();

    render(
      <FeedbackDialog
        repository={{ submitFeedback }}
        appVersion="2026.33.37"
      />,
    );

    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    expect(
      screen.getByRole("dialog", { name: "문의·제보하기" }),
    ).toHaveAttribute("open");
    expect(screen.getByText(/현재 URL.*User-Agent.*viewport/u)).toBeVisible();
    expect(
      screen.queryByLabelText(/이메일|전화번호|이미지/u),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("분류"), "bug");
    await user.type(
      screen.getByLabelText("문의·제보 내용"),
      "검색 결과 화면에서 링크가 열리지 않습니다.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /GitHub Issue에 공개/u }),
    );
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));

    expect(submitFeedback).toHaveBeenCalledWith({
      submissionId,
      category: "bug",
      message: "검색 결과 화면에서 링크가 열리지 않습니다.",
      website: "",
      currentUrl: window.location.href,
      appVersion: "2026.33.37",
      userAgent: "BUSU test browser",
      language: "ko-KR",
      viewport: { width: 390, height: 844 },
    });
    const payload = submitFeedback.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("image");
    expect(
      await screen.findByRole("link", { name: "등록된 GitHub Issue 보기" }),
    ).toHaveAttribute("href", "https://github.com/example/busu/issues/23");
  });

  it("keeps one submission id for retries and resets it after the message changes", async () => {
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>();
    submitFeedback
      .mockRejectedValueOnce(new Error("temporary"))
      .mockRejectedValueOnce(new Error("temporary"));
    vi.spyOn(window.crypto, "randomUUID")
      .mockReturnValueOnce(submissionId)
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000024");
    const user = userEvent.setup();

    render(
      <FeedbackDialog repository={{ submitFeedback }} appVersion="개발" />,
    );
    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    const message = screen.getByLabelText("문의·제보 내용");
    await user.type(message, "재시도 식별자를 확인하는 문의입니다.");
    await user.click(
      screen.getByRole("checkbox", { name: /GitHub Issue에 공개/u }),
    );
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "다시 보내기" }));
    await screen.findByRole("alert");

    expect(submitFeedback.mock.calls[0]?.[0].submissionId).toBe(submissionId);
    expect(submitFeedback.mock.calls[1]?.[0].submissionId).toBe(submissionId);

    await user.type(message, " 내용을 보충합니다.");
    await user.click(screen.getByRole("button", { name: "다시 보내기" }));
    expect(submitFeedback.mock.calls[2]?.[0].submissionId).toBe(
      "00000000-0000-4000-8000-000000000024",
    );
  });

  it("shows Korean validation messages for short text and missing disclosure consent", async () => {
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>();
    const user = userEvent.setup();
    render(
      <FeedbackDialog repository={{ submitFeedback }} appVersion="개발" />,
    );

    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    await user.type(screen.getByLabelText("문의·제보 내용"), "짧은 문의");
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "내용은 10자 이상 2,000자 이하로 입력해 주세요.",
    );
    expect(submitFeedback).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("문의·제보 내용"), " 내용을 보충");
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "공개되는 정보 안내를 확인해 주세요.",
    );
  });

  it("disables duplicate submission while pending and maps safe server errors", async () => {
    let rejectSubmission: ((reason: unknown) => void) | undefined;
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>(
      () =>
        new Promise((_, reject) => {
          rejectSubmission = reject;
        }),
    );
    const user = userEvent.setup();
    render(
      <FeedbackDialog repository={{ submitFeedback }} appVersion="개발" />,
    );

    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    await user.type(
      screen.getByLabelText("문의·제보 내용"),
      "개인정보 거부 메시지를 확인하는 문의입니다.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /GitHub Issue에 공개/u }),
    );
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));

    expect(screen.getByRole("button", { name: "보내는 중…" })).toBeDisabled();
    rejectSubmission?.(
      new FeedbackSubmissionError("sensitive_content", "sensitive_content"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "민감한 개인정보가 포함된 것 같습니다.",
    );
  });

  it("rotates the submission id after a server conflict", async () => {
    const nextSubmissionId = "00000000-0000-4000-8000-000000000024";
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>();
    submitFeedback
      .mockRejectedValueOnce(new FeedbackSubmissionError("conflict"))
      .mockResolvedValueOnce({
        accepted: true,
        referenceId: "feedback-24",
        status: "published",
      });
    vi.spyOn(window.crypto, "randomUUID")
      .mockReturnValueOnce(submissionId)
      .mockReturnValueOnce(nextSubmissionId);
    const user = userEvent.setup();
    render(
      <FeedbackDialog repository={{ submitFeedback }} appVersion="개발" />,
    );

    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    await user.type(
      screen.getByLabelText("문의·제보 내용"),
      "브라우저 환경 변경 충돌을 확인하는 문의입니다.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /GitHub Issue에 공개/u }),
    );
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "브라우저 환경이 변경되었습니다.",
    );
    await user.click(screen.getByRole("button", { name: "다시 보내기" }));

    expect(submitFeedback.mock.calls[0]?.[0].submissionId).toBe(submissionId);
    expect(submitFeedback.mock.calls[1]?.[0].submissionId).toBe(
      nextSubmissionId,
    );
  });

  it("ignores a stale result after the pending dialog is closed", async () => {
    let rejectSubmission: ((reason: unknown) => void) | undefined;
    const submitFeedback = vi.fn<FeedbackRepository["submitFeedback"]>(
      () =>
        new Promise((_, reject) => {
          rejectSubmission = reject;
        }),
    );
    const user = userEvent.setup();
    render(
      <FeedbackDialog repository={{ submitFeedback }} appVersion="개발" />,
    );

    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));
    await user.type(
      screen.getByLabelText("문의·제보 내용"),
      "닫힌 요청의 결과를 무시하는지 확인합니다.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /GitHub Issue에 공개/u }),
    );
    await user.click(screen.getByRole("button", { name: "공개 제보 보내기" }));
    await user.click(
      screen.getByRole("button", { name: "문의·제보하기 닫기" }),
    );
    rejectSubmission?.(new FeedbackSubmissionError("unavailable"));
    await user.click(screen.getByRole("button", { name: "문의·제보하기" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("문의·제보 내용")).toHaveValue("");
  });
});
