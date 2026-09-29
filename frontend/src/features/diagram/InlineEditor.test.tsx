// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InlineEditor from "./InlineEditor";
afterEach(cleanup);
const idle = () => {};
function Pair() {
  const [activeName, setActiveName] = useState("");
  return (
    <>
      {["x + total", 'print(x, "x")'].map((value, index) => (
        <InlineEditor
          key={index}
          id={"field-" + index}
          label={"Field " + index}
          value={value}
          activeName={activeName}
          cursorName={setActiveName}
          hoverName={setActiveName}
          onFocus={idle}
          onChange={idle}
          onKeyDown={idle}
        />
      ))}
    </>
  );
}
describe("identifier highlighting", () => {
  it("highlights matching names in both fields on hover, without highlighting string contents", () => {
    const { container, getByLabelText } = render(<Pair />);
    const first = container.querySelector('[data-variable="x"]')!;
    vi.spyOn(first, "getClientRects").mockReturnValue([
      new DOMRect(10, 10, 10, 20),
    ] as unknown as DOMRectList);
    fireEvent.mouseMove(getByLabelText("Field 0"), {
      clientX: 15,
      clientY: 15,
    });
    expect(container.querySelectorAll(".variable-match")).toHaveLength(2);
    fireEvent.mouseLeave(first.closest(".line-editor")!);
    expect(container.querySelectorAll(".variable-match")).toHaveLength(0);
  });
  it("uses the caret word, including parameters but excluding their type", () => {
    const cursor = vi.fn();
    const { getByLabelText } = render(
      <InlineEditor
        id="params"
        label="Parameter"
        value="x: GZ, y: GZ"
        parameters
        activeName=""
        cursorName={cursor}
        hoverName={idle}
        onFocus={idle}
        onChange={idle}
        onKeyDown={idle}
      />,
    );
    const input = getByLabelText("Parameter") as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(1, 1);
    fireEvent.select(input);
    expect(cursor).toHaveBeenLastCalledWith("x");
    input.setSelectionRange(4, 4);
    fireEvent.select(input);
    expect(cursor).toHaveBeenLastCalledWith("");
  });
});
