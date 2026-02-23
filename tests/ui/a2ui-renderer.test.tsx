import { describe, test, expect, mock, afterEach } from "bun:test";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { A2UIRenderer } from "../../ui/src/components/a2ui/A2UIRenderer";
import type { A2UISurfaceData, A2UIComponent } from "../../ui/src/lib/types";

afterEach(cleanup);

function makeRefs() {
  return {
    chatAutoScrollRef: { current: true },
    isAutoScrollingRef: { current: false },
  };
}

/** Helper to create a v0.8 component */
function c(id: string, typeName: string, props: Record<string, unknown>): A2UIComponent {
  const v08Props: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" && Array.isArray(v) && v.every((i) => typeof i === "string")) {
      v08Props.children = { explicitList: v };
    } else if (typeof v === "string") {
      v08Props[k] = { literalString: v };
    } else if (typeof v === "number") {
      v08Props[k] = { literalNumber: v };
    } else if (typeof v === "boolean") {
      v08Props[k] = { literalBoolean: v };
    } else if (Array.isArray(v)) {
      v08Props[k] = { literalArray: v };
    } else {
      v08Props[k] = { literalObject: v };
    }
  }
  return { id, component: { [typeName]: v08Props } };
}

describe("A2UIRenderer", () => {
  test("renders text component", () => {
    const data: A2UISurfaceData = {
      components: [c("t1", "Text", { text: "Hello PHA" })],
      root_id: "t1",
    };
    const { container } = render(
      <A2UIRenderer
        data={data}
        sendAction={mock()}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    expect(container.textContent).toContain("Hello PHA");
  });

  test("renders column with children", () => {
    const data: A2UISurfaceData = {
      components: [
        c("col", "Column", { children: ["c1", "c2"] }),
        c("c1", "Text", { text: "Child 1" }),
        c("c2", "Text", { text: "Child 2" }),
      ],
      root_id: "col",
    };
    const { container } = render(
      <A2UIRenderer
        data={data}
        sendAction={mock()}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    expect(container.textContent).toContain("Child 1");
    expect(container.textContent).toContain("Child 2");
    // Column should be a flex-col div
    const col = container.firstElementChild as HTMLElement;
    expect(col.className).toContain("flex");
    expect(col.className).toContain("flex-col");
  });

  test("button click calls sendAction", () => {
    const sendAction = mock();
    const data: A2UISurfaceData = {
      components: [
        c("btn1", "Button", { label: "Click Me", action: "do_thing", payload: { key: "val" } }),
      ],
      root_id: "btn1",
    };
    render(
      <A2UIRenderer
        data={data}
        sendAction={sendAction}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    const btn = screen.getByText("Click Me");
    fireEvent.click(btn);
    expect(sendAction).toHaveBeenCalledTimes(1);
    expect(sendAction).toHaveBeenCalledWith("do_thing", { key: "val" });
  });

  test("nav button click calls sendNavigate", () => {
    const sendNavigate = mock();
    const data: A2UISurfaceData = {
      components: [
        c("nav1", "Nav", {
          items: [
            { id: "chat", label: "Chat", icon: "chat" },
            { id: "health", label: "Health", icon: "heart" },
          ],
          activeId: "chat",
        }),
      ],
      root_id: "nav1",
    };
    render(
      <A2UIRenderer
        data={data}
        sendAction={mock()}
        sendNavigate={sendNavigate}
        {...makeRefs()}
      />
    );
    // Nav buttons are icon-only with title attr
    const healthBtn = screen.getByTitle("Health");
    fireEvent.click(healthBtn);
    expect(sendNavigate).toHaveBeenCalledTimes(1);
    expect(sendNavigate).toHaveBeenCalledWith("health");
  });

  test("renders card component with title and children", () => {
    const data: A2UISurfaceData = {
      components: [
        c("card1", "Card", { title: "My Card", children: ["t1"] }),
        c("t1", "Text", { text: "Card content" }),
      ],
      root_id: "card1",
    };
    const { container } = render(
      <A2UIRenderer
        data={data}
        sendAction={mock()}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    expect(container.textContent).toContain("My Card");
    expect(container.textContent).toContain("Card content");
    // Card should have rounded-xl class
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("rounded-xl");
  });
});
