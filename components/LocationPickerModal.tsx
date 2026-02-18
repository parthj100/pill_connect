"use client";

import React, { useState } from "react";
import { Button } from "@/ui/components/Button";
import { TextField } from "@/ui/components/TextField";

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, location: 'Mount Vernon' | 'New Rochelle') => void;
  isLoading?: boolean;
  defaultName?: string;
}

export function LocationPickerModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading = false,
  defaultName = ''
}: LocationPickerModalProps) {
  const [name, setName] = useState(defaultName);
  const [selectedLocation, setSelectedLocation] = useState<'Mount Vernon' | 'New Rochelle'>('New Rochelle');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!name.trim()) return;
    onConfirm(name.trim(), selectedLocation);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && name.trim()) {
      handleSubmit();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-picker-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
        aria-label="Close modal"
      />
      
      {/* Modal */}
      <div className="relative w-[480px] max-w-[94vw] rounded-lg border border-neutral-200 bg-default-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4">
          <h2 id="location-picker-title" className="text-heading-2 font-heading-2 text-default-font mb-2">
            Create New Broadcast
          </h2>
          <p className="text-body text-subtext-color">
            Choose a name and location for your new broadcast channel.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          {/* Broadcast Name */}
          <div>
            <label htmlFor="broadcast-name" className="block text-body-bold text-default-font mb-2">
              Broadcast Name
            </label>
            <TextField className="h-auto w-full" variant="filled" label="" helpText="">
              <TextField.Input 
                id="broadcast-name"
                placeholder="Enter broadcast name" 
                value={name} 
                onChange={(e: any) => setName(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </TextField>
          </div>

          {/* Location Selection */}
          <div>
            <label className="block text-body-bold text-default-font mb-2">
              Location
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md border border-neutral-border hover:bg-neutral-50">
                <input 
                  type="radio" 
                  name="location" 
                  value="New Rochelle"
                  checked={selectedLocation === 'New Rochelle'}
                  onChange={(e) => setSelectedLocation(e.target.value as 'New Rochelle')}
                  disabled={isLoading}
                  className="text-brand-600"
                />
                <div>
                  <div className="text-body-bold text-default-font">New Rochelle</div>
                  <div className="text-caption text-subtext-color">Main pharmacy location</div>
                </div>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md border border-neutral-border hover:bg-neutral-50">
                <input 
                  type="radio" 
                  name="location" 
                  value="Mount Vernon"
                  checked={selectedLocation === 'Mount Vernon'}
                  onChange={(e) => setSelectedLocation(e.target.value as 'Mount Vernon')}
                  disabled={isLoading}
                  className="text-brand-600"
                />
                <div>
                  <div className="text-body-bold text-default-font">Mount Vernon</div>
                  <div className="text-caption text-subtext-color">Secondary pharmacy location</div>
                </div>
              </label>
            </div>
          </div>
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
            variant="brand-primary" 
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? 'Creating...' : 'Create Broadcast'}
          </Button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="mt-3 text-center">
          <span className="text-caption text-subtext-color">
            Press Escape to cancel or Enter to create
          </span>
        </div>
      </div>
    </div>
  );
}