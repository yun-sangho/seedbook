/**
 * @file ui:switch (Switchmark 만 — `ListSwitchItem` 의 suffix)
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 * @requires @seed-design/css@^2.0.0 || ^3.0.0
 **/

"use client";

import * as React from "react";
import { Switch as SeedSwitch } from "@seed-design/react";

export interface SwitchmarkProps extends SeedSwitch.ControlProps {}

/**
 * 스위치 모양 (트랙 + 손잡이). `ListSwitchItem` 처럼 스위치 상태를 가진 부모 안에 둔다.
 *
 * @see https://seed-design.io/react/components/list
 */
export const Switchmark = React.forwardRef<HTMLDivElement, SwitchmarkProps>((props, ref) => (
  <SeedSwitch.Control ref={ref} {...props}>
    <SeedSwitch.Thumb />
  </SeedSwitch.Control>
));
Switchmark.displayName = "Switchmark";
