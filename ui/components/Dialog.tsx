"use client";
/*
 * Documentation:
 * Dialog — https://app.subframe.com/66426257c465/library?component=Dialog_ca59db17-43fb-4247-8094-3c55162e902d
 */

import React from "react";
import * as SubframeUtils from "../utils";
import * as SubframeCore from "@subframe/core";

interface ContentProps
  extends React.ComponentProps<typeof SubframeCore.Dialog.Content> {
  children?: React.ReactNode;
  className?: string;
}

const Content = React.forwardRef<HTMLDivElement, ContentProps>(function Content(
  { children, className, ...otherProps }: ContentProps,
  ref
) {
  return (
    <SubframeCore.Dialog.Content {...otherProps}>
      <div
        className={SubframeUtils.twClassNames(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex min-w-[320px] flex-col items-start gap-2 rounded-md border border-solid border-neutral-border bg-default-background shadow-lg max-h-[90vh] overflow-auto",
          className
        )}
        ref={ref}
      >
        {children}
      </div>
    </SubframeCore.Dialog.Content>
  );
});

interface DialogRootProps
  extends React.ComponentProps<typeof SubframeCore.Dialog.Root> {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const DialogRoot = React.forwardRef<HTMLDivElement, DialogRootProps>(
  function DialogRoot(
    { children, className, ...otherProps }: DialogRootProps,
    ref
  ) {
    return (
      <SubframeCore.Dialog.Root {...otherProps}>
        {/* Fallback overlay for environments where Portal/Overlay isn't exported */}
        <div className="fixed inset-0 bg-[#00000099]" />
        <div className={className} ref={ref}>{children}</div>
      </SubframeCore.Dialog.Root>
    );
  }
);

export const Dialog = Object.assign(DialogRoot, {
  Content,
});
