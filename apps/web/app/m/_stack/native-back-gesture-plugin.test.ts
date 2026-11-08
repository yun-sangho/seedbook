import { describe, expect, it, vi } from "vitest";
import { nativeBackGesturePlugin, withBrowserPopFlag } from "./native-back-gesture-plugin";

type Hook = (args: {
  actionParams: Record<string, unknown>;
  actions: { overrideActionParams: (params: Record<string, unknown>) => void };
}) => void;

function setup(enabled: boolean) {
  const plugin = nativeBackGesturePlugin({ enabled: () => enabled })() as unknown as {
    onBeforePop: Hook;
    onBeforePush: Hook;
  };
  const runPop = () => {
    const overrideActionParams = vi.fn();
    plugin.onBeforePop({ actionParams: {}, actions: { overrideActionParams } });
    return overrideActionParams;
  };
  const runPush = () => {
    const overrideActionParams = vi.fn();
    plugin.onBeforePush({
      actionParams: { activityId: "a1" },
      actions: { overrideActionParams },
    });
    return overrideActionParams;
  };
  return { runPop, runPush };
}

/** history-sync 가 브라우저 popstate 리스너 안에서 동기적으로 pop/push 하는 상황. */
function duringBrowserPop<T>(fn: () => T): T {
  let result!: T;
  withBrowserPopFlag(() => {
    result = fn();
  })(new PopStateEvent("popstate"));
  return result;
}

describe("nativeBackGesturePlugin", () => {
  it("skips the exit animation for a pop caused by browser back (popstate)", () => {
    const { runPop } = setup(true);

    const override = duringBrowserPop(runPop);

    expect(override).toHaveBeenCalledWith({ skipExitActiveState: true });
  });

  it("skips the enter animation for a push caused by browser forward (popstate)", () => {
    const { runPush } = setup(true);

    const override = duringBrowserPop(runPush);

    expect(override).toHaveBeenCalledWith({ activityId: "a1", skipEnterActiveState: true });
  });

  it("keeps the animation for an in-app pop (back button)", () => {
    const { runPop } = setup(true);

    const override = runPop();

    expect(override).not.toHaveBeenCalled();
  });

  it("keeps the animation for a pop after the popstate listener has returned", () => {
    const { runPop } = setup(true);

    duringBrowserPop(() => undefined);
    const override = runPop();

    expect(override).not.toHaveBeenCalled();
  });

  it("clears the flag even when the popstate listener throws", () => {
    const { runPop } = setup(true);

    expect(() =>
      withBrowserPopFlag(() => {
        throw new Error("boom");
      })(new PopStateEvent("popstate"))
    ).toThrow("boom");
    const override = runPop();

    expect(override).not.toHaveBeenCalled();
  });

  it("does nothing when disabled (non-iOS)", () => {
    const { runPop } = setup(false);

    const override = duringBrowserPop(runPop);

    expect(override).not.toHaveBeenCalled();
  });
});
