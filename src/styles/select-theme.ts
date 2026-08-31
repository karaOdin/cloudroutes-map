import type { GroupBase, StylesConfig } from "react-select";

/**
 * Shared react-select theming, matching the design tokens in index.css.
 * react-select renders through emotion, so the values are resolved here
 * rather than through CSS custom properties.
 */
const token = {
  brand: "#06b6d4",
  brandDark: "#0891b2",
  brandSoft: "#ecfeff",
  brandSofter: "#cffafe",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#9ca3af",
  surface: "#ffffff",
} as const;

export function createSelectStyles<
  Option,
  IsMulti extends boolean = boolean,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(isRTL: boolean): StylesConfig<Option, IsMulti, Group> {
  const direction = isRTL ? ("rtl" as const) : ("ltr" as const);
  const textAlign = isRTL ? ("right" as const) : ("left" as const);

  return {
    control: (base, state) => ({
      ...base,
      borderRadius: "12px",
      borderColor: state.isFocused ? token.brand : token.border,
      borderWidth: "1.5px",
      minHeight: "48px",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(6, 182, 212, 0.18)" : "none",
      transition: "border-color 220ms, box-shadow 220ms",
      fontSize: "14px",
      cursor: "pointer",
      direction,
      "&:hover": { borderColor: state.isFocused ? token.brand : "#d1d5db" },
    }),
    option: (base, state) => ({
      ...base,
      textAlign,
      direction,
      backgroundColor: state.isSelected
        ? token.brand
        : state.isFocused
          ? token.brandSoft
          : token.surface,
      color: state.isSelected ? token.surface : token.text,
      padding: "11px 14px",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: state.isSelected ? 600 : 400,
      fontSize: "14px",
      ":active": { backgroundColor: token.brandSofter },
    }),
    singleValue: (base) => ({
      ...base,
      textAlign,
      direction,
      color: token.text,
      fontWeight: 500,
      fontSize: "14px",
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: token.brandSoft,
      border: `1px solid ${token.brandSofter}`,
      borderRadius: "999px",
      padding: "1px 2px",
      direction,
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: token.brandDark,
      fontWeight: 600,
      fontSize: "13px",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: token.brandDark,
      borderRadius: "999px",
      ":hover": { backgroundColor: token.brand, color: token.surface },
    }),
    placeholder: (base) => ({
      ...base,
      textAlign,
      direction,
      color: token.textMuted,
      fontSize: "14px",
    }),
    menu: (base) => ({
      ...base,
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 12px 32px rgba(12, 74, 110, 0.14)",
      marginTop: "6px",
      border: `1px solid ${token.border}`,
      zIndex: 20,
    }),
    menuList: (base) => ({
      ...base,
      padding: "6px",
      maxHeight: "220px",
    }),
  };
}
