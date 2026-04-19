import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.min.css";

export function getChoicesValues(choices: Choices): string[] {
  const val = choices.getValue(true);
  return Array.isArray(val) ? val : val ? [val] : [];
}

export function setChoicesValues(choices: Choices, values: string[]): void {
  choices.removeActiveItems();
  choices.setChoiceByValue(values);
}

export function createChoices(
  selector: string | HTMLSelectElement,
  options: Partial<Choices["config"]> = {}
): Choices {
  return new Choices(selector, {
    removeItemButton: true,
    searchPlaceholderValue: "Search...",
    noResultsText: "No results found",
    noChoicesText: "No options available",
    itemSelectText: "",
    shouldSort: false,
    searchResultLimit: 100,
    resetScrollPosition: false,
    ...options,
  });
}

export { Choices };
