export type MessageSender = "patient" | "staff" | "system";

export interface Patient {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  text?: string;
  createdAt: string; // ISO string
  type?: "text" | "prescriptionUpdate" | "attachment" | "system";
  attachments?: Array<{
    id: string;
    kind: "image" | "file";
    url: string;
    name?: string;
  }>;
}

export interface Conversation {
  id: string;
  patient: Patient;
  unreadCount: number;
  status?: "active" | "refill-due" | "new";
  messages: Message[];
}

export function createMockConversations(): Conversation[] {
  const sarah: Patient = {
    id: "sarah-johnson",
    name: "Sarah Johnson",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2",
  };
  const michael: Patient = {
    id: "michael-chen",
    name: "Michael Chen",
    avatarUrl: "https://images.unsplash.com/photo-1566492031773-4f4e44671857",
  };

  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  const convSarah: Conversation = {
    id: "conv_sarah",
    patient: sarah,
    unreadCount: 1,
    status: "refill-due",
    messages: [
      {
        id: "m1",
        conversationId: "conv_sarah",
        sender: "patient",
        text: "Hi, I need to refill my blood pressure medication. Running low.",
        createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60)),
        type: "text",
      },
      {
        id: "m2",
        conversationId: "conv_sarah",
        sender: "staff",
        text:
          "I'll process your refill request right away. Your last prescription was for Lisinopril 10mg. Is this correct?",
        createdAt: iso(new Date(now.getTime() - 1000 * 60 * 30)),
        type: "text",
      },
      {
        id: "m3",
        conversationId: "conv_sarah",
        sender: "staff",
        text:
          "Your Lisinopril 10mg prescription is ready for pickup!",
        createdAt: iso(new Date(now.getTime() - 1000 * 60 * 10)),
        type: "prescriptionUpdate",
      },
    ],
  };

  const convMichael: Conversation = {
    id: "conv_michael",
    patient: michael,
    unreadCount: 0,
    status: "active",
    messages: [
      {
        id: "m4",
        conversationId: "conv_michael",
        sender: "patient",
        text: "Thanks for the appointment reminder...",
        createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24)),
        type: "text",
      },
    ],
  };

  return [convSarah, convMichael];
}

export function formatDateLabel(dateIso: string): string {
  const date = new Date(dateIso);
  const today = new Date();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (t.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}


