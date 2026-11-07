"use client";

import { useSyncExternalStore } from "react";
import { BAG_KEY, decodeBag, type BagItem } from "./bag";

type Snapshot = { items: readonly BagItem[]; ready: boolean; persistent: boolean };
const serverSnapshot: Snapshot = { items: [], ready: false, persistent: true };
let current = serverSnapshot;
let lastStored: string | null | undefined;
const listeners = new Set<() => void>();

function readBag() {
  if (current.ready && !current.persistent) return current;

  try {
    const stored = window.localStorage.getItem(BAG_KEY);
    if (stored !== lastStored) {
      lastStored = stored;
      current = { items: decodeBag(stored), ready: true, persistent: true };
    }
  } catch {
    current = { ...current, ready: true, persistent: false };
  }
  return current;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === BAG_KEY || event.key === null) {
    readBag();
    notify();
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function useBag() {
  return useSyncExternalStore(subscribe, readBag, () => serverSnapshot);
}

export function changeBag(change: (items: readonly BagItem[]) => readonly BagItem[] | null) {
  const bag = readBag();
  const items = change(bag.items);
  if (!items) return false;

  let persistent = bag.persistent;
  try {
    const stored = JSON.stringify({ version: 1, items });
    window.localStorage.setItem(BAG_KEY, stored);
    lastStored = stored;
    persistent = true;
  } catch {
    persistent = false;
  }

  current = { items, ready: true, persistent };
  notify();
  return true;
}
