"use client";

import React, { useState } from 'react';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationSettings as Settings, NOTIFICATION_SOUNDS } from '@/lib/notificationSystem';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationSettings({ isOpen, onClose }: NotificationSettingsProps) {
  const { settings, updateSettings, enableDesktopNotifications } = useNotifications();
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [testingSound, setTestingSound] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const { show } = useNotifications();
  
  const testSound = async (soundId: string) => {
    setTestingSound(soundId);
    const sound = Object.values(NOTIFICATION_SOUNDS).find(s => s.id === soundId);
    if (sound) {
      // Create test notification with this sound
      show({
        type: 'info',
        priority: 'low',
        title: 'Sound Test',
        message: `Testing ${sound.name}`,
        duration: 2000,
        sound
      });
    }
    setTimeout(() => setTestingSound(null), 1000);
  };

  const handleEnableDesktop = async () => {
    const success = await enableDesktopNotifications();
    if (success) {
      setLocalSettings(prev => ({ ...prev, desktop: true }));
    } else {
      alert('Desktop notifications permission was denied. Please enable in browser settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-[600px] max-w-[94vw] max-h-[80vh] overflow-y-auto rounded-lg border border-neutral-200 bg-default-background shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-default-background border-b border-neutral-200 px-6 py-4">
          <h2 className="text-heading-2 font-heading-2 text-default-font">
            Notification Settings
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* General Settings */}
          <div className="space-y-4">
            <h3 className="text-heading-3 font-heading-3 text-default-font">General</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={localSettings.enabled}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                className="rounded border-neutral-300"
              />
              <span className="text-body text-default-font">Enable notifications</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={localSettings.sounds}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, sounds: e.target.checked }))}
                className="rounded border-neutral-300"
              />
              <span className="text-body text-default-font">Enable notification sounds</span>
            </label>

            <div className="flex items-center gap-3">
              <input 
                type="checkbox" 
                checked={localSettings.desktop}
                onChange={handleEnableDesktop}
                className="rounded border-neutral-300"
              />
              <span className="text-body text-default-font">Enable desktop notifications</span>
              {!localSettings.desktop && (
                <Button size="small" variant="brand-tertiary" onClick={handleEnableDesktop}>
                  Enable
                </Button>
              )}
            </div>
          </div>

          {/* Position Settings */}
          <div className="space-y-4">
            <h3 className="text-heading-3 font-heading-3 text-default-font">Position</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'top-right', label: 'Top Right' },
                { key: 'top-left', label: 'Top Left' },
                { key: 'bottom-right', label: 'Bottom Right' },
                { key: 'bottom-left', label: 'Bottom Left' },
                { key: 'top-center', label: 'Top Center' },
                { key: 'bottom-center', label: 'Bottom Center' }
              ].map(position => (
                <label key={position.key} className="flex items-center gap-2 cursor-pointer p-3 rounded-md border border-neutral-200 hover:bg-neutral-50">
                  <input 
                    type="radio" 
                    name="position"
                    value={position.key}
                    checked={localSettings.position === position.key}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, position: e.target.value as any }))}
                    className="text-brand-600"
                  />
                  <span className="text-body text-default-font">{position.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Display Settings */}
          <div className="space-y-4">
            <h3 className="text-heading-3 font-heading-3 text-default-font">Display</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-body-bold text-default-font mb-2">
                  Max visible notifications
                </label>
                <TextField className="h-auto w-full" variant="filled" label="" helpText="">
                  <TextField.Input 
                    type="number"
                    min="1"
                    max="10"
                    value={localSettings.maxVisible.toString()}
                    onChange={(e: any) => setLocalSettings(prev => ({ ...prev, maxVisible: parseInt(e.target.value) || 5 }))}
                  />
                </TextField>
              </div>
              
              <div>
                <label className="block text-body-bold text-default-font mb-2">
                  Default duration (seconds)
                </label>
                <TextField className="h-auto w-full" variant="filled" label="" helpText="">
                  <TextField.Input 
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={(localSettings.defaultDuration / 1000).toString()}
                    onChange={(e: any) => setLocalSettings(prev => ({ ...prev, defaultDuration: (parseFloat(e.target.value) || 5) * 1000 }))}
                  />
                </TextField>
              </div>
            </div>
            
            <p className="text-caption text-subtext-color">
              Set duration to 0 for persistent notifications that don't auto-dismiss
            </p>
          </div>

          {/* Sound Settings */}
          {localSettings.sounds && (
            <div className="space-y-4">
              <h3 className="text-heading-3 font-heading-3 text-default-font">Sounds</h3>
              
              <div className="space-y-3">
                {[
                  { type: 'message', label: 'New Message' },
                  { type: 'success', label: 'Success' },
                  { type: 'error', label: 'Error' },
                  { type: 'warning', label: 'Warning' },
                  { type: 'info', label: 'Information' },
                  { type: 'broadcast', label: 'Broadcast' },
                  { type: 'system', label: 'System' }
                ].map(notifType => (
                  <div key={notifType.type} className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                    <span className="text-body text-default-font">{notifType.label}</span>
                    <div className="flex items-center gap-2">
                      <select 
                        value={localSettings.soundsByType[notifType.type as keyof typeof localSettings.soundsByType]?.id || ''}
                        onChange={(e) => {
                          const sound = Object.values(NOTIFICATION_SOUNDS).find(s => s.id === e.target.value);
                          setLocalSettings(prev => ({
                            ...prev,
                            soundsByType: {
                              ...prev.soundsByType,
                              [notifType.type]: sound || null
                            }
                          }));
                        }}
                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                      >
                        <option value="">None</option>
                        {Object.values(NOTIFICATION_SOUNDS).map(sound => (
                          <option key={sound.id} value={sound.id}>{sound.name}</option>
                        ))}
                      </select>
                      
                      <Button
                        size="small"
                        variant="neutral-tertiary"
                        onClick={() => testSound(localSettings.soundsByType[notifType.type as keyof typeof localSettings.soundsByType]?.id || '')}
                        disabled={!localSettings.soundsByType[notifType.type as keyof typeof localSettings.soundsByType] || testingSound === localSettings.soundsByType[notifType.type as keyof typeof localSettings.soundsByType]?.id}
                      >
                        {testingSound === localSettings.soundsByType[notifType.type as keyof typeof localSettings.soundsByType]?.id ? 'Playing...' : 'Test'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-default-background border-t border-neutral-200 px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="neutral-secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand-primary" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}