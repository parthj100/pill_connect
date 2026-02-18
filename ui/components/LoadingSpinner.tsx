"use client";

import React from "react";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
}

export function LoadingSpinner({ size = "medium", message = "Loading..." }: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "w-4 h-4",
    medium: "w-8 h-8", 
    large: "w-12 h-12"
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`${sizeClasses[size]} border-2 border-brand-600 border-t-transparent rounded-full animate-spin`}></div>
      {message && <div className="text-body font-body text-subtext-color mt-4">{message}</div>}
    </div>
  );
}