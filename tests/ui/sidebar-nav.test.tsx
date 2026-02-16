import { describe, test, expect, mock, afterEach } from "bun:test";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { A2UIRenderer } from "../../ui/src/components/a2ui/A2UIRenderer";
import type { A2UISurfaceData } from "../../ui/src/lib/types";

afterEach(cleanup);

function makeRefs() {
  return {
    chatAutoScrollRef: { current: true },
    isAutoScrollingRef: { current: false },
  };
}

const sidebarData: A2UISurfaceData = {
  components: [
    {
      id: "nav1",
      type: "nav",
      items: [
        { id: "chat", label: "Chat", icon: "chat" },
        { id: "health", label: "Health", icon: "heart" },
        { id: "settings", label: "Settings", icon: "settings" },
      ],
      activeId: "chat",
    },
  ],
  root_id: "nav1",
};

describe("Sidebar Navigation", () => {
  test("renders correct number of nav buttons", () => {
    render(
      <A2UIRenderer
        data={sidebarData}
        sendAction={mock()}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    const buttons = [
      screen.getByTitle("Chat"),
      screen.getByTitle("Health"),
      screen.getByTitle("Settings"),
    ];
    expect(buttons).toHaveLength(3);
  });

  test("clicking nav button calls sendNavigate", () => {
    const sendNavigate = mock();
    render(
      <A2UIRenderer
        data={sidebarData}
        sendAction={mock()}
        sendNavigate={sendNavigate}
        {...makeRefs()}
      />
    );
    fireEvent.click(screen.getByTitle("Settings"));
    expect(sendNavigate).toHaveBeenCalledTimes(1);
    expect(sendNavigate).toHaveBeenCalledWith("settings");
  });

  test("active item has active class", () => {
    render(
      <A2UIRenderer
        data={sidebarData}
        sendAction={mock()}
        sendNavigate={mock()}
        {...makeRefs()}
      />
    );
    const chatBtn = screen.getByTitle("Chat");
    const healthBtn = screen.getByTitle("Health");
    expect(chatBtn.className).toContain("active");
    expect(healthBtn.className).not.toContain("active");
  });
});
