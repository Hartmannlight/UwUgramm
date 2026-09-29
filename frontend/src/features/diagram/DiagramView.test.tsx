// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import DiagramView from "./DiagramView";
import type { DiagramActions } from "./DiagramView";
import { block } from "./model";
afterEach(cleanup);
const idle = () => {};
function actions(): DiagramActions {
  return {
    selected: "",
    select: idle,
    text: idle,
    insert: idle,
    enter: idle,
    tab: () => false,
    erase: idle,
    navigate: idle,
    move: idle,
    empty: idle,
    activeName: "",
    hoverName: idle,
    cursorName: idle,
    remove: vi.fn(),
    branch: vi.fn(),
    drag: {
      id: "",
      start: idle,
      end: idle,
      over: idle,
      drop: idle,
      canDrop: () => false,
    },
  };
}
describe("diagram mouse controls", () => {
  it("opens the selected branch and deletes its complete owning block", () => {
    const choice = {
      ...block("if", "x > 0"),
      children: [block("statement", "x=1")],
      otherwise: [block("statement", "x=2")],
    };
    const controls = actions();
    const screen = render(<DiagramView nodes={[choice]} actions={controls} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja-Zweig öffnen" }));
    expect(controls.branch).toHaveBeenLastCalledWith(choice.id, "children");
    fireEvent.click(screen.getByRole("button", { name: "Nein-Zweig öffnen" }));
    expect(controls.branch).toHaveBeenLastCalledWith(choice.id, "otherwise");
    fireEvent.click(
      screen.getByRole("button", { name: "Block löschen: x > 0" }),
    );
    expect(controls.remove).toHaveBeenLastCalledWith(choice.id);
    expect(
      screen.getByRole("button", { name: "Bedingung verschieben: x > 0" }),
    ).toBeDefined();
  });
  it("renders distinct editable case branches and a bottom-tested loop", () => {
    const choice = block("switch", "wert"),
      loop = block("dowhile", "fertig");
    const screen = render(
      <DiagramView nodes={[choice, loop]} actions={actions()} />,
    );
    expect(screen.getByRole("combobox", { name: "Fall: 1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sonst" })).toBeDefined();
    expect(
      screen.container.querySelector(".ns-dowhile > .loop-footer"),
    ).not.toBeNull();
  });
});
