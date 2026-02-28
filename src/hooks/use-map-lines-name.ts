import { useLines } from "@cloudroutes/query/lines";
import { mapLinesToSelectOptions } from "../helpers.ts";

export function useMapLinesName() {
  const { data: linesData } = useLines();

  if (!linesData) return [];

  return linesData.map((line) => line.name);
}

export function useMapLinesOption() {
  return mapLinesToSelectOptions(useMapLinesName());
}
