import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingPanel } from "@/components/common/LoadingPanel";
import { NumericPad } from "@/components/common/NumericPad";
import { NeonCard } from "@/components/common/NeonCard";
import { AppShell, type AppTab } from "@/components/layout/AppShell";
import { FabBar } from "@/components/layout/FabBar";
import { detectCountryPreference } from "@/data/countries";
import type { SignUpInput } from "@/hooks/useAuthSession";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatCurrency, timeInTimeZoneHHmm, todayIsoDate, zonedDateTimeToIso } from "@/lib/format";
import { enqueueEntry, flushQueue, queueSize } from "@/lib/offlineQueue";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { AuthPage } from "@/pages/AuthPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ProfileSetupPage } from "@/pages/ProfileSetupPage";
import { TeamPage } from "@/pages/TeamPage";
import { generateAICategories } from "@/services/aiCategories";
import { addAICategories, addManualCategory, archiveCategory, listCategories, seedIndustryCategories } from "@/services/categories";
import { listPendingDeleteRequests, requestDelete, reviewDeleteRequest } from "@/services/deleteRequests";
import { addEntry, countActiveEntries, deleteEntryDirect, listEntries } from "@/services/entries";
import {
  grantMemberAccessByContact,
  listWorkspaceMembers,
  revokeWorkspaceMember,
  updateWorkspaceMemberRole
} from "@/services/members";
import { getMyProfile, saveMyProfile } from "@/services/profile";
import { uploadReceipt } from "@/services/storage";
import { createWorkspaceWithOwner, getWorkspaceContext, listUserWorkspaces, updateWorkspaceTimezone } from "@/services/workspace";
import type {
  AppRole,
  CashDirection,
  Category,
  DeleteRequest,
  Entry,
  WorkspaceContext,
  WorkspaceMemberDirectory
} from "@/types/domain";

const localeDefaultCurrency = detectCountryPreference().currency;
const defaultCurrency = (import.meta.env.VITE_DEFAULT_CURRENCY || localeDefaultCurrency || "USD").toUpperCase();
const LAST_WORKSPACE_KEY = "cashbook:last-workspace-id";

function readError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Something went wrong";
}

