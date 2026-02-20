import { useMemo, useState, type FormEvent } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import type { AppRole, WorkspaceMember, WorkspaceMemberDirectory } from "@/types/domain";

interface TeamPageProps {
  member: WorkspaceMember;
  workspaceTimezone: string;
  members: WorkspaceMemberDirectory[];
  currentUserId: string;
  currentUserProfile: {
    fullName: string;
    email: string;
    phone: string;
  };
  onGrantAccess: (
    contact: string,
    role: AppRole,
    allowDeleteForEditor: boolean,
    allowManageCategoriesForEditor: boolean
  ) => Promise<void>;
  onUpdateMember: (
    targetUserId: string,
    role: AppRole,
    allowDeleteForEditor: boolean,
    allowManageCategoriesForEditor: boolean
  ) => Promise<void>;
  onRevokeMember: (targetUserId: string) => Promise<void>;
  onUpdateTimezone: (timezone: string) => Promise<void>;
  onRequestDeleteAccount: () => Promise<void>;
  deletingAccount: boolean;
}

export function TeamPage(props: TeamPageProps): JSX.Element {
  const {
    member,
    workspaceTimezone,
    members,
    currentUserId,
    currentUserProfile,
    onGrantAccess,
    onUpdateMember,
    onRevokeMember,
    onUpdateTimezone,
    onRequestDeleteAccount,
    deletingAccount
  } = props;

  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<AppRole>("editor");
  const [allowDeleteForEditor, setAllowDeleteForEditor] = useState(false);
  const [allowManageCategoriesForEditor, setAllowManageCategoriesForEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [error, setError] = useState("");
  const [timezoneValue, setTimezoneValue] = useState(workspaceTimezone);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneEditOpen, setTimezoneEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const readMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (typeof err === "object" && err && "message" in err && typeof err.message === "string") {
      return err.message;
    }
    return fallback;
  };

  const grantErrorMessage = (err: unknown, requestedContact: string): string => {
    const message = readMessage(err, "Could not grant access.");
    if (message.toLowerCase().includes("not registered")) {
      return `${requestedContact} is not registered yet. Ask them to sign up first, then grant access.`;
    }
    return message;
  };

  const canManageUsers = member.role === "admin" || member.can_manage_users;
  const canEditTimezone = member.role === "admin";
  const displayName = currentUserProfile.fullName || currentUserProfile.email || "User";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const timezoneOptions = useMemo(() => {
    const list = (() => {
      const intlWithSupported = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
      if (typeof Intl !== "undefined" && typeof intlWithSupported.supportedValuesOf === "function") {
        try {
          return intlWithSupported.supportedValuesOf("timeZone");
        } catch {
          return [];
        }
      }
      return [];
    })();

    if (list.length) {
      return list;
    }
    return ["Asia/Kolkata", "UTC", "Asia/Dubai", "Europe/London", "America/New_York", "Asia/Singapore"];
  }, []);

  const timezoneWithOffset = useMemo(() => {
    const readOffset = (zone: string): string => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          timeZoneName: "shortOffset"
        }).formatToParts(new Date());
        const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
        return value || "GMT";
      } catch {
        return "GMT";
      }
    };

    return timezoneOptions.map((zone) => ({
      zone,
      label: `${zone} (${readOffset(zone)})`
    }));
  }, [timezoneOptions]);

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
    const normalizedValue = value.toLowerCase();
    const alreadyMember = members.some(
      (item) =>
        (item.email && item.email.toLowerCase() === normalizedValue) ||
        (item.phone && item.phone.replace(/\s+/g, "") === value.replace(/\s+/g, ""))
    );
    if (alreadyMember) {
      setError(`${value} already has workspace access. Use Team Members to change permissions.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onGrantAccess(value, role, allowDeleteForEditor, allowManageCategoriesForEditor);
      setContact("");
      setRole("editor");
      setAllowDeleteForEditor(false);
      setAllowManageCategoriesForEditor(false);
    } catch (err) {
      setError(grantErrorMessage(err, value));
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (
    targetUserId: string,
    nextRole: AppRole,
    allowDelete: boolean,
    allowManageCategories: boolean
  ) => {
    setEditingUserId(targetUserId);
    setError("");
    try {
      await onUpdateMember(targetUserId, nextRole, allowDelete, allowManageCategories);
    } catch (err) {
      setError(readMessage(err, "Could not update member."));
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
      setError(readMessage(err, "Could not revoke access."));
    } finally {
      setEditingUserId("");
    }
  };

  const saveTimezone = async (): Promise<void> => {
    const nextTimezone = timezoneValue.trim();
    if (!nextTimezone) {
      setError("Timezone is required.");
      return;
    }
    setTimezoneSaving(true);
    setError("");
    try {
      await onUpdateTimezone(nextTimezone);
      setTimezoneEditOpen(false);
    } catch (err) {
      setError(readMessage(err, "Could not update timezone."));
    } finally {
      setTimezoneSaving(false);
    }
  };

  const submitDeleteRequest = async (): Promise<void> => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setError("Type DELETE to continue.");
      return;
    }

    setError("");
    try {
      await onRequestDeleteAccount();
      setDeleteOpen(false);
      setDeleteConfirmText("");
    } catch (err) {
      setError(readMessage(err, "Could not start account deletion."));
    }
  };

  return (
    <section className="stack-lg">
      <NeonCard title="My Profile" subtitle="Your signed-in account details">
        <div className="profile-card">
          <div className="profile-avatar">{initials || "U"}</div>
          <div className="profile-meta">
            <strong>{displayName}</strong>
            <small>{currentUserProfile.email || "No email"}</small>
            <small>{currentUserProfile.phone || "No phone added"}</small>
            <small>Role: {member.role}</small>
            <div className="profile-timezone-row">
              <small>Timezone: {workspaceTimezone}</small>
              {canEditTimezone && (
                <button
                  className="text-btn profile-edit-btn"
                  type="button"
                  onClick={() => {
                    setTimezoneValue(workspaceTimezone);
                    setTimezoneEditOpen((prev) => !prev);
                  }}
                >
                  {timezoneEditOpen ? "Close" : "Edit"}
                </button>
              )}
            </div>
          </div>
        </div>
        {canEditTimezone && timezoneEditOpen && (
          <div className="stack profile-timezone">
            <label htmlFor="workspace-timezone">Workspace timezone</label>
            <select
              id="workspace-timezone"
              value={timezoneValue}
              onChange={(event) => setTimezoneValue(event.target.value)}
            >
              {timezoneWithOffset.map((item) => (
                <option key={item.zone} value={item.zone}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="inline-actions">
              <button className="secondary-btn" type="button" onClick={saveTimezone} disabled={timezoneSaving}>
                {timezoneSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  setTimezoneValue(workspaceTimezone);
                  setTimezoneEditOpen(false);
                }}
                disabled={timezoneSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className={`danger-zone ${deleteOpen ? "danger-zone-open" : ""}`.trim()}>
          {!deleteOpen ? (
            <div className="danger-zone-collapsed">
              <small>Need to close this account?</small>
              <button className="danger-link-btn" type="button" onClick={() => setDeleteOpen(true)}>
                Delete account
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="danger-zone-head">
                <strong>Delete Account</strong>
                <small>This action removes your access from workspaces. Archived records are retained for audit.</small>
              </div>
              <small className="danger-text">
                Are you sure you want to delete your account? You will lose app access and will need to register again.
              </small>
              <small className="danger-text">A confirmation link will be sent to your registered email.</small>
              <label htmlFor="delete-confirm-input">Type DELETE to confirm</label>
              <input
                id="delete-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
              />
              <div className="inline-actions">
                <button className="danger-btn danger-btn-compact" type="button" onClick={submitDeleteRequest} disabled={deletingAccount}>
                  {deletingAccount ? "Sending link..." : "Send Confirmation Link"}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmText("");
                  }}
                  disabled={deletingAccount}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
            <div className="access-alert">
              <strong>Security-sensitive area</strong>
              <small>Grant only to verified staff accounts. User must already be registered.</small>
            </div>

            <div className="grant-grid">
              <div className="control-block control-block-contact">
                <label>Contact method</label>
                <small className="muted">How you identify the user account</small>
                <div className="method-row">
                  <button
                    type="button"
                    className={`method-btn ${contactType === "email" ? "method-btn-active" : ""}`.trim()}
                    onClick={() => setContactType("email")}
                  >
                    @ Email
                  </button>
                  <button
                    type="button"
                    className={`method-btn ${contactType === "phone" ? "method-btn-active" : ""}`.trim()}
                    onClick={() => setContactType("phone")}
                  >
                    # Mobile
                  </button>
                </div>
              </div>

              <div className="control-block control-block-role">
                <label>Role</label>
                <small className="muted">Permission level for this member</small>
                <div className="role-row">
                  <button
                    type="button"
                    className={`role-btn role-btn-editor ${role === "editor" ? "role-btn-active" : ""}`.trim()}
                    onClick={() => setRole("editor")}
                  >
                    Editor
                    <span>Limited operations</span>
                  </button>
                  <button
                    type="button"
                    className={`role-btn role-btn-admin ${role === "admin" ? "role-btn-active" : ""}`.trim()}
                    onClick={() => setRole("admin")}
                  >
                    Admin
                    <span>Full control</span>
                  </button>
                </div>
              </div>
            </div>

            <label htmlFor="grant-contact">{contactType === "email" ? "Email" : "Mobile number"}</label>
            <input
              id="grant-contact"
              type={contactType === "email" ? "email" : "tel"}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={contactType === "email" ? "user@example.com" : "+1XXXXXXXXXX"}
              required
            />

            <div className="type-selection-note">
              Selected role:
              <span className={`category-type-badge ${role === "admin" ? "category-type-expense" : "category-type-income"}`.trim()}>
                {role === "admin" ? "Admin" : "Editor"}
              </span>
            </div>
            <small className="muted">
              {role === "admin"
                ? "Admin can manage users, categories, and direct deletes."
                : "Editor can add entries. Extra permissions can be enabled below."}
            </small>

            {role === "editor" && (
              <div className="permission-block">
                <p className="muted">Editor permissions</p>
                <label className="switch-row switch-row-action" htmlFor="allow-delete">
                  <input
                    className="toggle-input"
                    id="allow-delete"
                    type="checkbox"
                    checked={allowDeleteForEditor}
                    onChange={(event) => setAllowDeleteForEditor(event.target.checked)}
                  />
                  Allow this editor to delete entries
                </label>

                <label className="switch-row switch-row-action" htmlFor="allow-manage-categories">
                  <input
                    className="toggle-input"
                    id="allow-manage-categories"
                    type="checkbox"
                    checked={allowManageCategoriesForEditor}
                    onChange={(event) => setAllowManageCategoriesForEditor(event.target.checked)}
                  />
                  Allow this editor to manage categories
                </label>
              </div>
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
                    <div className="member-badges">
                      <span className={`category-type-badge ${item.role === "admin" ? "category-type-expense" : "category-type-income"}`.trim()}>
                        {item.role === "admin" ? "Admin" : "Editor"}
                      </span>
                      {item.can_delete_entries && <span className="category-type-badge category-type-expense">Can delete</span>}
                      {item.can_manage_categories && <span className="category-type-badge category-type-income">Manage categories</span>}
                    </div>
                  </div>

                  <div className="inline-actions member-toggle-grid">
                    {!isSelf && (
                      <label className="switch-row switch-row-action" htmlFor={`toggle-admin-${item.user_id}`}>
                        <input
                          className="toggle-input"
                          id={`toggle-admin-${item.user_id}`}
                          type="checkbox"
                          checked={item.role === "admin"}
                          disabled={busy}
                          onChange={(event) => {
                            const nextRole: AppRole = event.target.checked ? "admin" : "editor";
                            const nextDelete = nextRole === "admin" ? true : false;
                            const nextManageCategories = nextRole === "admin" ? true : false;
                            void updateRole(item.user_id, nextRole, nextDelete, nextManageCategories);
                          }}
                        />
                        Admin access
                      </label>
                    )}

                    {!isSelf && item.role === "editor" && (
                      <label className="switch-row switch-row-action" htmlFor={`toggle-delete-${item.user_id}`}>
                        <input
                          className="toggle-input"
                          id={`toggle-delete-${item.user_id}`}
                          type="checkbox"
                          checked={item.can_delete_entries}
                          disabled={busy}
                          onChange={(event) => {
                            void updateRole(item.user_id, "editor", event.target.checked, item.can_manage_categories);
                          }}
                        />
                        Delete entries
                      </label>
                    )}

                    {!isSelf && item.role === "editor" && (
                      <label className="switch-row switch-row-action" htmlFor={`toggle-manage-categories-${item.user_id}`}>
                        <input
                          className="toggle-input"
                          id={`toggle-manage-categories-${item.user_id}`}
                          type="checkbox"
                          checked={item.can_manage_categories}
                          disabled={busy}
                          onChange={(event) => {
                            void updateRole(item.user_id, "editor", item.can_delete_entries, event.target.checked);
                          }}
                        />
                        Manage categories
                      </label>
                    )}

                    {!isSelf && (
                      <label className="switch-row switch-row-action" htmlFor={`toggle-access-${item.user_id}`}>
                        <input
                          className="toggle-input"
                          id={`toggle-access-${item.user_id}`}
                          type="checkbox"
                          checked
                          disabled={busy}
                          onChange={(event) => {
                            if (!event.target.checked) {
                              void revoke(item.user_id);
                            }
                          }}
                        />
                        Workspace access
                      </label>
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
