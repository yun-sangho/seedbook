/**
 * @file ui:alert-dialog
 * @requires @seed-design/react@^3.0.0
 **/

"use client";

import { forwardRef } from "react";
import type * as React from "react";
import { AlertDialog, Portal } from "@seed-design/react";
import { ActionButton, type ActionButtonProps } from "./action-button";
import { useOverlayContainer } from "./overlay-container";

export interface AlertDialogRootProps extends AlertDialog.RootProps {}

/**
 * @see https://seed-design.io/react/components/alert-dialog
 */
export const AlertDialogRoot = AlertDialog.Root;

export interface AlertDialogContentProps extends AlertDialog.ContentProps {
  layerIndex?: number;
}

export const AlertDialogContent = forwardRef<HTMLDivElement, AlertDialogContentProps>(
  ({ children, layerIndex, ...otherProps }, ref) => {
    // 현재 AppScreen 루트로 portal (이유는 overlay-container.tsx).
    const overlayContainer = useOverlayContainer();
    return (
      <Portal container={overlayContainer}>
        <AlertDialog.Positioner style={{ "--layer-index": layerIndex } as React.CSSProperties}>
          <AlertDialog.Backdrop />
          <AlertDialog.Content ref={ref} {...otherProps}>
            {children}
          </AlertDialog.Content>
        </AlertDialog.Positioner>
      </Portal>
    );
  }
);

export interface AlertDialogTriggerProps extends AlertDialog.TriggerProps {}

// 명시 타입: pnpm 의 중첩 패키지 타입을 추론 결과로 노출하면 TS2742 가 난다.
export const AlertDialogTrigger: React.ForwardRefExoticComponent<
  AlertDialogTriggerProps & React.RefAttributes<HTMLButtonElement>
> = AlertDialog.Trigger;

export interface AlertDialogHeaderProps extends AlertDialog.HeaderProps {}

export const AlertDialogHeader = AlertDialog.Header;

export interface AlertDialogTitleProps extends AlertDialog.TitleProps {}

export const AlertDialogTitle = AlertDialog.Title;

export interface AlertDialogDescriptionProps extends AlertDialog.DescriptionProps {}

export const AlertDialogDescription = AlertDialog.Description;

export interface AlertDialogFooterProps extends AlertDialog.FooterProps {}

export const AlertDialogFooter = AlertDialog.Footer;

export interface AlertDialogActionProps
  extends Omit<AlertDialog.ActionProps, "color">,
    ActionButtonProps {}

export const AlertDialogAction = forwardRef<HTMLButtonElement, AlertDialogActionProps>(
  (props, ref) => {
    return (
      <AlertDialog.Action asChild>
        <ActionButton {...props} ref={ref} />
      </AlertDialog.Action>
    );
  }
);

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
