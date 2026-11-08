/**
 * @file ui:pull-to-refresh
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

"use client";

import type * as React from "react";
import { forwardRef } from "react";
import { PullToRefresh } from "@seed-design/react";
import { ProgressCircle } from "./progress-circle";

export interface PullToRefreshRootProps extends PullToRefresh.RootProps {}

export const PullToRefreshRoot = PullToRefresh.Root;

export interface PullToRefreshIndicatorProps
  extends Omit<PullToRefresh.IndicatorProps, "children"> {}

export const PullToRefreshIndicator = forwardRef<HTMLDivElement, PullToRefreshIndicatorProps>(
  ({ ...otherProps }, ref) => {
    return (
      <PullToRefresh.Indicator ref={ref} {...otherProps}>
        {(props) => <ProgressCircle size="24" tone="neutral" {...props} />}
      </PullToRefresh.Indicator>
    );
  }
);

export interface PullToRefreshContentProps extends PullToRefresh.ContentProps {}

// 명시 타입: pnpm 의 중첩 패키지 타입을 추론 결과로 노출하면 TS2742 가 난다.
export const PullToRefreshContent: React.ForwardRefExoticComponent<
  PullToRefreshContentProps & React.RefAttributes<HTMLDivElement>
> = PullToRefresh.Content;

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
