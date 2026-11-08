/**
 * @file ui:bottom-sheet
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

"use client";

import type * as React from "react";
import { forwardRef } from "react";
import IconXmarkLine from "@karrotmarket/react-monochrome-icon/IconXmarkLine";
import { Icon, Portal, BottomSheet as SeedBottomSheet, VisuallyHidden } from "@seed-design/react";

export interface BottomSheetRootProps extends SeedBottomSheet.RootProps {}

/**
 * @see https://seed-design.io/react/components/bottom-sheet
 */
export const BottomSheetRoot = (props: BottomSheetRootProps) => {
  const { children, ...otherProps } = props;
  return <SeedBottomSheet.Root {...otherProps}>{children}</SeedBottomSheet.Root>;
};

export interface BottomSheetTriggerProps extends SeedBottomSheet.TriggerProps {}

// 명시 타입: pnpm 의 중첩 패키지 타입을 추론 결과로 노출하면 TS2742 가 난다.
export const BottomSheetTrigger: React.ForwardRefExoticComponent<
  BottomSheetTriggerProps & React.RefAttributes<HTMLButtonElement>
> = SeedBottomSheet.Trigger;

export interface BottomSheetContentProps
  extends Omit<SeedBottomSheet.ContentProps, "title" | "asChild"> {
  title?: React.ReactNode;

  description?: React.ReactNode;

  layerIndex?: number;

  /**
   * @default true
   */
  showCloseButton?: boolean;

  /**
   * @default false
   */
  showHandle?: boolean;
}

export const BottomSheetContent = forwardRef<HTMLDivElement, BottomSheetContentProps>(
  (
    {
      children,
      title,
      description,
      layerIndex,
      showCloseButton = true,
      showHandle = false,
      ...otherProps
    },
    ref
  ) => {
    if (
      !title &&
      !otherProps["aria-labelledby"] &&
      !otherProps["aria-label"] &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn(
        "BottomSheetContent: aria-labelledby or aria-label should be provided if title is not provided."
      );
    }

    const shouldRenderHeader = title || description;

    // Stackflow 앱 스크린 레이어는 transform + 스크롤 컨테이너라 그 안의 position:fixed 가
    // 스크롤을 따라 움직인다. body 로 빼서 화면 기준으로 고정한다.
    return (
      <Portal>
        <SeedBottomSheet.Positioner style={{ "--layer-index": layerIndex } as React.CSSProperties}>
          <SeedBottomSheet.Backdrop />
          <SeedBottomSheet.Content ref={ref} {...otherProps}>
            {showHandle && <SeedBottomSheet.Handle />}
            {shouldRenderHeader && (
              <SeedBottomSheet.Header>
                {title ? (
                  <SeedBottomSheet.Title>{title}</SeedBottomSheet.Title>
                ) : (
                  <VisuallyHidden asChild>
                    <SeedBottomSheet.Title>{otherProps["aria-label"] || ""}</SeedBottomSheet.Title>
                  </VisuallyHidden>
                )}
                {description && (
                  <SeedBottomSheet.Description>{description}</SeedBottomSheet.Description>
                )}
              </SeedBottomSheet.Header>
            )}
            {children}
            {showCloseButton && (
              // You may implement your own i18n for dismiss label
              <SeedBottomSheet.CloseButton aria-label="닫기">
                <Icon svg={<IconXmarkLine />} />
              </SeedBottomSheet.CloseButton>
            )}
          </SeedBottomSheet.Content>
        </SeedBottomSheet.Positioner>
      </Portal>
    );
  }
);

export interface BottomSheetBodyProps extends SeedBottomSheet.BodyProps {}

export const BottomSheetBody = SeedBottomSheet.Body;

export interface BottomSheetFooterProps extends SeedBottomSheet.FooterProps {}

export const BottomSheetFooter = SeedBottomSheet.Footer;

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
