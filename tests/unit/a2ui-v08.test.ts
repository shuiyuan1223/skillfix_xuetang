import { describe, test, expect } from "bun:test";
import {
  A2UIGenerator,
  toBoundValue,
  fromBoundValue,
  componentType,
  prop,
  children,
  withProp,
  SURFACE_MAIN,
  PHA_CATALOG_ID,
} from "../../src/gateway/a2ui.js";

describe("toBoundValue / fromBoundValue round-trip", () => {
  test("string round-trip", () => {
    const bv = toBoundValue("hello");
    expect(bv).toEqual({ literalString: "hello" });
    expect(fromBoundValue(bv)).toBe("hello");
  });

  test("number round-trip", () => {
    const bv = toBoundValue(42);
    expect(bv).toEqual({ literalNumber: 42 });
    expect(fromBoundValue(bv)).toBe(42);
  });

  test("boolean round-trip", () => {
    const bv = toBoundValue(true);
    expect(bv).toEqual({ literalBoolean: true });
    expect(fromBoundValue(bv)).toBe(true);
  });

  test("array round-trip", () => {
    const arr = [1, 2, 3];
    const bv = toBoundValue(arr);
    expect(bv).toEqual({ literalArray: arr });
    expect(fromBoundValue(bv)).toEqual(arr);
  });

  test("object round-trip", () => {
    const obj = { key: "val" };
    const bv = toBoundValue(obj);
    expect(bv).toEqual({ literalObject: obj });
    expect(fromBoundValue(bv)).toEqual(obj);
  });

  test("undefined returns undefined", () => {
    expect(fromBoundValue(undefined)).toBeUndefined();
  });

  test("explicitList (ChildrenValue) round-trip", () => {
    const cv = { explicitList: ["a", "b"] };
    expect(fromBoundValue(cv)).toEqual(["a", "b"]);
  });

  test("path round-trip", () => {
    const pv = { path: "$.data.name" };
    expect(fromBoundValue(pv)).toBe("$.data.name");
  });
});

describe("componentType / prop / children / withProp helpers", () => {
  const comp = {
    id: "c1",
    component: {
      Text: {
        text: { literalString: "hello" },
        variant: { literalString: "body" },
      },
    },
  };

  test("componentType extracts PascalCase type name", () => {
    expect(componentType(comp)).toBe("Text");
  });

  test("prop extracts and unwraps values", () => {
    expect(prop(comp, "text")).toBe("hello");
    expect(prop(comp, "variant")).toBe("body");
    expect(prop(comp, "nonexistent")).toBeUndefined();
  });

  test("children returns empty array for non-container", () => {
    expect(children(comp)).toEqual([]);
  });

  test("children returns child IDs for container component", () => {
    const col = {
      id: "col1",
      component: {
        Column: {
          children: { explicitList: ["c1", "c2"] },
          gap: { literalNumber: 8 },
        },
      },
    };
    expect(children(col)).toEqual(["c1", "c2"]);
  });

  test("withProp returns new component with updated prop", () => {
    const updated = withProp(comp, "text", "world");
    expect(prop(updated, "text")).toBe("world");
    // Original unchanged
    expect(prop(comp, "text")).toBe("hello");
  });
});

describe("A2UIGenerator.build() output format", () => {
  test("build returns two A2UIMessage objects", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const textId = ui.text("Hello");
    const messages = ui.build(textId);

    expect(messages).toHaveLength(2);
    expect("surfaceUpdate" in messages[0]).toBe(true);
    expect("beginRendering" in messages[1]).toBe(true);
  });

  test("surfaceUpdate contains components array", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const textId = ui.text("Test");
    const messages = ui.build(textId);

    const su = messages[0] as { surfaceUpdate: { surfaceId: string; components: unknown[] } };
    expect(su.surfaceUpdate.surfaceId).toBe(SURFACE_MAIN);
    expect(Array.isArray(su.surfaceUpdate.components)).toBe(true);
    expect(su.surfaceUpdate.components.length).toBe(1);
  });

  test("beginRendering contains root and catalogId", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const textId = ui.text("Test");
    const messages = ui.build(textId);

    const br = messages[1] as {
      beginRendering: { surfaceId: string; root: string; catalogId?: string };
    };
    expect(br.beginRendering.surfaceId).toBe(SURFACE_MAIN);
    expect(br.beginRendering.root).toBe(textId);
    expect(br.beginRendering.catalogId).toBe(PHA_CATALOG_ID);
  });

  test("generated components use v0.8 format", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const textId = ui.text("Hello", "h1");
    const messages = ui.build(textId);

    const su = messages[0] as { surfaceUpdate: { components: any[] } };
    const comp = su.surfaceUpdate.components[0];

    expect(comp.id).toBe(textId);
    expect(componentType(comp)).toBe("Text");
    expect(prop(comp, "text")).toBe("Hello");
    expect(prop(comp, "variant")).toBe("h1");
  });

  test("column with children produces correct tree", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const t1 = ui.text("A");
    const t2 = ui.text("B");
    const col = ui.column([t1, t2], { gap: 8 });
    const messages = ui.build(col);

    const su = messages[0] as { surfaceUpdate: { components: any[] } };
    expect(su.surfaceUpdate.components.length).toBe(3); // t1, t2, col

    const colComp = su.surfaceUpdate.components.find((c: any) => c.id === col);
    expect(componentType(colComp)).toBe("Column");
    expect(children(colComp)).toEqual([t1, t2]);
    expect(prop(colComp, "gap")).toBe(8);
  });

  test("addRaw creates correct v0.8 component", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    ui.addRaw("custom1", "CustomWidget", { value: 42, label: "test" });
    const root = ui.column(["custom1"]);
    const messages = ui.build(root);

    const su = messages[0] as { surfaceUpdate: { components: any[] } };
    const custom = su.surfaceUpdate.components.find((c: any) => c.id === "custom1");
    expect(componentType(custom)).toBe("CustomWidget");
    expect(prop(custom, "value")).toBe(42);
    expect(prop(custom, "label")).toBe("test");
  });

  test("toJsonl produces valid JSONL", () => {
    const ui = new A2UIGenerator(SURFACE_MAIN);
    const textId = ui.text("Hello");
    const jsonl = ui.toJsonl(textId);

    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
