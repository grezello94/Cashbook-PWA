import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { LoadingPanel } from "@/components/common/LoadingPanel";
import { NeonCard } from "@/components/common/NeonCard";
import { AppShell, type AppTab } from "@/components/layout/AppShell";
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
import { InviteInboxPage } from "@/pages/InviteInboxPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ProfileSetupPage } from "@/pages/ProfileSetupPage";
import { TeamPage } from "@/pages/TeamPage";
import { generateAICategories } from "@/services/aiCategories";
import type { AICategorySuggestion } from "@/services/aiCategories";
import { confirmAccountDeletion, requestAccountDeletion } from "@/services/accountDeletion";
import { addAICategories, addManualCategory, archiveCategory, listCategories, seedIndustryCategories } from "@/services/categories";
import { listPendingDeleteRequests, requestDelete, reviewDeleteRequest } from "@/services/deleteRequests";
import { addEntry, deleteEntryDirect, listEntries } from "@/services/entries";
import {
  grantMemberAccessByContact,
  listMyWorkspaceAccessRequests,
  listWorkspaceMembers,
  respondWorkspaceAccessRequest,
  revokeWorkspaceMember,
  setWorkspaceMemberAccessDisabled,
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
  WorkspaceAccessRequest,
  WorkspaceContext,
  WorkspaceMemberDirectory
} from "@/types/domain";

const localeDefaultCurrency = detectCountryPreference().currency;
const defaultCurrency = (import.meta.env.VITE_DEFAULT_CURRENCY || localeDefaultCurrency || "USD").toUpperCase();
const LAST_WORKSPACE_KEY = "cashbook:last-workspace-id";
const WELCOME_PENDING_EMAIL_KEY = "cashbook:welcome-pending-email";
const WELCOME_SHOWN_USER_KEY_PREFIX = "cashbook:welcome-shown:";
type WorkspaceEntryMode = "decide" | "join" | "create";

function lastWorkspaceKeyForUser(userId: string): string {
  return `${LAST_WORKSPACE_KEY}:${userId}`;
}

function readError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Something went wrong";
}

function isWorkspaceAccessMissingError(error: unknown): boolean {
  const message = readError(error).toLowerCase();
  return (
    message.includes("pgrst116") ||
    message.includes("json object requested, multiple (or no) rows returned") ||
    message.includes("workspace not found") ||
    message.includes("no rows")
  );
}

