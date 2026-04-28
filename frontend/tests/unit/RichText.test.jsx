// Vitest unit test for the RichText markdown renderer.
//
// Why we care: AI components used to render the model's output with
// `whitespace-pre-line`, which preserved newlines but left **bold**, *em*,
// and `code` markers as literal text. RichText converts them to real
// HTML elements. These tests pin the contract so a future refactor can't
// silently regress to literal asterisks again.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RichText from "../../src/components/RichText";

describe("<RichText />", () => {
  it("renders plain prose as a paragraph", () => {
    const { container } = render(<RichText>{"hello world"}</RichText>);
    expect(container.querySelector("p")?.textContent).toBe("hello world");
    expect(container.textContent).not.toContain("**");
  });

  it("converts **bold** markers to <strong>", () => {
    const { container } = render(<RichText>{"keep **eyes** on it"}</RichText>);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("eyes");
    // The surrounding text is preserved without the literal asterisks.
    expect(container.textContent).toBe("keep eyes on it");
  });

  it("converts inline `code` to <code>", () => {
    const { container } = render(<RichText>{"call `propagate` per frame"}</RichText>);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("propagate");
  });

  it("renders a bullet list when every line starts with - or *", () => {
    const md = "- alpha\n- beta\n- gamma";
    const { container } = render(<RichText>{md}</RichText>);
    const items = container.querySelectorAll("ul li");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe("alpha");
    expect(items[2].textContent).toBe("gamma");
  });

  it("treats blank-line-separated blocks as separate paragraphs", () => {
    const md = "First paragraph.\n\nSecond paragraph with **bold**.";
    const { container } = render(<RichText>{md}</RichText>);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("does not crash on null/undefined children", () => {
    const a = render(<RichText>{undefined}</RichText>);
    const b = render(<RichText>{null}</RichText>);
    // Both should render nothing without throwing.
    expect(a.container.textContent).toBe("");
    expect(b.container.textContent).toBe("");
  });

  it("handles unmatched markers gracefully (no crash, leaves text)", () => {
    const { container } = render(<RichText>{"a **b without close"}</RichText>);
    // Should not throw; strong shouldn't be created.
    expect(container.querySelector("strong")).toBeNull();
    // Text passes through.
    expect(container.textContent).toContain("a ");
    expect(container.textContent).toContain("b without close");
  });

  it("renders bold inside a list item", () => {
    const md = "- one **special** item\n- plain";
    const { container } = render(<RichText>{md}</RichText>);
    const firstItem = container.querySelector("ul li");
    expect(firstItem?.querySelector("strong")?.textContent).toBe("special");
  });
});
