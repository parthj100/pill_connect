"use client";

import React from "react";
import { IconWithBackground } from "@/ui/components/IconWithBackground";

export interface DashboardMetrics {
  totalPatients: number;
  newPatientsToday: number;
  newPatientsWeek: number;
  messagesTodayTotal: number;
  messagesTodayInbound: number;
  messagesTodayOutbound: number;
}

interface MetricsCardsProps {
  metrics: DashboardMetrics;
  isLoading?: boolean;
  className?: string;
}

export function MetricsCards({ metrics, isLoading, className }: MetricsCardsProps) {
  if (isLoading) {
    return (
      <div className={`flex w-full flex-wrap items-start gap-4 ${className || ''}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex min-w-[240px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-neutral-200 rounded"></div>
              <div className="w-24 h-4 bg-neutral-200 rounded"></div>
            </div>
            <div className="w-16 h-8 bg-neutral-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-wrap items-start gap-4 ${className || ''}`} role="region" aria-label="Dashboard metrics">
      <div 
        className="flex min-w-[240px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm"
        role="article"
        aria-labelledby="total-patients-title"
      >
        <div className="flex items-center gap-2">
          <IconWithBackground variant="success" aria-hidden="true" />
          <span id="total-patients-title" className="text-heading-3 font-heading-3 text-default-font">
            Total Patients
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-heading-1 font-heading-1 text-default-font" aria-label={`${metrics.totalPatients} total patients`}>
            {metrics.totalPatients}
          </span>
        </div>
      </div>

      <div 
        className="flex min-w-[240px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm"
        role="article"
        aria-labelledby="messages-today-title"
      >
        <div className="flex items-center gap-2">
          <IconWithBackground variant="warning" aria-hidden="true" />
          <span id="messages-today-title" className="text-heading-3 font-heading-3 text-default-font">
            Messages Today
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-heading-1 font-heading-1 text-default-font" aria-label={`${metrics.messagesTodayTotal} total messages today`}>
            {metrics.messagesTodayTotal}
          </span>
          <span className="text-caption text-subtext-color pb-1" aria-label={`${metrics.messagesTodayInbound} inbound, ${metrics.messagesTodayOutbound} outbound`}>
            in {metrics.messagesTodayInbound} / out {metrics.messagesTodayOutbound}
          </span>
        </div>
      </div>

      <div 
        className="flex min-w-[240px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm"
        role="article"
        aria-labelledby="new-patients-title"
      >
        <div className="flex items-center gap-2">
          <IconWithBackground aria-hidden="true" />
          <span id="new-patients-title" className="text-heading-3 font-heading-3 text-default-font">
            New Patients
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-heading-1 font-heading-1 text-default-font" aria-label={`${metrics.newPatientsToday} new patients today`}>
            {metrics.newPatientsToday}
          </span>
          <span className="text-caption text-subtext-color pb-1" aria-label={`${metrics.newPatientsWeek} new patients in the last 7 days`}>
            today · {metrics.newPatientsWeek} last 7d
          </span>
        </div>
      </div>
    </div>
  );
}