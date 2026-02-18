"use client";

import React from "react";
import { Button } from "@/ui/components/Button";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; retry: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback component if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} retry={this.handleRetry} />;
      }

      // Default error UI
      return (
        <DefaultErrorFallback error={this.state.error} retry={this.handleRetry} />
      );
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error?: Error;
  retry: () => void;
}

function DefaultErrorFallback({ error, retry }: DefaultErrorFallbackProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center p-8 bg-error-50 border border-error-200 rounded-md"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center mb-6">
        <h2 className="text-heading-2 font-heading-2 text-error-700 mb-2">
          Something went wrong
        </h2>
        <p className="text-body text-error-600 max-w-md">
          An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
        </p>
        {error && process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-caption font-caption text-error-500 hover:text-error-700">
              Error Details (Development)
            </summary>
            <pre className="mt-2 text-caption bg-error-100 p-2 rounded border overflow-auto max-h-32">
              {error.message}
              {error.stack && '\n\nStack trace:\n' + error.stack}
            </pre>
          </details>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="brand-primary" onClick={retry}>
          Try Again
        </Button>
        <Button 
          variant="neutral-secondary" 
          onClick={() => window.location.reload()}
        >
          Refresh Page
        </Button>
      </div>
    </div>
  );
}

// Convenience wrapper for dashboard components
export function DashboardErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Could integrate with error reporting service here
        console.error('Dashboard Error:', { error, errorInfo });
      }}
      fallback={({ error, retry }) => (
        <div className="flex flex-col items-center justify-center p-8 bg-error-50 border border-error-200 rounded-md mx-4">
          <h3 className="text-heading-3 font-heading-3 text-error-700 mb-2">
            Dashboard Component Error
          </h3>
          <p className="text-body text-error-600 text-center mb-4">
            This section of the dashboard encountered an error. Other parts of the dashboard should still work.
          </p>
          <Button variant="brand-tertiary" onClick={retry} size="small">
            Retry
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}