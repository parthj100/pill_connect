import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { supabase } from "@/lib/supabaseClient";
import HomeOverviewDashboard from "./pages/HomeOverviewDashboard";
import Messages from "./pages/Messages";
import NewMessages from "./pages/NewMessages";
import BroadcastsPage from "./pages/Broadcasts";
import Contacts from "./pages/Contacts";
import Prescriptions from "./pages/Prescriptions";
import Calendar from "./pages/Calendar";
import ContactProfileView from "./pages/ContactProfileView";
import ContactsImport from "./pages/ContactsImport";
import NewContact from "./pages/NewContact";
import EditContact from "./pages/EditContact";
import UserManagement from "./pages/UserManagement";
import Auth from "./pages/Auth";
import Login from "./pages/Login";
// Auth is temporarily disabled to allow fast iteration. The Auth page remains available at /auth.

function Root() {
  const [ready, setReady] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(!!data.session);
      setReady(true);
    })();
  }, []);
  if (!ready) return null;
  return authed ? <HomeOverviewDashboard /> : <Navigate to="/login" replace />;
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const [ready, setReady] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(!!data.session);
      setReady(true);
    })();
  }, []);
  if (!ready) return null;
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Root />} />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/new-messages" element={<RequireAuth><NewMessages /></RequireAuth>} />
        <Route path="/broadcasts" element={<RequireAuth><BroadcastsPage /></RequireAuth>} />
        <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
        <Route path="/contacts/new" element={<RequireAuth><NewContact /></RequireAuth>} />
        <Route path="/contacts/:patientId/edit" element={<RequireAuth><EditContact /></RequireAuth>} />
        <Route path="/contacts/:patientId" element={<RequireAuth><ContactProfileView /></RequireAuth>} />
        <Route path="/contacts-import" element={<RequireAuth><ContactsImport /></RequireAuth>} />
        <Route path="/user-groups" element={<RequireAuth><UserManagement /></RequireAuth>} />
        <Route path="/prescriptions" element={<RequireAuth><Prescriptions /></RequireAuth>} />
        <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}
