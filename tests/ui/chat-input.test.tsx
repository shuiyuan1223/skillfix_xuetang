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

function renderChatInput(sendAction = mock()) {
  const data: A2UISurfaceData = {
    components: [
      {
        id: "ci1",
        type: "chat_input",
        placeholder: "Type a message...",
        action: "send_message",
        streaming: false,
        disabled: false,
      },
    ],
    root_id: "ci1",
  };
  const result = render(
    <A2UIRenderer
      data={data}
      sendAction={sendAction}
      sendNavigate={mock()}
      {...makeRefs()}
    />
  );
  return { ...result, sendAction };
}

describe("ChatInput", () => {
  test("renders input and send button", () => {
    renderChatInput();
    const input = screen.getByPlaceholderText("Type a message...");
    expect(input).toBeTruthy();
    expect(input.tagName).toBe("INPUT");
    // Send button exists (has title "Send")
    const sendBtn = screen.getByTitle("Send");
    expect(sendBtn).toBeTruthy();
  });

  test("click send button calls sendAction with input value", () => {
    const sendAction = mock();
    renderChatInput(sendAction);
    const input = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    // Type text
    fireEvent.change(input, { target: { value: "Hello!" } });
    // Click send
    const sendBtn = screen.getByTitle("Send");
    fireEvent.click(sendBtn);
    expect(sendAction).toHaveBeenCalledTimes(1);
    expect(sendAction).toHaveBeenCalledWith("send_message", {
      content: "Hello!",
      value: "Hello!",
    });
    // Input should be cleared
    expect(input.value).toBe("");
  });

  test("pressing Enter sends message", () => {
    const sendAction = mock();
    renderChatInput(sendAction);
    const input = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hi there" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(sendAction).toHaveBeenCalledTimes(1);
    expect(sendAction).toHaveBeenCalledWith("send_message", {
      content: "Hi there",
      value: "Hi there",
    });
  });
});
