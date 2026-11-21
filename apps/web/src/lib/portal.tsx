import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { HomeroomAssignmentDto, PageResult, TeacherDto, TeachingAssignmentDto } from "@sims/shared";
import { api } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { isGuru, isStaff, isWali } from "./access.ts";
import { useSchoolScope } from "./school.tsx";

export type PortalId = "admin" | "guru" | "wali";

type PortalContextValue = {
  portal: PortalId;
  setPortal: (portal: PortalId) => void;
  choices: PortalId[];
  teachings: TeachingAssignmentDto[];
  homerooms: HomeroomAssignmentDto[];
  loading: boolean;
};

const PortalContext = createContext<PortalContextValue | null>(null);
const STORAGE_KEY = "sims.portal";

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { schoolId } = useSchoolScope();
  const [portal, setPortalState] = useState<PortalId>("admin");
  const [teachings, setTeachings] = useState<TeachingAssignmentDto[]>([]);
  const [homerooms, setHomerooms] = useState<HomeroomAssignmentDto[]>([]);
  const [loading, setLoading] = useState(true);

  const guru = isGuru(user, schoolId);
  const waliRole = isWali(user, schoolId);
  const staff = isStaff(user, schoolId);

  useEffect(() => {
    if (!user || !schoolId || (!guru && !waliRole)) {
      setTeachings([]);
      setHomerooms([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      api<PageResult<TeacherDto>>(`/api/v1/schools/${schoolId}/teachers?page=1&pageSize=50`),
      api<PageResult<TeachingAssignmentDto>>(`/api/v1/schools/${schoolId}/teaching-assignments?page=1&pageSize=50`),
      api<PageResult<HomeroomAssignmentDto>>(`/api/v1/schools/${schoolId}/homeroom-assignments?page=1&pageSize=50`),
    ])
      .then(([teacherPage, teachingPage, homeroomPage]) => {
        if (!active) return;
        const mine = teacherPage.items.find((teacher) => teacher.userId === user.id);
        setTeachings(mine ? teachingPage.items.filter((item) => item.teacherId === mine.id) : []);
        setHomerooms(mine ? homeroomPage.items.filter((item) => item.teacherId === mine.id) : []);
      })
      .catch(() => {
        if (!active) return;
        setTeachings([]);
        setHomerooms([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, schoolId, guru, waliRole]);

  const choices = useMemo<PortalId[]>(() => {
    const next: PortalId[] = [];
    if (staff) next.push("admin");
    if (guru) next.push("guru");
    if (waliRole && (homerooms.length > 0 || (!staff && !guru))) next.push("wali");
    return next;
  }, [staff, guru, waliRole, homerooms.length]);

  useEffect(() => {
    if (loading) return;
    const stored = sessionStorage.getItem(`${STORAGE_KEY}.${schoolId}`) as PortalId | null;
    const next = stored && choices.includes(stored) ? stored : choices[0] ?? "guru";
    setPortalState(next);
  }, [choices, loading, schoolId]);

  function setPortal(next: PortalId) {
    if (!choices.includes(next)) return;
    sessionStorage.setItem(`${STORAGE_KEY}.${schoolId}`, next);
    setPortalState(next);
  }

  const value = useMemo<PortalContextValue>(
    () => ({ portal, setPortal, choices, teachings, homerooms, loading }),
    [portal, choices, teachings, homerooms, loading],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal dipakai di luar PortalProvider.");
  return value;
}