function inferCategoryId(categories: Category[], direction: CashDirection): string {
  const type = direction === "cash_in" ? "income" : "expense";
  return categories.find((category) => category.type === type)?.id ?? "";
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

export default function App(): JSX.Element {
  const online = useOnlineStatus();
  const {
    session,
    loading: authLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut
  } = useAuthSession();

  const [loading, setLoading] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [profileNameSeed, setProfileNameSeed] = useState("");
  const [profilePhoneSeed, setProfilePhoneSeed] = useState("");
  const [onboardingCurrency, setOnboardingCurrency] = useState(defaultCurrency);

  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pendingDeleteRequests, setPendingDeleteRequests] = useState<DeleteRequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDirectory[]>([]);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [message, setMessage] = useState<string>("");
  const [queueCount, setQueueCount] = useState<number>(queueSize());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDirection, setQuickDirection] = useState<CashDirection>("cash_out");
  const [quickAmount, setQuickAmount] = useState<string>("");
  const [quickCategoryId, setQuickCategoryId] = useState<string>("");
  const [quickRemarks, setQuickRemarks] = useState<string>("");
  const [quickDate, setQuickDate] = useState<string>(todayIsoDate());
  const [quickTime, setQuickTime] = useState<string>("00:00");
  const [quickReceiptFile, setQuickReceiptFile] = useState<File | null>(null);

  const userId = session?.user.id ?? "";
  const workspaceId = context?.workspace.id ?? "";

  const smartCategories = useMemo(() => {
    if (!categories.length) {
      return categories;
    }

    const usage = new Map<string, { count: number; lastUsed: number }>();
    entries.forEach((entry) => {
      const current = usage.get(entry.category_id) ?? { count: 0, lastUsed: 0 };
      const entryTime = new Date(entry.entry_at).getTime();
      usage.set(entry.category_id, {
        count: current.count + 1,
        lastUsed: Math.max(current.lastUsed, entryTime)
      });
    });

    return [...categories].sort((a, b) => {
      const aUsage = usage.get(a.id) ?? { count: 0, lastUsed: 0 };
      const bUsage = usage.get(b.id) ?? { count: 0, lastUsed: 0 };

      if (aUsage.count !== bUsage.count) {
        return bUsage.count - aUsage.count;
      }
      if (aUsage.lastUsed !== bUsage.lastUsed) {
        return bUsage.lastUsed - aUsage.lastUsed;
      }
      return a.name.localeCompare(b.name);
    });
  }, [categories, entries]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((item) => {
      const label = item.full_name || item.email || item.phone || item.user_id;
      map.set(item.user_id, label);
    });
    return map;
  }, [teamMembers]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  const notify = (text: string): void => {
    setMessage(text);
  };

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };

    const onInstalled = () => {
      setInstallPromptEvent(null);
      notify("App installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const enableNotifications = async (): Promise<void> => {
    if (typeof Notification === "undefined") {
      notify("Notifications are not supported on this browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        notify("Notifications enabled");
      } else {
        notify("Notification permission was not granted");
      }
    } catch {
      notify("Could not enable notifications");
    }
  };

  const installApp = async (): Promise<void> => {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (installPromptEvent && typeof installPromptEvent.prompt === "function") {
      installPromptEvent.prompt();
      try {
        await installPromptEvent.userChoice;
      } catch {
        // no-op
      }
      return;
    }

    if (isIos) {
      notify("On Safari: tap Share, then Add to Home Screen.");
      return;
    }

    notify("Use browser menu and choose Install app / Add to Home screen.");
  };

  const showEntrySystemNotification = useCallback(
    async (entry: { id: string; direction: CashDirection; amount: number; category_id: string; created_by: string }) => {
      if (typeof Notification === "undefined" || !context) {
        return;
      }

      if (notificationPermission !== "granted") {
        return;
      }

      const actor =
        entry.created_by === userId
          ? "You"
          : memberNameById.get(entry.created_by) || "A team member";
      const side = entry.direction === "cash_in" ? "Cash In" : "Cash Out";
      const categoryName = categories.find((item) => item.id === entry.category_id)?.name ?? "Unknown category";
      const amountText = formatCurrency(entry.amount, context.workspace.currency);

      new Notification("Cashbook Entry Alert", {
        body: `${actor} added ${side} ${amountText} in ${categoryName}.`,
        tag: `entry-${entry.id}`
      });
    },
    [context, userId, memberNameById, categories, notificationPermission]
  );

  const showEntryInAppAlert = useCallback(
    (entry: { direction: CashDirection; amount: number; category_id: string; created_by: string }) => {
      if (!context) {
        return;
      }

      const actor =
        entry.created_by === userId
          ? "You"
          : memberNameById.get(entry.created_by) || "A team member";
      const side = entry.direction === "cash_in" ? "Cash In" : "Cash Out";
      const categoryName = categories.find((item) => item.id === entry.category_id)?.name ?? "Unknown category";
      const amountText = formatCurrency(entry.amount, context.workspace.currency);

      notify(`${actor} added ${side} ${amountText} in ${categoryName}`);

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(120);
      }
    },
    [context, userId, memberNameById, categories]
  );

  const loadWorkspace = useCallback(async (workspaceId: string, currentUserId: string) => {
    const workspaceContext = await getWorkspaceContext(workspaceId, currentUserId);

    const [categoryRows, entryRows] = await Promise.all([listCategories(workspaceId), listEntries(workspaceId)]);

    let deleteRows: DeleteRequest[] = [];
    if (workspaceContext.member.role === "admin" || workspaceContext.member.can_delete_entries) {
      deleteRows = await listPendingDeleteRequests(workspaceId);
    }

    let memberRows: WorkspaceMemberDirectory[] = [];
    if (workspaceContext.member.role === "admin" || workspaceContext.member.can_manage_users) {
      try {
        memberRows = await listWorkspaceMembers(workspaceId);
      } catch {
        memberRows = [];
      }
    }

    setContext(workspaceContext);
    setCategories(categoryRows);
    setEntries(entryRows);
    setPendingDeleteRequests(deleteRows);
    setTeamMembers(memberRows);
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  }, []);

  const bootstrapWorkspace = useCallback(
    async (uid: string) => {
      const workspaces = await listUserWorkspaces(uid);
      if (!workspaces.length) {
        setContext(null);
        setCategories([]);
        setEntries([]);
        setPendingDeleteRequests([]);
        setTeamMembers([]);
        return;
      }

      const savedWorkspaceId = window.localStorage.getItem(LAST_WORKSPACE_KEY) ?? "";
      const savedWorkspace = workspaces.find((item) => item.workspace.id === savedWorkspaceId);
      if (savedWorkspace) {
        await loadWorkspace(savedWorkspace.workspace.id, uid);
        return;
      }

      const ranked = await Promise.all(
        workspaces.map(async (item) => {
          try {
            const count = await countActiveEntries(item.workspace.id);
            return { workspaceId: item.workspace.id, count };
          } catch {
            return { workspaceId: item.workspace.id, count: 0 };
          }
        })
      );
      ranked.sort((a, b) => b.count - a.count);
      const fallbackWorkspaceId = ranked[0]?.workspaceId ?? workspaces[0].workspace.id;
      await loadWorkspace(fallbackWorkspaceId, uid);
    },
    [loadWorkspace]
  );

  useEffect(() => {
    if (!userId) {
      setNeedsProfileSetup(false);
      setProfileNameSeed("");
      setProfilePhoneSeed("");
      setOnboardingCurrency(defaultCurrency);
      setContext(null);
      setCategories([]);
      setEntries([]);
      setPendingDeleteRequests([]);
      setTeamMembers([]);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const profile = await getMyProfile();
        const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;

        const fullName = (profile?.full_name ?? readMetaString(metadata, "full_name")).trim();
        const phone = (profile?.phone ?? readMetaString(metadata, "phone")).trim();
        const metaCurrency = readMetaString(metadata, "currency").toUpperCase();

        setProfileNameSeed(fullName);
        setProfilePhoneSeed(phone);
        setOnboardingCurrency(metaCurrency || defaultCurrency);

        if (!fullName || !phone) {
          setNeedsProfileSetup(true);
          setContext(null);
          setCategories([]);
          setEntries([]);
          setPendingDeleteRequests([]);
          setTeamMembers([]);
          return;
        }

        setNeedsProfileSetup(false);
        await bootstrapWorkspace(userId);
      } catch (error) {
        notify(readError(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, session, bootstrapWorkspace]);

  useEffect(() => {
    if (!online || !workspaceId || !userId) {
      return;
    }

    const pending = queueSize();
    setQueueCount(pending);
    if (pending === 0) {
      return;
    }

    let cancelled = false;
    flushQueue({
      addEntry: async (payload) => {
        await addEntry(payload);
      }
    })
      .then(async () => {
        if (cancelled) {
          return;
        }
        setQueueCount(queueSize());
        await loadWorkspace(workspaceId, userId);
      })
      .catch(() => {
        if (!cancelled) {
          setQueueCount(queueSize());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [online, workspaceId, userId, loadWorkspace]);

  useEffect(() => {
    const sb = supabase;
    if (!workspaceId || !sb || !userId) {
      return;
    }

    const channel = (sb
      .channel(`workspace-live-${workspaceId}`) as any)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entries",
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload: {
          eventType: string;
          new: {
            id: string;
            direction: CashDirection;
            amount: number;
            category_id: string;
            created_by: string;
          };
        }) => {
          if (payload.eventType === "INSERT" && payload.new) {
            showEntryInAppAlert(payload.new);
            void showEntrySystemNotification(payload.new);
          }
          void loadWorkspace(workspaceId, userId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delete_requests",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => {
          void loadWorkspace(workspaceId, userId);
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [workspaceId, userId, loadWorkspace, showEntrySystemNotification, showEntryInAppAlert]);

  const openQuickAdd = (direction: CashDirection) => {
    setQuickDirection(direction);
    setQuickCategoryId(inferCategoryId(smartCategories, direction));
    setQuickAmount("");
    setQuickRemarks("");
    setQuickDate(todayIsoDate());
    setQuickTime(timeInTimeZoneHHmm(context?.workspace.timezone ?? "UTC"));
    setQuickReceiptFile(null);
    setQuickOpen(true);
  };

  const saveQuickEntry = async (): Promise<void> => {
    if (!context || !userId || !quickCategoryId) {
      notify("Select a category first");
      return;
    }

    const amount = Number(quickAmount);
    if (!amount || amount <= 0) {
      notify("Enter a valid amount");
      return;
    }

    if (quickReceiptFile && !online) {
      notify("Receipt upload needs internet connection");
      return;
    }

    let receiptUrl: string | undefined;
    if (quickReceiptFile) {
      receiptUrl = await uploadReceipt(context.workspace.id, userId, quickReceiptFile);
    }

    const payload = {
      workspace_id: context.workspace.id,
      direction: quickDirection,
      amount,
      category_id: quickCategoryId,
      remarks: quickRemarks,
      receipt_url: receiptUrl,
      created_by: userId,
      entry_at: zonedDateTimeToIso(quickDate, quickTime, context.workspace.timezone)
    };

    try {
      if (online) {
        const created = await addEntry(payload);
        setEntries((prev) => [created, ...prev]);
        notify("Entry saved");
      } else {
        enqueueEntry(payload);
        setQueueCount(queueSize());
        setEntries((prev) => [
          {
            id: `offline-${Date.now()}`,
            workspace_id: payload.workspace_id,
            direction: payload.direction,
            amount: payload.amount,
            category_id: payload.category_id,
            remarks: payload.remarks,
            receipt_url: null,
            entry_at: payload.entry_at,
            created_by: payload.created_by,
            status: "active",
            created_at: new Date().toISOString()
          },
          ...prev
        ]);
        notify("Saved offline and queued");
      }

      setQuickOpen(false);
    } catch (error) {
      notify(readError(error));
    }
  };

  const deleteEntry = async (entry: Entry): Promise<void> => {
    if (!context || !userId) {
      return;
    }

    try {
      const canDelete = context.member.role === "admin" || context.member.can_delete_entries;
      if (canDelete) {
        await deleteEntryDirect(context.workspace.id, entry.id, userId);
        setEntries((prev) => prev.filter((item) => item.id !== entry.id));
        notify("Entry deleted");
        return;
      }

      const reason = window.prompt("Reason for deletion request", "Wrong amount");
      if (!reason || !reason.trim()) {
        return;
      }

      await requestDelete(context.workspace.id, entry.id, userId, reason.trim());
      notify("Delete request sent to admin");
    } catch (error) {
      notify(readError(error));
    }
  };

  const reviewDelete = async (requestId: string, approved: boolean): Promise<void> => {
    if (!context || !userId) {
      return;
    }

    try {
      await reviewDeleteRequest(requestId, approved ? "approved" : "rejected", approved ? "Approved" : "Rejected");
      await loadWorkspace(context.workspace.id, userId);
      notify(approved ? "Delete request approved" : "Delete request rejected");
    } catch (error) {
      notify(readError(error));
    }
  };

  const grantAccess = async (
    contact: string,
    role: AppRole,
    allowDeleteForEditor: boolean,
    allowManageCategoriesForEditor: boolean
  ): Promise<void> => {
    if (!workspaceId) {
      return;
    }

    const targetUserId = await grantMemberAccessByContact(workspaceId, contact, role, allowDeleteForEditor);
    if (role === "editor") {
      await updateWorkspaceMemberRole(
        workspaceId,
        targetUserId,
        "editor",
        allowDeleteForEditor,
        allowManageCategoriesForEditor
      );
    }
    const refreshed = await listWorkspaceMembers(workspaceId);
    setTeamMembers(refreshed);
    notify("Access granted");
  };

  const updateMemberRole = async (
    targetUserId: string,
    role: AppRole,
    allowDeleteForEditor: boolean,
    allowManageCategoriesForEditor: boolean
  ): Promise<void> => {
    if (!workspaceId) {
      return;
    }

    await updateWorkspaceMemberRole(
      workspaceId,
      targetUserId,
      role,
      allowDeleteForEditor,
      allowManageCategoriesForEditor
    );
    const refreshed = await listWorkspaceMembers(workspaceId);
    setTeamMembers(refreshed);
    notify("Access updated");
  };

  const revokeAccess = async (targetUserId: string): Promise<void> => {
    if (!workspaceId) {
      return;
    }

    await revokeWorkspaceMember(workspaceId, targetUserId);
    const refreshed = await listWorkspaceMembers(workspaceId);
    setTeamMembers(refreshed);
    notify("Access revoked");
  };

  const createCategory = async (name: string, type: "income" | "expense"): Promise<void> => {
    if (!workspaceId || !userId) {
      return;
    }

    await addManualCategory(workspaceId, userId, name, type);
    const refreshed = await listCategories(workspaceId);
    setCategories(refreshed);
    notify("Category added");
  };

  const dropCategory = async (categoryId: string): Promise<void> => {
    if (!workspaceId) {
      return;
    }

    await archiveCategory(workspaceId, categoryId);
    const refreshed = await listCategories(workspaceId);
    setCategories(refreshed);
    notify("Category dropped");
  };

  const saveWorkspaceTimezone = async (timezone: string): Promise<void> => {
    if (!workspaceId || !userId) {
      return;
    }
    await updateWorkspaceTimezone(workspaceId, timezone);
    await loadWorkspace(workspaceId, userId);
    notify("Timezone updated");
  };

  const createWorkspace = async (
    input: { name: string; industry: string; timezone: string; currency: string },
    aiNames: string[]
  ) => {
    if (!userId) {
      return;
    }

    setLoading(true);
    try {
      const createdWorkspaceId = await createWorkspaceWithOwner(input);
      await seedIndustryCategories(createdWorkspaceId, input.industry, userId);
      await addAICategories(createdWorkspaceId, aiNames, userId, "expense");
      await loadWorkspace(createdWorkspaceId, userId);
      notify("Workspace ready");
    } catch (error) {
      notify(readError(error));
    } finally {
      setLoading(false);
    }
  };

  const completeProfile = async (input: {
    fullName: string;
    phone: string;
    country: string;
    currency: string;
  }): Promise<void> => {
    if (!userId) {
      return;
    }

    setLoading(true);
    try {
      await saveMyProfile(input);
      setNeedsProfileSetup(false);
      setProfileNameSeed(input.fullName);
      setProfilePhoneSeed(input.phone);
      setOnboardingCurrency(input.currency.toUpperCase());
      await bootstrapWorkspace(userId);
      notify("Profile saved");
    } catch (error) {
      notify(readError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (email: string, password: string): Promise<void> => {
    await signInWithEmail(email, password);
  };

  const handleSignUp = async (input: SignUpInput): Promise<void> => {
    await signUpWithEmail(input);
  };

  const handleGoogle = async (): Promise<void> => {
    await signInWithGoogle();
  };

  const startVoice = (): void => {
    type SpeechWindow = Window & {
      webkitSpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      };
      SpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      };
    };

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Voice input not available on this browser");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuickRemarks((prev) => `${prev} ${transcript}`.trim());
    };
    recognition.start();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      notify("Signed out");
    } catch (error) {
      notify(readError(error));
    }
  };

  const addCategories = useMemo(() => {
    return smartCategories.filter((category) =>
      quickDirection === "cash_in" ? category.type === "income" : category.type === "expense"
    );
  }, [smartCategories, quickDirection]);

  if (!hasSupabaseConfig) {
    return (
      <div className="center-layout">
        <NeonCard title="Setup Required" subtitle="Add Supabase environment variables before running the app.">
          <p>
            Create a <code>.env</code> file using <code>.env.example</code> and set <code>VITE_SUPABASE_URL</code> and
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </NeonCard>
      </div>
    );
  }

  if (authLoading || loading) {
    return <LoadingPanel label="Booting your workspace..." />;
  }

  if (!session) {
    return <AuthPage onSignIn={handleSignIn} onSignUp={handleSignUp} onGoogle={handleGoogle} />;
  }

  if (needsProfileSetup) {
    return <ProfileSetupPage defaultName={profileNameSeed} loading={loading} onSave={completeProfile} />;
  }

  if (!context) {
    return (
      <OnboardingPage
        defaultCurrency={onboardingCurrency}
        loading={loading}
        onGenerateAICategories={generateAICategories}
        onCreateWorkspace={createWorkspace}
      />
    );
  }

  return (
    <>
      <AppShell
        title={context.workspace.name}
        subtitle={`${context.workspace.industry} | ${context.member.role.toUpperCase()}`}
        tab={tab}
        onTabChange={setTab}
        onSignOut={handleSignOut}
        onEnableNotifications={enableNotifications}
        onInstallApp={installApp}
        notificationSupported={typeof Notification !== "undefined"}
        notificationPermission={notificationPermission}
        installAvailable={Boolean(installPromptEvent) || /iPhone|iPad|iPod/i.test(navigator.userAgent)}
        online={online}
        queueCount={queueCount}
      >
        {tab === "dashboard" && (
          <DashboardPage
            workspace={context.workspace}
            member={context.member}
            categories={smartCategories}
            entries={entries}
            pendingDeleteRequests={pendingDeleteRequests}
            onOpenQuickAdd={() => openQuickAdd("cash_out")}
            onDeleteEntry={deleteEntry}
            onReviewDeleteRequest={reviewDelete}
          />
        )}

        {tab === "history" && (
          <HistoryPage
            workspaceName={context.workspace.name}
            currency={context.workspace.currency}
            timezone={context.workspace.timezone}
            member={context.member}
            categories={smartCategories}
            entries={entries}
            onAddCategory={createCategory}
            onDropCategory={dropCategory}
          />
        )}

        {tab === "team" && (
          <TeamPage
            member={context.member}
            workspaceTimezone={context.workspace.timezone}
            members={teamMembers}
            currentUserId={userId}
            currentUserProfile={{
              fullName: profileNameSeed,
              email: session.user.email ?? "",
              phone: profilePhoneSeed
            }}
            onGrantAccess={grantAccess}
            onUpdateMember={updateMemberRole}
            onRevokeMember={revokeAccess}
            onUpdateTimezone={saveWorkspaceTimezone}
          />
        )}
      </AppShell>

      {quickOpen && (
        <div className="modal-backdrop">
          <div className="quick-modal">
            <h3>{quickDirection === "cash_in" ? "Cash In" : "Cash Out"}</h3>
            <p className="muted">Custom keypad input</p>

            <div className="amount-display">{formatCurrency(Number(quickAmount || "0"), context.workspace.currency)}</div>

            <NumericPad value={quickAmount} onChange={setQuickAmount} />

            <label htmlFor="quick-category">Category</label>
            <div className="category-strip" id="quick-category">
              {addCategories.map((category) => (
                <button
                  key={category.id}
                  className={`chip ${quickCategoryId === category.id ? "chip-active" : ""}`.trim()}
                  onClick={() => setQuickCategoryId(category.id)}
                >
                  {category.icon ?? "•"} {category.name}
                </button>
              ))}
            </div>

            <label htmlFor="quick-date">Date</label>
            <input id="quick-date" type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} />

            <label htmlFor="quick-time">Time</label>
            <input id="quick-time" type="time" value={quickTime} onChange={(event) => setQuickTime(event.target.value)} />

            <label htmlFor="quick-remarks">Remarks</label>
            <textarea
              id="quick-remarks"
              value={quickRemarks}
              onChange={(event) => setQuickRemarks(event.target.value)}
              placeholder="Optional note"
            />

            <label htmlFor="quick-receipt">Receipt Photo</label>
            <input
              id="quick-receipt"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setQuickReceiptFile(event.target.files?.[0] ?? null)}
            />
            {quickReceiptFile && <small>{quickReceiptFile.name}</small>}

            <div className="inline-actions">
              <button className="secondary-btn" onClick={startVoice}>
                Voice
              </button>
              <button className="ghost-btn" onClick={() => setQuickOpen(false)}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveQuickEntry}>
                Swipe Up to Save
              </button>
            </div>
          </div>
        </div>
      )}

      {!quickOpen && <FabBar onPick={(direction) => openQuickAdd(direction)} />}

      {message && <div className="toast">{message}</div>}
    </>
  );
}
