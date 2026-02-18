"use client";

import React from "react";
import { Button } from "@/ui/components/Button";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  className?: string;
}

export function QuickActions({ className }: QuickActionsProps) {
  const navigate = useNavigate();

  const handleStartNewConversation = () => {
    navigate('/messages?action=new');
  };

  const handleStartBroadcast = () => {
    navigate('/broadcasts');
  };

  const handleAddNewContact = () => {
    navigate('/contacts/new');
  };

  const handleImportContacts = () => {
    navigate('/contacts-import');
  };

  return (
    <div className={`flex w-full items-center gap-3 ${className || ''}`}>
      <Button 
        variant="brand-tertiary" 
        onClick={handleStartNewConversation}
        aria-label="Start a new conversation with a patient"
      >
        Start new conversation
      </Button>
      <Button 
        variant="neutral-tertiary" 
        onClick={handleStartBroadcast}
        aria-label="Create a new broadcast channel"
      >
        Start broadcast channel
      </Button>
      <Button 
        variant="neutral-tertiary" 
        onClick={handleAddNewContact}
        aria-label="Add a new contact to the system"
      >
        Add new contact
      </Button>
      <Button 
        variant="neutral-tertiary" 
        onClick={handleImportContacts}
        aria-label="Import contacts from CSV file"
      >
        Import contacts (CSV)
      </Button>
    </div>
  );
}