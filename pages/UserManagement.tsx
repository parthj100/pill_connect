"use client";

import React, { useState, useEffect } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { Button } from "@/ui/components/Button";
import { TextField } from "@/ui/components/TextField";
import { Select } from "@/ui/components/Select";
import { Toast } from "@/ui/components/Toast";
import { Avatar } from "@/ui/components/Avatar";
import { LoadingSpinner } from "@/ui/components/LoadingSpinner";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUser } from "@/lib/auth";

interface User {
  id: string;
  username?: string;
  email?: string;
  auth_email?: string;
  display_name?: string;
  role?: string;
  pharmacy_location?: string;
  allowed_locations: string[];
  created_at: string;
  is_existing_user?: boolean;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const cached = localStorage.getItem('pc_is_admin');
      return cached === 'true';
    } catch {
      return false;
    }
  });
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  // Form state for creating/editing users
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "staff",
    pharmacy_location: "none",
    allowed_locations: [] as string[]
  });

  // Form state for password changes
  const [passwordFormData, setPasswordFormData] = useState({
    new_password: "",
    confirm_password: ""
  });

  // Check if current user is admin and load users simultaneously
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          setError("Not authenticated");
          setLoadingUsers(false);
          setIsCheckingAdmin(false);
          return;
        }
        
        // Run admin check and user loading in parallel
        const [profileResult, usersResult] = await Promise.allSettled([
          supabase
            .from('profiles')
            .select('role, pharmacy_location')
            .eq('id', user.id)
            .maybeSingle(),
          supabase.rpc('get_users_with_auth_emails')
        ]);
        
        // Handle admin check
        if (profileResult.status === 'fulfilled' && profileResult.value.data) {
          const role = (profileResult.value.data as any)?.role;
          const location = (profileResult.value.data as any)?.pharmacy_location;
          const adminCheck = role === 'admin' || location === 'Admin';
          
          if (!adminCheck) {
            setError("Access denied. Admin privileges required.");
            setLoadingUsers(false);
            setIsCheckingAdmin(false);
            return;
          }
          
          setIsAdmin(true);
          try { localStorage.setItem('pc_is_admin', 'true'); } catch {}
        } else {
          setError("Failed to verify admin access");
          setLoadingUsers(false);
          setIsCheckingAdmin(false);
          return;
        }
        
        // Handle users loading
        if (usersResult.status === 'fulfilled' && usersResult.value.data) {
          setUsers(usersResult.value.data as User[]);
        } else {
          // Fallback to profiles only if RPC doesn't exist
          try {
            const { data: profilesData, error: profilesError } = await supabase
              .from('profiles')
              .select('id, username, email, display_name, role, pharmacy_location, allowed_locations, created_at')
              .order('created_at', { ascending: false });
            
            if (profilesError) throw profilesError;
            
            const usersWithEmails = (profilesData as any[]).map(profile => ({
              ...profile,
              auth_email: profile.email,
              is_existing_user: true
            }));
            
            setUsers(usersWithEmails as User[]);
          } catch (err) {
            setError("Failed to load users");
          }
        }
        
        setLoadingUsers(false);
        setIsCheckingAdmin(false);
      } catch (err) {
        setError("Failed to verify admin access");
        setLoadingUsers(false);
        setIsCheckingAdmin(false);
      }
    })();
  }, []);

  const loadUsers = async () => {
    try {
      // Get profiles with auth user emails using RPC
      const { data, error } = await supabase.rpc('get_users_with_auth_emails');
      
      if (error) {
        // Fallback to profiles only if RPC doesn't exist
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, email, display_name, role, pharmacy_location, allowed_locations, created_at')
          .order('created_at', { ascending: false });
        
        if (profilesError) throw profilesError;
        
        const usersWithEmails = (profilesData as any[]).map(profile => ({
          ...profile,
          auth_email: profile.email,
          is_existing_user: true
        }));
        
        setUsers(usersWithEmails as User[]);
        return;
      }
      
      setUsers(data as User[]);
    } catch (err) {
      setError("Failed to load users");
    }
  };

  const handleCreateUser = async () => {
    try {
      setError("");
      
      // Call the Edge Function to create user with auth
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          display_name: formData.display_name,
          role: formData.role,
          pharmacy_location: formData.pharmacy_location,
          allowed_locations: formData.pharmacy_location === "none" ? [] : [formData.pharmacy_location]
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create user");
      }

      setToast(result.message || `User created successfully! Username: ${formData.username}, Password: ${formData.password}. User can now log in immediately.`);
      setShowCreateForm(false);
      resetForm();
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    try {
      setError("");
      
      // Validate form data
      if (!formData.username || formData.username.trim() === '') {
        setError("Username is required");
        return;
      }
      
      if (!formData.display_name || formData.display_name.trim() === '') {
        setError("Display name is required");
        return;
      }
      
      // Call the Edge Function to update user with auth
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          user_id: editingUser.id,
          username: formData.username,
          display_name: formData.display_name,
          role: formData.role,
          pharmacy_location: formData.pharmacy_location,
          allowed_locations: formData.pharmacy_location === "none" ? [] : [formData.pharmacy_location]
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update user");
      }

      setToast(result.message || "User updated successfully");
      setEditingUser(null);
      resetForm();
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }
    
    try {
      setError("");
      
      // Use RPC to delete user from both auth.users and profiles
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId
      });
      
      if (error) throw error;
      
      if (data && !data.success) {
        throw new Error(data.error || "Failed to delete user");
      }
      
      setToast("User deleted successfully");
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    }
  };

  const handleChangePassword = async () => {
    if (!editingUser) return;
    
    if (passwordFormData.new_password !== passwordFormData.confirm_password) {
      setError("Passwords do not match");
      return;
    }
    
    if (passwordFormData.new_password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }
    
    try {
      setError("");
      
      // Use RPC to update password
      const { data, error } = await supabase.rpc('admin_update_password', {
        p_user_id: editingUser.id,
        p_new_password: passwordFormData.new_password
      });
      
      if (error) throw error;
      
      if (data && !data.success) {
        throw new Error(data.error || "Failed to update password");
      }
      
      setToast("Password updated successfully");
      setShowPasswordForm(false);
      setPasswordFormData({ new_password: "", confirm_password: "" });
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    }
  };

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      display_name: "",
      role: "staff",
      pharmacy_location: "none",
      allowed_locations: []
    });
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username || "",
      password: "", // Don't show password
      display_name: user.display_name || "",
      role: user.role || "staff",
      pharmacy_location: user.pharmacy_location || "none",
      allowed_locations: user.allowed_locations || []
    });
    setShowCreateForm(true);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setShowCreateForm(false);
    setShowPasswordForm(false);
    resetForm();
    setPasswordFormData({ new_password: "", confirm_password: "" });
  };

  const startPasswordChange = (user: User) => {
    setEditingUser(user);
    setShowPasswordForm(true);
    setPasswordFormData({ new_password: "", confirm_password: "" });
  };

  // Generate user initials for avatar
  const getUserInitials = (user: User) => {
    if (user.display_name) {
      return user.display_name.split(' ').map(name => name[0]).join('').slice(0, 2).toUpperCase();
    }
    if (user.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchQuery || 
      (user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       user.auth_email?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesLocation = locationFilter === "all" || user.pharmacy_location === locationFilter;
    
    return matchesSearch && matchesRole && matchesLocation;
  });


  if (isCheckingAdmin) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar className="flex-none" />
          <div className="flex w-full flex-col items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
      </DefaultPageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar className="flex-none" />
          <div className="flex w-full flex-col items-center justify-center">
            <div className="text-body font-body text-error-600">{error}</div>
          </div>
        </div>
      </DefaultPageLayout>
    );
  }

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar className="flex-none" />
        <div className="flex w-full flex-col items-start">
          <div className="flex flex-col gap-6 p-6 w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-heading-1 font-heading-1 text-default-font">User Management</h1>
                <p className="text-body font-body text-subtext-color mt-1">
                  Manage pharmacy staff accounts and permissions
                </p>
              </div>
              <Button
                variant="brand-primary"
                onClick={() => {
                  setEditingUser(null);
                  setShowCreateForm(true);
                  resetForm();
                }}
              >
                Create User
              </Button>
            </div>

            {error && (
              <div className="bg-error-50 border border-error-200 rounded-lg p-4">
                <div className="text-body font-body text-error-600">{error}</div>
              </div>
            )}

            {showCreateForm && (
              <div className="bg-white border border-neutral-200 rounded-lg p-6">
                <h2 className="text-heading-2 font-heading-2 text-default-font mb-4">
                  {editingUser ? "Edit User" : "Create New User"}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField className="h-auto w-full" variant="filled" label="Username" helpText="">
                    <TextField.Input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </TextField>

                  {!editingUser && (
                    <TextField className="h-auto w-full" variant="filled" label="Password" helpText="">
                      <TextField.Input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      />
                    </TextField>
                  )}

                  <TextField className="h-auto w-full" variant="filled" label="Display Name" helpText="">
                    <TextField.Input
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    />
                  </TextField>

                  <Select
                    className="h-auto w-full"
                    variant="filled"
                    label="Role"
                    placeholder="Select role"
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                                            <Select.Item value="staff">Staff</Select.Item>
                        <Select.Item value="admin">Admin</Select.Item>
                        <Select.Item value="patient">Patient</Select.Item>
                  </Select>

                  <Select
                    className="h-auto w-full"
                    variant="filled"
                    label="Primary Location"
                    placeholder="Select location"
                    value={formData.pharmacy_location}
                    onValueChange={(value) => setFormData({ ...formData, pharmacy_location: value })}
                  >
                    <Select.Item value="none">No primary location</Select.Item>
                    <Select.Item value="Mount Vernon">Mount Vernon</Select.Item>
                    <Select.Item value="New Rochelle">New Rochelle</Select.Item>
                    <Select.Item value="Admin">Admin</Select.Item>
                  </Select>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="brand-primary"
                    onClick={editingUser ? handleUpdateUser : handleCreateUser}
                  >
                    {editingUser ? "Update User" : "Create User"}
                  </Button>
                  <Button
                    variant="neutral-secondary"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Password Change Form */}
            {showPasswordForm && editingUser && (
              <div className="bg-white border border-neutral-200 rounded-lg p-6">
                <h2 className="text-heading-2 font-heading-2 text-default-font mb-4">
                  Change Password for {editingUser.display_name || editingUser.auth_email}
                </h2>
                
                <div className="space-y-4">
                  <TextField className="h-auto w-full" variant="filled" label="New Password" helpText="Minimum 6 characters">
                    <TextField.Input
                      type="password"
                      value={passwordFormData.new_password}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, new_password: e.target.value })}
                    />
                  </TextField>

                  <TextField className="h-auto w-full" variant="filled" label="Confirm New Password" helpText="">
                    <TextField.Input
                      type="password"
                      value={passwordFormData.confirm_password}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, confirm_password: e.target.value })}
                    />
                  </TextField>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="brand-primary"
                    onClick={handleChangePassword}
                  >
                    Update Password
                  </Button>
                  <Button
                    variant="neutral-secondary"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField className="h-auto w-full" variant="filled" label="Search Users" helpText="Search by name, username, or email">
                  <TextField.Input
                    type="text"
                    placeholder="Type to search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </TextField>
                
                <Select
                  className="h-auto w-full"
                  variant="filled"
                  label="Filter by Role"
                  value={roleFilter}
                  onValueChange={(value) => setRoleFilter(value)}
                >
                  <Select.Item value="all">All Roles</Select.Item>
                  <Select.Item value="admin">Admin</Select.Item>
                  <Select.Item value="staff">Staff</Select.Item>
                  <Select.Item value="patient">Patient</Select.Item>
                </Select>
                
                <Select
                  className="h-auto w-full"
                  variant="filled"
                  label="Filter by Location"
                  value={locationFilter}
                  onValueChange={(value) => setLocationFilter(value)}
                >
                  <Select.Item value="all">All Locations</Select.Item>
                  <Select.Item value="Mount Vernon">Mount Vernon</Select.Item>
                  <Select.Item value="New Rochelle">New Rochelle</Select.Item>
                  <Select.Item value="Admin">Admin</Select.Item>
                </Select>
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200">
                <h2 className="text-heading-2 font-heading-2 text-default-font">All Users</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">User</th>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">Login Credentials</th>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">Role</th>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">Location</th>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">Created</th>
                      <th className="px-6 py-3 text-left text-caption font-caption text-subtext-color">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {loadingUsers ? (
                      // Show skeleton rows while loading
                      [...Array(3)].map((_, i) => (
                        <tr key={i}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-neutral-100 rounded-full animate-pulse"></div>
                              <div>
                                <div className="w-24 h-4 bg-neutral-100 rounded animate-pulse mb-2"></div>
                                <div className="w-16 h-3 bg-neutral-100 rounded animate-pulse"></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-32 h-4 bg-neutral-100 rounded animate-pulse mb-2"></div>
                            <div className="w-20 h-3 bg-neutral-100 rounded animate-pulse"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-16 h-6 bg-neutral-100 rounded-full animate-pulse"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-20 h-4 bg-neutral-100 rounded animate-pulse"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-16 h-4 bg-neutral-100 rounded animate-pulse"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <div className="w-12 h-8 bg-neutral-100 rounded animate-pulse"></div>
                              <div className="w-20 h-8 bg-neutral-100 rounded animate-pulse"></div>
                              <div className="w-14 h-8 bg-neutral-100 rounded animate-pulse"></div>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-body font-body text-subtext-color">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar size="medium">{getUserInitials(user)}</Avatar>
                            <div>
                              <div className="text-body font-body text-default-font">
                                {user.display_name || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-body font-body text-default-font">
                          <div>
                            <div>{user.username || "—"}</div>
                            <div className="text-caption text-gray-500 mt-1">
                              {user.auth_email || "—"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-body font-body text-default-font">
                          <span className={`px-2 py-1 rounded-full text-caption font-caption ${
                            user.role === 'admin' ? 'bg-brand-100 text-brand-700' :
                            user.role === 'staff' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {user.role === 'admin' ? 'Admin' :
                             user.role === 'staff' ? 'Staff' :
                             user.role === 'patient' ? 'Patient' : user.role || "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-body font-body text-default-font">
                          {user.pharmacy_location || "—"}
                        </td>
                        <td className="px-6 py-4 text-body font-body text-subtext-color">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button
                              variant="neutral-tertiary"
                              size="small"
                              onClick={() => startEdit(user)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="neutral-secondary"
                              size="small"
                              onClick={() => startPasswordChange(user)}
                            >
                              Change Password
                            </Button>
                            <Button
                              variant="destructive-primary"
                              size="small"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6">
          <Toast variant="success" title="Success" description={toast} />
        </div>
      )}
    </DefaultPageLayout>
  );
}
