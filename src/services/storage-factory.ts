import { Storage } from "./storage.ts";
import { LocalStorageAdapter } from "./adapters/local-storage-adapter.ts";

export const StorageFactory = {
  local: () =>
    new (class extends Storage {
      constructor() {
        super(new LocalStorageAdapter());
      }
    })(),
};
