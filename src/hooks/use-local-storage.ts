import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { Storage } from "../services/client.ts";

function getValue<T>(key: string, initialValue: T): T {
  const value = Storage.get<T>(key);

  return value ?? initialValue;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T = "" as T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(() => getValue(key, initialValue));

  useEffect(() => {
    Storage.set(key, value);
  }, [key, value]);

  return [value, setValue];
}
