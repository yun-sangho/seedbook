"use client";

import { LogOut } from "lucide-react";
import { authClient, useSession } from "@web/lib/auth-client";
import { Button } from "@web/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@web/components/ui/popover";
import { cn } from "@web/lib/utils";

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

export function UserMenu() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />;
  }

  if (!session?.user) {
    return (
      <Button
        size="sm"
        onClick={() =>
          authClient.signIn.social({
            provider: "kakao",
            callbackURL: "/dashboard",
          })
        }
      >
        카카오 로그인
      </Button>
    );
  }

  const { user } = session;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? "user"}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {getInitials(user.name)}
            </span>
          )}
          <span className="max-w-[8rem] truncate">{user.name ?? "사용자"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {user.email ?? user.name ?? "로그인됨"}
          </div>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              window.location.reload();
            }}
            className={cn(
              "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <LogOut className="size-4" />
            로그아웃
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
