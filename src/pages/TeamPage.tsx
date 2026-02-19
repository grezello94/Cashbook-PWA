import { useMemo, useState, type FormEvent } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import type { AppRole, WorkspaceMember, WorkspaceMemberDirectory } from "@/types/domain";

interface TeamPageProps {
  member: WorkspaceMember;
  members: WorkspaceMemberDirectory[];
  currentUserId: string;
  onGrantAccess: (contact: string, role: AppRole, allowDeleteForEditor: boolean) => Promise<void>;
  onUpdateMember: (targetUserId: string, role: AppRole, allowDeleteForEditor: boolean) => Promise<void>;
  onRevokeMember: (targetUserId: string) => Promise<void>;
}

export function TeamPage(props: TeamPageProps): JSX.Element {
  const { member, members, currentUserId, onGrantAccess, onUpdateMember, onRevokeMember } = props;

  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<AppRole>("editor");
  const [allowDeleteForEditor, setAllowDeleteForEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [error, setError] = useState("");

  const canManageUsers = member.role === "admin" || member.can_manage_users;

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "admin" ? -1 : 1;
      }
      const aLabel = (a.full_name || a.email || a.phone || a.user_id).toLowerCase();
      const bLabel = (b.full_name || b.email || b.phone || b.user_id).toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [members]);

  const grant = async (event: FormEvent) => {
    event.preventDefault();
    const value = contact.trim();
    if (!value) {
      setError("Enter an email or phone number.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onGrantAccess(value, role, allowDeleteForEditor);
      setContact("");
      setRole("editor");
      setAllowDeleteForEditor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grant access.");
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (targetUserId: string, nextRole: AppRole, allowDelete: boolean) => {
    setEditingUserId(targetUserId);
    setError("");
    try {
      await onUpdateMember(targetUserId, nextRole, allowDelete);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update member.");
    } finally {
      setEditingUserId("");
    }
  };

  const revoke = async (targetUserId: string) => {
    setEditingUserId(targetUserId);
    setError("");
    try {
      await onRevokeMember(targetUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke access.");
    } finally {
      setEditingUserId("");
    }
  };

  return (
    <section className="stack-lg">
      <NeonCard title="RBAC Matrix" subtitle="Owner/Admin and Editor policy map">
        <div className="matrix">
          <div className="matrix-row matrix-head">
            <span>Feature</span>
            <span>Admin</span>
            <span>Editor</span>
          </div>
          <div className="matrix-row">
            <span>Add/Edit Entries</span>
            <span>Yes</span>
            <span>Yes</span>
          </div>
          <div className="matrix-row">
            <span>Delete Entries</span>
            <span>Yes</span>
            <span>No (unless permitted)</span>
          </div>
          <div className="matrix-row">
            <span>Manage Categories</span>
            <span>Add/Edit/Remove</span>
            <span>View only</span>
          </div>
          <div className="matrix-row">
            <span>User Management</span>
            <span>Grant/Revoke</span>
            <span>No Access</span>
          </div>
        </div>
      </NeonCard>

      <NeonCard title="Your Access" subtitle={`Role: ${member.role}`}>
        <ul className="plain-list">
          <li>Can delete entries: {member.can_delete_entries ? "Yes" : "No"}</li>
          <li>Can manage categories: {member.can_manage_categories ? "Yes" : "No"}</li>
          <li>Can manage users: {member.can_manage_users ? "Yes" : "No"}</li>
          <li>Dashboard scope: {member.dashboard_scope}</li>
        </ul>
      </NeonCard>

      {canManageUsers && (
        <NeonCard
          title="Access Management"
          subtitle="User must sign up first, then grant access by email or phone"
        >
          <form className="stack" onSubmit={grant}>
            <div className="segment-row">
              <button
                type="button"
                className={`segment-btn ${contactType === "email" ? "segment-btn-active" : ""}`.trim()}
                onClick={() => setContactType("email")}
              >
                Email
              </button>
              <button
                type="button"
                className={`segment-btn ${contactType === "phone" ? "segment-btn-active" : ""}`.trim()}
                onClick={() => setContactType("phone")}
              >
                Mobile
              </button>
            </div>

            <input
              type={contactType === "email" ? "email" : "tel"}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={contactType === "email" ? "user@example.com" : "+1XXXXXXXXXX"}
              required
            />

            <div className="segment-row">
              <button
                type="button"
                className={`segment-btn ${role === "editor" ? "segment-btn-active" : ""}`.trim()}
                onClick={() => setRole("editor")}
              >
                Editor
              </button>
              <button
                type="button"
                className={`segment-btn ${role === "admin" ? "segment-btn-active" : ""}`.trim()}
                onClick={() => setRole("admin")}
              >
                Admin
              </button>
            </div>

            {role === "editor" && (
              <label className="switch-row" htmlFor="allow-delete">
                <input
                  id="allow-delete"
                  type="checkbox"
                  checked={allowDeleteForEditor}
                  onChange={(event) => setAllowDeleteForEditor(event.target.checked)}
                />
                Allow this editor to delete entries
              </label>
            )}

            {error && <small className="error-text">{error}</small>}

            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? "Granting..." : "Grant Access"}
            </button>
          </form>
        </NeonCard>
      )}

      {canManageUsers && (
        <NeonCard title="Team Members" subtitle="Role and permission controls">
          <div className="stack">
            {sortedMembers.map((item) => {
              const isSelf = item.user_id === currentUserId;
              const busy = editingUserId === item.user_id;
              const displayName = item.full_name || item.email || item.phone || item.user_id;

              return (
                <article key={item.user_id} className="member-row">
                  <div>
                    <strong>{displayName}</strong>
                    <small>
                      {item.email ?? "No email"} {item.phone ? `| ${item.phone}` : ""}
                    </small>
                    <small>
                      Role: {item.role} {item.role === "editor" ? `| Delete: ${item.can_delete_entries ? "Yes" : "No"}` : ""}
                    </small>
                  </div>

                  <div className="inline-actions">
                    {!isSelf && (
                      <button
                        className="secondary-btn"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          updateRole(item.user_id, item.role === "admin" ? "editor" : "admin", item.can_delete_entries)
                        }
                      >
                        {item.role === "admin" ? "Make Editor" : "Make Admin"}
                      </button>
                    )}

                    {!isSelf && item.role === "editor" && (
                      <button
                        className="ghost-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => updateRole(item.user_id, "editor", !item.can_delete_entries)}
                      >
                        {item.can_delete_entries ? "Disable Delete" : "Allow Delete"}
                      </button>
                    )}

                    {!isSelf && (
                      <button className="reject-btn" type="button" disabled={busy} onClick={() => revoke(item.user_id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!sortedMembers.length && <p className="muted">No members found.</p>}
          </div>
        </NeonCard>
      )}
    </section>
  );
}
