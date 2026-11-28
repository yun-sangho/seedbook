/**
 * @file ui:action-button
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

"use client";

import * as React from "react";
import {
  ActionButton as SeedActionButton,
  type ActionButtonProps as SeedActionButtonProps,
} from "@seed-design/react";
import { LoadingIndicator } from "./loading-indicator";

export interface ActionButtonProps extends SeedActionButtonProps {}

/**
 * @see https://seed-design.io/react/components/action-button
 * If `asChild` is enabled, manual handling of `LoadingIndicator` is required.
 *
 * Seedbook: 기본 variant 는 SEED 의 brandSolid 대신 neutralSolid 다. 버튼은 브랜드 색을 쓰지 않고
 * 진하게(neutralSolid) 강조하며, 브랜드 초록은 진행 바·안내 문구·배지에만 쓴다 (`src/seed-brand.css`).
 */
export const ActionButton = React.forwardRef<
  React.ElementRef<typeof SeedActionButton>,
  ActionButtonProps
>(({ loading = false, variant = "neutralSolid", children, ...otherProps }, ref) => {
  return (
    <SeedActionButton ref={ref} loading={loading} variant={variant} {...otherProps}>
      {loading && !otherProps.asChild ? <LoadingIndicator>{children}</LoadingIndicator> : children}
    </SeedActionButton>
  );
});
ActionButton.displayName = "ActionButton";

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
