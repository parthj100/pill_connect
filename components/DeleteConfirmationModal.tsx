"use client";

import React from "react";
import { Button } from "@/ui/components/Button";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName?: string;
  deleteItems?: string[];
  isLoading?: boolean;
}

export function DeleteConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  itemName, 
  deleteItems, 
  isLoading = false 
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      onConfirm();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
        aria-label="Close modal"
      />
      
      {/* Modal */}
      <div className="relative w-[480px] max-w-[94vw] rounded-lg border border-error-200 bg-default-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4">
          <h2 id="delete-modal-title" className="text-heading-2 font-heading-2 text-error-700 mb-2">
            {title}
          </h2>
          <p id="delete-modal-description" className="text-body text-default-font">
            {description}
          </p>
        </div>

        {/* Item name highlight */}
        {itemName && (
          <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded-md">
            <span className="text-body-bold text-error-800">"{itemName}"</span>
          </div>
        )}

        {/* Delete items list */}
        {deleteItems && deleteItems.length > 0 && (
          <div className="mb-4">
            <p className="text-body-bold text-default-font mb-2">This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1">
              {deleteItems.map((item, index) => (
                <li key={index} className="text-body text-subtext-color">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warning */}
        <div className="mb-6 p-3 bg-warning-50 border border-warning-200 rounded-md">
          <p className="text-body text-warning-800 font-medium">
            ⚠️ This action cannot be undone
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button 
            variant="neutral-secondary" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive-primary" 
            onClick={onConfirm}
            disabled={isLoading}
            aria-describedby="delete-shortcut-hint"
          >
            {isLoading ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="mt-3 text-center">
          <span id="delete-shortcut-hint" className="text-caption text-subtext-color">
            Press Escape to cancel or Cmd+Enter to delete
          </span>
        </div>
      </div>
    </div>
  );
}