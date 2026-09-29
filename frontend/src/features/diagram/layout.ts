import type { Block } from "./model";
import { splitSignature } from "./language";
export const DEFAULT_WIDTH = 600;
export const MIN_BRANCH = 200;
export const MAX_LINE = 624;
export const ASYMMETRIC_AT = DEFAULT_WIDTH * 2;
export interface BlockLayout {
  width: number;
  left: number;
  right: number;
  asymmetric: boolean;
  columns?: number[];
}
export interface DiagramLayout {
  width: number;
  blocks: Map<string, BlockLayout>;
}
const lineWidth = (text: string) =>
  Math.min(
    MAX_LINE,
    Math.max(
      MIN_BRANCH,
      Math.max(...text.split("\n").map((line) => Array.from(line).length)) *
        8.4 +
        40,
    ),
  );
export function layoutDiagram(nodes: Block[]): DiagramLayout {
  const preferred = new Map<string, BlockLayout>();
  const measure = (items: Block[]): number =>
    Math.max(
      MIN_BRANCH,
      ...items.map((node) => {
        const left = measure(node.children),
          right = measure(node.otherwise);
        const asymmetric =
          node.kind === "if" && 2 * Math.max(left, right) > ASYMMETRIC_AT;
        let width = lineWidth(node.text);
        if (node.kind === "if")
          width = Math.max(
            width,
            asymmetric ? left + right : 2 * Math.max(left, right),
          );
        if (["while", "for", "dowhile", "repeat"].includes(node.kind))
          width = Math.max(width, left + 25);
        if (node.kind === "case") width = Math.max(width, left);
        if (node.kind === "switch")
          width = Math.max(
            width,
            node.children.reduce(
              (sum, c) => sum + preferred.get(c.id)!.width,
              0,
            ) + right,
          );
        if (node.kind === "function") {
          const signature = splitSignature(node.text);
          width = Math.max(
            lineWidth(signature.name),
            Math.min(
              DEFAULT_WIDTH,
              lineWidth(signature.parameters) + lineWidth(signature.returns),
            ),
            left + 22,
          );
        }
        preferred.set(node.id, { width, left, right, asymmetric });
        return width;
      }),
    );
  const width = Math.max(DEFAULT_WIDTH, measure(nodes));
  const blocks = new Map<string, BlockLayout>();
  const allocate = (items: Block[], available: number) =>
    items.forEach((node) => {
      const size = preferred.get(node.id)!;
      if (node.kind === "switch") {
        const wanted = [
          ...node.children.map((c) => preferred.get(c.id)!.width),
          size.right,
        ];
        const total = wanted.reduce((a, b) => a + b, 0);
        const columns = wanted.map((value) => (available * value) / total);
        blocks.set(node.id, { ...size, width: available, columns });
        node.children.forEach((c, index) =>
          allocate([c], columns[index] - (index ? 1 : 0)),
        );
        allocate(node.otherwise, columns.at(-1)! - 1);
        return;
      }
      const left =
        node.kind === "if"
          ? size.asymmetric
            ? (available * size.left) / (size.left + size.right)
            : available / 2
          : node.kind === "case"
            ? available
            : available - (node.kind === "function" ? 22 : 25);
      const right = available - left;
      blocks.set(node.id, {
        width: available,
        left,
        right,
        asymmetric: size.asymmetric,
      });
      allocate(node.children, left);
      allocate(node.otherwise, right - 1);
    });
  allocate(nodes, width);
  return { width, blocks };
}
