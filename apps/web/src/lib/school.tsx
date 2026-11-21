import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SchoolDto } from "@sims/shared";
import { api } from "./api.ts";
import { useAuth } from "./auth.tsx";

type SchoolContextValue = {
  schools: SchoolDto[];
  schoolId: string;
  school: SchoolDto | null;
  setSchoolId: (schoolId: string) => void;
  loading: boolean;
  canManage: boolean;
  canCoordinate: boolean;
  isOwner: boolean;
  reloadSchools: () => void;
};

const SchoolContext = createContext<SchoolContextValue | null>(null);
const STORAGE_KEY = "sims.schoolId";

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [schools, setSchools] = useState<SchoolDto[]>([]);
  const [schoolId, setSchoolIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    api<{ schools: SchoolDto[] }>("/api/v1/schools")
      .then((data) => {
        if (!active) return;
        setSchools(data.schools);
        const stored = sessionStorage.getItem(STORAGE_KEY);
        const next = data.schools.find((school) => school.id === stored)?.id ?? data.schools[0]?.id ?? "";
        setSchoolIdState(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, version]);

  function reloadSchools() {
    setVersion((current) => current + 1);
  }

  function setSchoolId(next: string) {
    sessionStorage.setItem(STORAGE_KEY, next);
    setSchoolIdState(next);
  }

  const value = useMemo<SchoolContextValue>(() => {
    const isOwner = user?.assignments.some((assignment) => assignment.roleCode === "SYSTEM_OWNER") ?? false;
    const canManage =
      isOwner ||
      (user?.assignments.some(
        (assignment) => assignment.schoolId === schoolId && assignment.roleCode === "ADMIN_SEKOLAH",
      ) ??
        false);
    const canCoordinate =
      canManage ||
      (user?.assignments.some(
        (assignment) => assignment.schoolId === schoolId && assignment.roleCode === "WAKAKUR",
      ) ??
        false);
    return {
      schools,
      schoolId,
      school: schools.find((school) => school.id === schoolId) ?? null,
      setSchoolId,
      loading,
      canManage,
      canCoordinate,
      isOwner,
      reloadSchools,
    };
  }, [schools, schoolId, loading, user]);

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchoolScope(): SchoolContextValue {
  const value = useContext(SchoolContext);
  if (!value) throw new Error("useSchoolScope dipakai di luar SchoolProvider.");
  return value;
}