function inferCategoryId(categories: Category[], direction: CashDirection): string {
  const type = direction === "cash_in" ? "income" : "expense";
  return categories.find((category) => category.type === type)?.id ?? "";
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

function sanitizeAmountInput(value: string): string {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (!fractionParts.length) {
    return whole;
  }
  const fraction = fractionParts.join("").slice(0, 2);
  return `${whole}.${fraction}`;
}

function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 0 && coarsePointer);
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
  const [teamLoadError, setTeamLoadError] = useState("");
  const [pendingAccessRequests, setPendingAccessRequests] = useState<WorkspaceAccessRequest[]>([]);
  const [respondingAccessRequestId, setRespondingAccessRequestId] = useState("");
  const [workspaceEntryMode, setWorkspaceEntryMode] = useState<WorkspaceEntryMode>("decide");
  const [temporaryAccessAvailable, setTemporaryAccessAvailable] = useState(true);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [message, setMessage] = useState<string>("");
  const [queueCount, setQueueCount] = useState<number>(queueSize());
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [syncIssue, setSyncIssue] = useState("");
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
  const [accountDeletionSending, setAccountDeletionSending] = useState(false);
  const [accountDeletionConfirming, setAccountDeletionConfirming] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [showAccessRevokedPrompt, setShowAccessRevokedPrompt] = useState(false);
  const [showJoinRequestPrompt, setShowJoinRequestPrompt] = useState(false);
  const syncRunningRef = useRef(false);
  const accountRestoreRef = useRef(false);
  const previousOnlineRef = useRef<boolean | null>(null);
  const lastUserIdRef = useRef<string>("");
  const quickAmountInputRef = useRef<HTMLInputElement | null>(null);
  const lastHapticAtRef = useRef(0);

  const userId = session?.user.id ?? "";
  const workspaceId = context?.workspace.id ?? "";
  const mobileInputHapticsEnabled = useMemo(() => isLikelyMobileDevice(), []);

  const triggerHaptic = useCallback(
    (pattern: number | number[] = 8) => {
      if (!mobileInputHapticsEnabled || typeof navigator === "undefined" || !("vibrate" in navigator)) {
        return;
      }

      const now = Date.now();
      if (now - lastHapticAtRef.current < 45) {
        return;
      }

      lastHapticAtRef.current = now;
      navigator.vibrate(pattern);
    },
    [mobileInputHapticsEnabled]
  );

  useEffect(() => {
    if (!mobileInputHapticsEnabled || typeof window === "undefined") {
      return;
    }

    const interactiveSelector =
      "button, [role='button'], a, .chip, .segment-btn, .google-btn, input[type='checkbox'], input[type='radio'], select";

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "touch") {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest(interactiveSelector)) {
        return;
      }
      triggerHaptic(8);
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [mobileInputHapticsEnabled, triggerHaptic]);

  const clearWorkspaceState = useCallback(() => {
    setContext(null);
    setCategories([]);
    setEntries([]);
    setPendingDeleteRequests([]);
    setTeamMembers([]);
    setTeamLoadError("");
    setRespondingAccessRequestId("");
    setTab("dashboard");
  }, []);

  useEffect(() => {
    if (lastUserIdRef.current === userId) {
      return;
    }

    lastUserIdRef.current = userId;
    clearWorkspaceState();
    setPendingAccessRequests([]);
    setRespondingAccessRequestId("");
    setWorkspaceEntryMode("decide");
    setProfileNameSeed("");
    setProfilePhoneSeed("");
    setShowAccessRevokedPrompt(false);
    setShowJoinRequestPrompt(false);
  }, [userId, clearWorkspaceState]);

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

  useEffect(() => {
    if (!session || accountDeletionConfirming) {
      return;
    }

    const url = new URL(window.location.href);
    const token = url.searchParams.get("account_delete_token");
    if (!token) {
      return;
    }

    setAccountDeletionConfirming(true);
    (async () => {
      try {
        await confirmAccountDeletion(token);
        notify("Account deleted. Your data is archived and access has been removed.");
        await signOut();
      } catch (error) {
        notify(readError(error));
      } finally {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("account_delete_token");
        window.history.replaceState({}, "", cleanUrl.toString());
        setAccountDeletionConfirming(false);
      }
    })();
  }, [session, accountDeletionConfirming, signOut]);


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

      triggerHaptic(120);
    },
    [context, userId, memberNameById, categories, triggerHaptic]
  );

  const loadWorkspace = useCallback(async (workspaceId: string, currentUserId: string) => {
    const workspaceContext = await getWorkspaceContext(workspaceId, currentUserId);

    const [categoryRows, entryRows] = await Promise.all([listCategories(workspaceId), listEntries(workspaceId)]);

    const canReviewDeletes = workspaceContext.member.role === "admin" || workspaceContext.member.can_delete_entries;
    const canManageUsers = workspaceContext.member.role === "admin" || workspaceContext.member.can_manage_users;

    const deleteRowsPromise = canReviewDeletes ? listPendingDeleteRequests(workspaceId) : Promise.resolve<DeleteRequest[]>([]);
    const memberRowsPromise: Promise<{ rows: WorkspaceMemberDirectory[]; error: string }> = canManageUsers
      ? listWorkspaceMembers(workspaceId)
          .then((rows) => ({ rows, error: "" }))
          .catch((error) => ({ rows: [], error: readError(error) }))
      : Promise.resolve({ rows: [], error: "" });

    const [deleteRows, memberResult] = await Promise.all([deleteRowsPromise, memberRowsPromise]);

    setTeamLoadError(memberResult.error);
    setContext(workspaceContext);
    setCategories(categoryRows);
    setEntries(entryRows);
    setPendingDeleteRequests(deleteRows);
    setTeamMembers(memberResult.rows);
    window.localStorage.setItem(lastWorkspaceKeyForUser(currentUserId), workspaceId);
    window.localStorage.removeItem(LAST_WORKSPACE_KEY);
  }, []);

  const detectTemporaryAccessAvailability = useCallback(async () => {
    const sb = supabase;
    if (!sb) {
      setTemporaryAccessAvailable(false);
      return;
    }

    const { error } = await sb.from("workspace_members").select("access_disabled").limit(1);
    if (!error) {
      setTemporaryAccessAvailable(true);
      return;
    }

    const message = readError(error).toLowerCase();
    if (message.includes("access_disabled")) {
      setTemporaryAccessAvailable(false);
      return;
    }

    setTemporaryAccessAvailable(true);
  }, []);

  const refreshAccessRequests = useCallback(async (): Promise<WorkspaceAccessRequest[]> => {
    try {
      const requests = await listMyWorkspaceAccessRequests();
      setPendingAccessRequests(requests);
      return requests;
    } catch (error) {
      const message = readError(error).toLowerCase();
      if (message.includes("list_my_workspace_access_requests")) {
        // Backward compatibility if migrations are not applied yet.
        setPendingAccessRequests([]);
        return [];
      }
      throw error;
    }
  }, []);

  const openJoinWorkspace = async (): Promise<number> => {
    try {
      setWorkspaceEntryMode("join");
      const requests = await refreshAccessRequests();
      return requests.length;
    } catch (error) {
      notify(readError(error));
      throw error;
    }
  };

  const handleAccessRevoked = useCallback(
    async (reason: string) => {
      clearWorkspaceState();
      setWorkspaceEntryMode("decide");
      setShowJoinRequestPrompt(false);
      setShowAccessRevokedPrompt(true);
      setMessage(reason);
      try {
        await refreshAccessRequests();
      } catch {
        // If request fetch fails temporarily, the user can still proceed from decide screen.
      }
    },
    [clearWorkspaceState, refreshAccessRequests]
  );

  const bootstrapWorkspace = useCallback(
    async (uid: string) => {
      const scopedKey = lastWorkspaceKeyForUser(uid);
      const legacySavedWorkspaceId = window.localStorage.getItem(LAST_WORKSPACE_KEY) ?? "";
      const savedWorkspaceId = window.localStorage.getItem(scopedKey) ?? legacySavedWorkspaceId;
      if (savedWorkspaceId) {
        try {
          await loadWorkspace(savedWorkspaceId, uid);
          window.localStorage.setItem(scopedKey, savedWorkspaceId);
          if (legacySavedWorkspaceId) {
            window.localStorage.removeItem(LAST_WORKSPACE_KEY);
          }
          return;
        } catch (error) {
          if (!isWorkspaceAccessMissingError(error)) {
            throw error;
          }
        }
      }

      const workspaces = await listUserWorkspaces(uid);
      if (!workspaces.length) {
        clearWorkspaceState();
        setPendingAccessRequests([]);
        return;
      }

      const fallbackWorkspaceId = workspaces[0].workspace.id;
      await loadWorkspace(fallbackWorkspaceId, uid);
    },
    [loadWorkspace, clearWorkspaceState]
  );

  useEffect(() => {
    if (!userId) {
      setNeedsProfileSetup(false);
      setProfileNameSeed("");
      setProfilePhoneSeed("");
      setOnboardingCurrency(defaultCurrency);
      clearWorkspaceState();
      setPendingAccessRequests([]);
      setWorkspaceEntryMode("decide");
      setTemporaryAccessAvailable(true);
      setQueueCount(queueSize());
      setSyncingQueue(false);
      setSyncIssue("");
      setShowAccessRevokedPrompt(false);
      setShowJoinRequestPrompt(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const profile = await getMyProfile();
        const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;

        const metadataDeletedAt = readMetaString(metadata, "account_deleted_at");
        if (metadataDeletedAt && !accountRestoreRef.current) {
          accountRestoreRef.current = true;
          try {
            const sb = supabase;
            if (!sb) {
              throw new Error("Supabase is not configured");
            }

            const { error: clearMetaError } = await sb.auth.updateUser({
              data: {
                account_deleted_at: null,
                account_delete_token: null,
                account_delete_expires_at: null,
                account_delete_requested_at: null
              }
            });
            if (clearMetaError) {
              throw clearMetaError;
            }

            const { error: clearProfileFlagError } = await sb
              .from("profiles")
              .update({
                deleted_at: null,
                updated_at: new Date().toISOString()
              })
              .eq("id", userId);

            if (
              clearProfileFlagError &&
              !clearProfileFlagError.message.toLowerCase().includes("deleted_at")
            ) {
              throw clearProfileFlagError;
            }

            notify("Your account is active again. Continue setup to start fresh.");
          } catch (restoreError) {
            notify(readError(restoreError));
            await signOut();
            return;
          } finally {
            accountRestoreRef.current = false;
          }
        }

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
          setPendingAccessRequests([]);
          setRespondingAccessRequestId("");
          return;
        }

        setNeedsProfileSetup(false);
        await bootstrapWorkspace(userId);
        void refreshAccessRequests().catch(() => {
          // Non-blocking during boot for faster first paint.
        });
        void detectTemporaryAccessAvailability().catch(() => {
          // Optional capability check; do not block initial app load.
        });
      } catch (error) {
        notify(readError(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [
    userId,
    session,
    bootstrapWorkspace,
    refreshAccessRequests,
    detectTemporaryAccessAvailability,
    signOut,
    clearWorkspaceState
  ]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const normalizedEmail = (session.user.email ?? "").trim().toLowerCase();
    const pendingEmail = (window.localStorage.getItem(WELCOME_PENDING_EMAIL_KEY) ?? "").trim().toLowerCase();
    const shownKey = `${WELCOME_SHOWN_USER_KEY_PREFIX}${session.user.id}`;
    if (window.localStorage.getItem(shownKey) === "1") {
      if (pendingEmail && normalizedEmail && pendingEmail === normalizedEmail) {
        window.localStorage.removeItem(WELCOME_PENDING_EMAIL_KEY);
      }
      return;
    }

    const createdAtMs = Date.parse(session.user.created_at ?? "");
    const accountCreatedRecently = Number.isFinite(createdAtMs) && Date.now() - createdAtMs < 1000 * 60 * 60 * 24;
    const isPendingSignUp = Boolean(pendingEmail && normalizedEmail && pendingEmail === normalizedEmail);
    if (!isPendingSignUp && !accountCreatedRecently) {
      return;
    }

    const metadataName = readMetaString((session.user.user_metadata ?? {}) as Record<string, unknown>, "full_name").trim();
    setWelcomeName(metadataName || profileNameSeed || "there");
    setShowWelcome(true);
    window.localStorage.setItem(shownKey, "1");
    if (isPendingSignUp) {
      window.localStorage.removeItem(WELCOME_PENDING_EMAIL_KEY);
    }
  }, [session, profileNameSeed]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !userId) {
      return;
    }

    const channel = (sb
      .channel(`workspace-access-requests-${userId}`) as any)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_access_requests",
          filter: `target_user_id=eq.${userId}`
        },
        (payload: {
          eventType: string;
          new?: { status?: string };
        }) => {
          const nextStatus = payload.new?.status ?? "";
          void refreshAccessRequests();

          if (payload.eventType === "INSERT" && nextStatus === "pending") {
            if (workspaceId) {
              setShowJoinRequestPrompt(true);
            } else {
              setWorkspaceEntryMode("join");
            }
            setMessage("New workspace access request received.");
            triggerHaptic(120);
          }

          if (payload.eventType === "UPDATE" && nextStatus === "accepted") {
            void bootstrapWorkspace(userId);
          }
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [userId, workspaceId, refreshAccessRequests, bootstrapWorkspace, triggerHaptic]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !userId) {
      return;
    }

    const channel = (sb
      .channel(`workspace-members-self-${userId}`) as any)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_members",
          filter: `user_id=eq.${userId}`
        },
        (payload: {
          eventType: string;
          new?: { workspace_id?: string; access_disabled?: boolean };
          old?: { workspace_id?: string; access_disabled?: boolean };
        }) => {
          const affectedWorkspaceId = payload.new?.workspace_id ?? payload.old?.workspace_id ?? "";
          const accessDisabled = Boolean(payload.new?.access_disabled);
          const lostAccess = payload.eventType === "DELETE" || accessDisabled;

          if (lostAccess && affectedWorkspaceId && affectedWorkspaceId === workspaceId) {
            void handleAccessRevoked("Your access to this workspace was revoked. Choose how to continue.");
            return;
          }

          if (affectedWorkspaceId && affectedWorkspaceId === workspaceId) {
            void loadWorkspace(workspaceId, userId).catch((error) => {
              if (isWorkspaceAccessMissingError(error)) {
                void handleAccessRevoked("Your access to this workspace was revoked. Choose how to continue.");
                return;
              }
              setMessage(readError(error));
            });
            return;
          }

          void bootstrapWorkspace(userId).catch(() => {
            // No-op: next auth/data cycle will retry.
          });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [userId, workspaceId, loadWorkspace, bootstrapWorkspace, handleAccessRevoked]);

  useEffect(() => {
    if (!workspaceId || !userId) {
      return;
    }

    const previous = previousOnlineRef.current;
    previousOnlineRef.current = online;
    if (previous === null) {
      return;
    }

    if (!online) {
      notify("Offline mode: entries are saved on this device and will auto-sync when internet returns.");
      return;
    }

    if (!previous && online && queueSize() > 0) {
      notify("Back online. Syncing your offline entries now.");
    }
  }, [online, workspaceId, userId]);

  useEffect(() => {
    if (!online || !workspaceId || !userId) {
      setSyncingQueue(false);
      return;
    }

    let cancelled = false;
    const syncNow = async () => {
      if (syncRunningRef.current) {
        return;
      }

      const pendingBefore = queueSize();
      setQueueCount(pendingBefore);
      if (pendingBefore === 0) {
        setSyncIssue("");
        return;
      }

      syncRunningRef.current = true;
      setSyncingQueue(true);
      try {
        const result = await flushQueue({
          addEntry: async (payload) => {
            await addEntry(payload);
          }
        });
        if (cancelled) {
          return;
        }

        const pendingAfter = queueSize();
        setQueueCount(pendingAfter);
        if (result.failed > 0) {
          setSyncIssue("Some entries are still pending sync. They remain safely stored on this device.");
        } else {
          setSyncIssue("");
        }

        if (result.processed > 0) {
          await loadWorkspace(workspaceId, userId);
        }

        if (pendingBefore > 0 && pendingAfter === 0) {
          notify(`Sync complete: ${result.processed} offline entr${result.processed === 1 ? "y" : "ies"} uploaded.`);
        }
      } catch {
        if (!cancelled) {
          setQueueCount(queueSize());
          setSyncIssue("Sync paused due to network/server issue. Offline entries are still safe and retrying.");
        }
      } finally {
        syncRunningRef.current = false;
        if (!cancelled) {
          setSyncingQueue(false);
        }
      }
    };

    void syncNow();
    const timer = window.setInterval(() => {
      void syncNow();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

  useEffect(() => {
    if (!quickOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      const input = quickAmountInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }, 35);

    return () => window.clearTimeout(timer);
  }, [quickOpen, quickDirection]);

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

    await grantMemberAccessByContact(workspaceId, contact, role, allowDeleteForEditor, allowManageCategoriesForEditor);
    const refreshed = await listWorkspaceMembers(workspaceId);
    setTeamMembers(refreshed);
    notify("Access request sent. User must confirm before getting workspace access.");
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

  const setMemberTemporaryDisabled = async (targetUserId: string, disabled: boolean): Promise<void> => {
    if (!workspaceId) {
      return;
    }
    if (!temporaryAccessAvailable) {
      notify("Temporary disable is not enabled in your database yet. Use Revoke permanently for now.");
      return;
    }

    await setWorkspaceMemberAccessDisabled(workspaceId, targetUserId, disabled);
    const refreshed = await listWorkspaceMembers(workspaceId);
    setTeamMembers(refreshed);
    notify(disabled ? "Member access disabled temporarily." : "Member access restored.");
  };

  const respondAccessRequest = async (requestId: string, decision: "accept" | "reject"): Promise<void> => {
    if (!userId) {
      return;
    }

    setRespondingAccessRequestId(requestId);
    try {
      await respondWorkspaceAccessRequest(requestId, decision);
      await Promise.all([refreshAccessRequests(), bootstrapWorkspace(userId)]);
      if (decision === "accept") {
        setWorkspaceEntryMode("decide");
      }
      notify(decision === "accept" ? "Access request accepted." : "Access request rejected.");
    } catch (error) {
      notify(readError(error));
    } finally {
      setRespondingAccessRequestId("");
    }
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

  const sendAccountDeletionLink = async (): Promise<void> => {
    if (!session?.user.email) {
      notify("No registered email found for this account.");
      return;
    }
    setAccountDeletionSending(true);
    try {
      await requestAccountDeletion(session.user.email);
      notify("Deletion confirmation link sent to your registered email.");
    } catch (error) {
      notify(readError(error));
    } finally {
      setAccountDeletionSending(false);
    }
  };

  const createWorkspace = async (
    input: { name: string; industry: string; timezone: string; currency: string },
    aiSuggestions: AICategorySuggestion[]
  ) => {
    if (!userId) {
      return;
    }

    setLoading(true);
    try {
      const createdWorkspaceId = await createWorkspaceWithOwner(input);
      await seedIndustryCategories(createdWorkspaceId, input.industry, userId);
      await addAICategories(createdWorkspaceId, aiSuggestions, userId);
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
      await Promise.all([bootstrapWorkspace(userId), refreshAccessRequests(), detectTemporaryAccessAvailability()]);
      setWorkspaceEntryMode("decide");
      notify("Profile saved");
    } catch (error) {
      notify(readError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (email: string, password: string, staySignedIn: boolean): Promise<void> => {
    await signInWithEmail(email, password, staySignedIn);
  };

  const handleSignUp = async (input: SignUpInput, staySignedIn: boolean): Promise<void> => {
    await signUpWithEmail(input, staySignedIn);
    window.localStorage.setItem(WELCOME_PENDING_EMAIL_KEY, input.email.trim().toLowerCase());
  };

  const handleGoogle = async (emailHint: string | undefined, staySignedIn: boolean): Promise<void> => {
    await signInWithGoogle(emailHint, staySignedIn);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      notify("Signed out");
    } catch (error) {
      notify(readError(error));
    }
  };

  const openMyWorkspaceFromPrompt = async (): Promise<void> => {
    if (!userId) {
      return;
    }

    setShowAccessRevokedPrompt(false);
    setShowJoinRequestPrompt(false);
    setLoading(true);
    try {
      await bootstrapWorkspace(userId);
    } catch (error) {
      notify(readError(error));
    } finally {
      setLoading(false);
    }
  };

  const reviewJoinRequestsFromPrompt = async (): Promise<void> => {
    clearWorkspaceState();
    setShowAccessRevokedPrompt(false);
    setShowJoinRequestPrompt(false);
    setWorkspaceEntryMode("join");
    try {
      await refreshAccessRequests();
    } catch (error) {
      notify(readError(error));
    }
  };

  const addCategories = useMemo(() => {
    return smartCategories.filter((category) =>
      quickDirection === "cash_in" ? category.type === "income" : category.type === "expense"
    );
  }, [smartCategories, quickDirection]);

  const syncBanner = useMemo(() => {
    if (!context) {
      return "";
    }

    if (!online) {
      return "Offline mode: entries are saved securely on this device and will sync automatically when internet is back.";
    }

    if (queueCount > 0) {
      if (syncingQueue) {
        return `Sync in progress: ${queueCount} offline entr${queueCount === 1 ? "y" : "ies"} pending upload.`;
      }
      return syncIssue || `${queueCount} offline entr${queueCount === 1 ? "y is" : "ies are"} pending upload.`;
    }

    return "";
  }, [context, online, queueCount, syncingQueue, syncIssue]);

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
    if (workspaceEntryMode === "decide" || workspaceEntryMode === "join") {
      return (
        <InviteInboxPage
          mode={workspaceEntryMode === "join" ? "join" : "decide"}
          invites={pendingAccessRequests}
          respondingId={respondingAccessRequestId}
          onRespond={respondAccessRequest}
          onJoinWorkspace={openJoinWorkspace}
          onBackToDecide={() => setWorkspaceEntryMode("decide")}
          onCreateWorkspace={() => setWorkspaceEntryMode("create")}
        />
      );
    }

    return (
      <OnboardingPage
        defaultCurrency={onboardingCurrency}
        loading={loading}
        onGenerateAICategories={generateAICategories}
        onCreateWorkspace={createWorkspace}
        onBackToJoin={() => setWorkspaceEntryMode("decide")}
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
        syncBanner={syncBanner}
      >
        {tab === "dashboard" && (
          <DashboardPage
            workspace={context.workspace}
            member={context.member}
            categories={smartCategories}
            entries={entries}
            pendingDeleteRequests={pendingDeleteRequests}
            onOpenQuickAdd={openQuickAdd}
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
            teamLoadError={teamLoadError}
            currentUserId={userId}
            currentUserProfile={{
              fullName: profileNameSeed,
              email: session.user.email ?? "",
              phone: profilePhoneSeed
            }}
            onGrantAccess={grantAccess}
            onUpdateMember={updateMemberRole}
            onSetMemberAccessDisabled={setMemberTemporaryDisabled}
            temporaryAccessAvailable={temporaryAccessAvailable}
            onRevokeMember={revokeAccess}
            onUpdateTimezone={saveWorkspaceTimezone}
            onRequestDeleteAccount={sendAccountDeletionLink}
            deletingAccount={accountDeletionSending}
          />
        )}
      </AppShell>

      {quickOpen && (
        <div className="modal-backdrop">
          <div className="quick-modal">
            <h3>{quickDirection === "cash_in" ? "Cash In" : "Cash Out"}</h3>
            <p className="muted">Use your phone keyboard to enter amount</p>

            <div className="amount-display">{formatCurrency(Number(quickAmount || "0"), context.workspace.currency)}</div>

            <label htmlFor="quick-amount">Amount</label>
            <input
              ref={quickAmountInputRef}
              id="quick-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              pattern="[0-9]*[.]?[0-9]{0,2}"
              value={quickAmount}
              placeholder="0.00"
              onChange={(event) => {
                const next = sanitizeAmountInput(event.target.value);
                if (next !== quickAmount) {
                  triggerHaptic(8);
                }
                setQuickAmount(next);
              }}
            />

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

      {showAccessRevokedPrompt && (
        <div className="modal-backdrop">
          <div className="welcome-modal">
            <div className="welcome-topline">Workspace Access Updated</div>
            <h3 className="welcome-title">Your previous workspace access was removed.</h3>
            <p className="welcome-summary">
              Choose what to do next: open your own workspace, or review pending join requests.
            </p>
            <div className="inline-actions">
              <button className="primary-btn" type="button" onClick={() => void openMyWorkspaceFromPrompt()}>
                Open My Workspace
              </button>
              <button className="secondary-btn" type="button" onClick={() => void reviewJoinRequestsFromPrompt()}>
                Review Join Requests
              </button>
            </div>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                setShowAccessRevokedPrompt(false);
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {showJoinRequestPrompt && (
        <div className="modal-backdrop">
          <div className="welcome-modal">
            <div className="welcome-topline">Join Request Received</div>
            <h3 className="welcome-title">A workspace admin sent you an access request.</h3>
            <p className="welcome-summary">Open the request now to accept or reject it.</p>
            <div className="inline-actions">
              <button className="primary-btn" type="button" onClick={() => void reviewJoinRequestsFromPrompt()}>
                Review Request
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  setShowJoinRequestPrompt(false);
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {showWelcome && (
        <div className="modal-backdrop">
          <div className="welcome-modal">
            <div className="welcome-topline">Welcome to Cashbook by Routes</div>
            <BrandLogo className="welcome-logo" />
            <h3 className="welcome-title">Hello {welcomeName}, you are in the right place.</h3>
            <p className="welcome-summary">
              Track Cash. Stress Less. You can now manage daily cash records with a clean, reliable workflow built for
              speed and clarity.
            </p>
            <div className="welcome-grid">
              <div className="welcome-point">
                <strong>Fast daily flow</strong>
                <span>Use Cash In and Cash Out to capture entries in seconds.</span>
              </div>
              <div className="welcome-point">
                <strong>Clear financial view</strong>
                <span>See totals, trends, and exports in one professional workspace.</span>
              </div>
              <div className="welcome-point">
                <strong>Team-ready controls</strong>
                <span>Grant roles and permissions with admin-level control.</span>
              </div>
            </div>
            <div className="welcome-assure">
              Your records stay organized, auditable, and easy to access whenever you need them.
            </div>
            <button className="primary-btn welcome-cta" onClick={() => setShowWelcome(false)}>
              Continue to Dashboard
            </button>
          </div>
        </div>
      )}

      {message && <div className="toast">{message}</div>}
    </>
  );
}
