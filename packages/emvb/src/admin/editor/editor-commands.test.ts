import { describe, expect, test } from "bun:test";
import {
  editorCommands,
  runCommand,
  type CommandInput,
  type CommandRunners,
} from "./editor-commands.ts";

const base = (over: Partial<CommandInput> & Pick<CommandInput, "surface">): CommandInput => ({
  targetId: "head0001",
  isRoot: false,
  isParent: false,
  device: "mobile",
  canDuplicate: true,
  canDelete: true,
  runners: {},
  ...over,
});

const ids = (input: CommandInput) => editorCommands(input).map((command) => command.id);

describe("editor command catalog (W-362)", () => {
  test("the palette keeps wrap, duplicate and delete off the root, and hide stays on the device bar", () => {
    const child = ids(
      base({
        surface: "palette",
        canDuplicate: true,
        canDelete: true,
      }),
    );
    expect(child.slice(0, 3)).toEqual(["wrap-flexbox", "wrap-grid", "wrap-div"]);
    expect(child.includes("duplicate")).toBe(true);
    expect(child.includes("delete")).toBe(true);
    expect(child.includes("save")).toBe(true);
    expect(child.includes("hide-on-device")).toBe(false);
    expect(child.includes("copy")).toBe(false);
    expect(child.includes("rename")).toBe(false);
    const root = ids(
      base({ surface: "palette", canDuplicate: false, canDelete: false, isRoot: true }),
    );
    expect(root.includes("wrap-flexbox")).toBe(false);
    expect(root.includes("duplicate")).toBe(false);
    expect(root.includes("delete")).toBe(false);
    expect(root.includes("save")).toBe(true);
    const duplicate = editorCommands(base({ surface: "palette" })).find(
      (c) => c.id === "duplicate",
    );
    expect(duplicate?.label).toBe("Duplicate selected element");
    expect(duplicate?.hint).toBe("Ctrl/Cmd+D");
  });

  test("hide on device stays off the command palette", () => {
    const hide = editorCommands(base({ surface: "device", targetId: "head0001" }));
    expect(hide.map((command) => command.id)).toEqual(["hide-on-device"]);
    expect(hide[0]?.label).toBe("Hide on mobile");
    expect(hide[0]?.disabled).toBe(false);
    expect(hide[0]?.surfaces.includes("palette")).toBe(false);
    const none = editorCommands(base({ surface: "device", targetId: null }));
    expect(none[0]?.disabled).toBe(true);
    const root = editorCommands(base({ surface: "device", targetId: "root0001", isRoot: true }));
    expect(root[0]?.disabled).toBe(true);
  });

  test("layers and the overlay keep their own labels and only their own commands", () => {
    const clip: CommandRunners = {
      copy: () => undefined,
      paste: () => undefined,
      copyStyle: () => undefined,
      pasteStyle: () => undefined,
      pasteBlocked: null,
      pasteStyleBlocked: "Copy an element or a style first.",
    };
    const parent = editorCommands(
      base({ surface: "layers", isParent: true, runners: { ...clip, rename: () => undefined } }),
    );
    expect(parent.map((command) => command.label)).toEqual([
      "Rename",
      "Copy",
      "Paste",
      "Paste inside",
      "Duplicate",
      "Copy style",
      "Paste style",
      "Move up",
      "Move down",
      "Delete",
    ]);
    expect(parent.find((command) => command.id === "paste-style")?.disabled).toBe(true);
    expect(parent.find((command) => command.id === "delete")?.danger).toBe(true);
    const leaf = ids(base({ surface: "layers", isParent: false, runners: clip }));
    expect(leaf.includes("paste-inside")).toBe(false);
    const root = ids(
      base({
        surface: "layers",
        isRoot: true,
        isParent: true,
        canDuplicate: false,
        canDelete: false,
        runners: clip,
      }),
    );
    expect(root).toEqual(["copy", "paste-inside", "copy-style", "paste-style"]);
    const overlay = editorCommands(base({ surface: "overlay", runners: clip }));
    expect(overlay.map((command) => command.label)).toEqual([
      "Duplicate element",
      "Copy",
      "Paste",
      "Copy style",
      "Paste style",
      "Delete element",
    ]);
    expect(overlay.map((command) => command.id).includes("move-up")).toBe(false);
    expect(overlay.map((command) => command.id).includes("wrap-flexbox")).toBe(false);
  });

  test("every surface runs the same command", () => {
    const seen: string[] = [];
    const runners: CommandRunners = {
      duplicate: (id) => seen.push(`duplicate ${id}`),
      paste: (id, mode) => seen.push(`paste ${mode ?? "auto"} ${id}`),
      toggleHidden: () => seen.push("hide"),
    };
    runCommand(runners, "duplicate", "head0001");
    runCommand(runners, "paste-inside", "box00001");
    runCommand(runners, "hide-on-device", null);
    editorCommands(base({ surface: "palette", runners }))
      .find((c) => c.id === "duplicate")
      ?.run();
    expect(seen).toEqual([
      "duplicate head0001",
      "paste inside box00001",
      "hide",
      "duplicate head0001",
    ]);
  });
});

describe("Edit image in the palette (W-486)", () => {
  test("shows only when the selection is an editable Image, after Redo, and opens the editor", () => {
    expect(ids(base({ surface: "palette" })).includes("edit-image")).toBe(false);
    let opened = 0;
    const runners: CommandRunners = { editImage: () => opened++ };
    const list = editorCommands(base({ surface: "palette", runners }));
    const at = list.findIndex((c) => c.id === "edit-image");
    expect(list[at - 1]?.id).toBe("redo");
    expect(list[at]?.label).toBe("Edit image");
    expect(list[at]?.keywords).toContain("crop");
    list[at]?.run();
    expect(opened).toBe(1);
    expect(ids(base({ surface: "layers", runners })).includes("edit-image")).toBe(false);
  });
});
