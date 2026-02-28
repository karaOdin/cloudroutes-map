import { StorageAdapter } from "./storage-adapter.ts";

export abstract class Storage {
  protected constructor(protected adapter: StorageAdapter) {}

  public get<T>(key: string): T | null {
    const value = this.adapter.getItem(key);

    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch (e) {
      console.warn(`Failed to parse value for key ${key}`, e);
      return null;
    }
  }

  public set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.adapter.setItem(key, raw);
  }

  public remove(key: string) {
    this.adapter.removeItem(key);
  }

  public clear() {
    this.adapter.clear();
  }
}
