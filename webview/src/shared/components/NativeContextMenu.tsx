import { useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import type { NativeMenuActionEvent } from "../bridge/types";

export interface NativeMenuItem {
  id: string;
  action: () => void;
  disabled?: boolean;
  checked?: boolean;
}

interface NativeContextMenuProps {
  x: number;
  y: number;
  section: string;
  items: NativeMenuItem[];
  ready?: boolean;
}

// Only the most recently requested menu may receive a command in this webview.
let activeMenuId: string | null = null;

/** Open VS Code's contributed webview/context menu without rendering a popup. */
export function NativeContextMenu({
  x,
  y,
  section,
  items,
  ready = true,
}: NativeContextMenuProps) {
  const [menuId] = useState(() => crypto.randomUUID());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    activeMenuId = menuId;
    const unsubscribe = bridge.onEvent((event, data) => {
      if (event !== "nativeMenuAction" || activeMenuId !== menuId) return;
      const selection = data as NativeMenuActionEvent | null;
      if (selection?.menuId !== menuId) return;
      const item = itemsRef.current.find(({ id }) => id === selection.action);
      if (!item || item.disabled) return;
      activeMenuId = null;
      item.action();
    });
    const dismiss = (event: Event) => {
      // Ignore our own synthetic event; a new real right click cancels this request.
      if (event.type === "contextmenu" && !event.isTrusted) return;
      if (activeMenuId === menuId) activeMenuId = null;
    };
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("contextmenu", dismiss, true);
    document.addEventListener("keydown", dismiss);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      if (activeMenuId === menuId) activeMenuId = null;
      unsubscribe();
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("contextmenu", dismiss, true);
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [menuId]);

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      if (activeMenuId !== menuId) return;
      const context: Record<string, string | boolean> = {
        webviewSection: section,
        preventDefaultContextMenuItems: true,
        nativeMenuId: menuId,
      };
      for (const item of itemsRef.current) {
        context[`gitBrainsMenu_${item.id}`] = true;
        context[`gitBrainsDisabled_${item.id}`] = !!item.disabled;
        context[`gitBrainsChecked_${item.id}`] = !!item.checked;
      }

      // An unmanaged element avoids retriggering React's row context handlers.
      // Synthetic contextmenu events are supported by the official Webview API.
      const target = document.createElement("div");
      target.dataset.vscodeContext = JSON.stringify(context);
      document.body.append(target);
      try {
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2,
          }),
        );
      } finally {
        target.remove();
      }
    });
    // Do not close on blur: native menus can take focus from the webview.
    return () => cancelAnimationFrame(frame);
  }, [menuId, ready, section, x, y]);

  return null;
}
