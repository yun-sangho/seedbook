/**
 * @file ui:search-input
 * @requires @seed-design/react@^3.1.0
 * @requires @seed-design/css@^3.1.0
 **/

"use client";

import * as React from "react";
import { IconXmarkCircleFill } from "@karrotmarket/react-monochrome-icon"; // "@daangn/react-monochrome-icon"과 동일합니다.
import { Icon, SearchInput as SeedSearchInput } from "@seed-design/react";

export interface SearchInputProps
  extends Omit<SeedSearchInput.RootProps, "children" | "asChild" | "aria-label"> {
  placeholder?: string;

  /**
   * The accessible name of the input.
   * @default "검색"
   */
  "aria-label"?: string;

  /**
   * The accessible name of the clear button.
   * @default "지우기"
   */
  clearButtonLabel?: string;

  /**
   * Props for the input element, e.g. `maxLength` or `autoFocus`.
   * Set `disabled` and `readOnly` on `SearchInput` itself, so the clear button follows them.
   */
  inputProps?: Omit<SeedSearchInput.InputProps, "disabled" | "readOnly">;
}

/**
 * @see https://seed-design.io/react/components/search-input
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      placeholder,
      "aria-label": ariaLabel = "검색",
      clearButtonLabel = "지우기",
      inputProps,
      ...otherProps
    },
    ref
  ) => {
    return (
      <SeedSearchInput.Root {...otherProps}>
        {/* You may implement your own i18n for the labels */}
        <SeedSearchInput.Input
          ref={ref}
          aria-label={ariaLabel}
          placeholder={placeholder}
          {...inputProps}
        />
        <SeedSearchInput.ClearButton aria-label={clearButtonLabel}>
          <Icon svg={<IconXmarkCircleFill />} />
        </SeedSearchInput.ClearButton>
      </SeedSearchInput.Root>
    );
  }
);
SearchInput.displayName = "SearchInput";

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
