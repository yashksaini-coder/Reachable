import type { ComponentType } from "react";
import Pipeline from "./pipeline";
import Q1Walk from "./q1-walk";
import Q3Window from "./q3-window";
import Q4Fanout from "./q4-fanout";
import Q5NearNames from "./q5-nearnames";
import Schema from "./schema";
import SixQuestions from "./six-questions";

// Registry of guide diagrams: {{diagram:NAME}} in docs/console/*.md → the component here. Each is
// a server component rendering one inline SVG in the design tokens with a <title>. Unknown names
// render a dashed slot naming the missing diagram (never a blank).
export const DIAGRAMS: Record<string, ComponentType> = {
  "six-questions": SixQuestions,
  pipeline: Pipeline,
  schema: Schema,
  "q1-walk": Q1Walk,
  "q3-window": Q3Window,
  "q4-fanout": Q4Fanout,
  "q5-nearnames": Q5NearNames,
};

export function Missing({ name }: { name: string }) {
  return (
    <div className="my-4 flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-input px-4 text-center font-mono text-[11px] text-dim">
      diagram “{name}” is not drawn yet
    </div>
  );
}
