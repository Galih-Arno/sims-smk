import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GuestRoute, HomeGate, ProtectedRoute, RequireAccess } from "./components/RouteGuards.tsx";
import { AppShell } from "./components/shell/AppShell.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import {
  ClassesPage,
  ConcentrationsPage,
  FieldsPage,
  HomeroomsPage,
  ImportPage,
  ProgramsPage,
  SchoolProfilePage,
  SemestersPage,
  StudentsPage,
  SubjectsPage,
  TeachersPage,
  TeachingsPage,
  YearsPage,
} from "./pages/AcademicPages.tsx";
import { CurriculaPage, LearningPlansPage } from "./pages/CurriculumPages.tsx";
import { AttendanceCompletenessPage } from "./pages/AttendanceCompletenessPage.tsx";
import { GradePolicyPage } from "./pages/GradePolicyPage.tsx";
import { AccountPasswordPage, ProfilePage } from "./pages/AccountPages.tsx";
import { CompetencyDescriptionPage } from "./pages/CompetencyDescriptionPage.tsx";
import { HomeroomDescriptionPage } from "./pages/HomeroomDescriptionPage.tsx";
import { HomeroomNotePage } from "./pages/HomeroomNotePage.tsx";
import { AttendancePage } from "./pages/AttendancePage.tsx";
import { AttendanceRecapPage } from "./pages/AttendanceRecapPage.tsx";
import { DailyAttendancePage } from "./pages/DailyAttendancePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { GradePage } from "./pages/GradePage.tsx";
import { GradeFinalPage } from "./pages/GradeFinalPage.tsx";
import { GradeMonitorPage } from "./pages/GradeMonitorPage.tsx";
import { ReportPrepPage } from "./pages/ReportPrepPage.tsx";
import { ReportPreviewPage } from "./pages/ReportPreviewPage.tsx";
import { ReportExaminationPage } from "./pages/ReportExaminationPage.tsx";
import { ReportDecisionPage } from "./pages/ReportDecisionPage.tsx";
import { GradeRecapPage } from "./pages/GradeRecapPage.tsx";
import { GradeStatusPage } from "./pages/GradeStatusPage.tsx";
import { SchoolUsersPage } from "./pages/SchoolUsersPage.tsx";
import { MyClassesPage, TeacherHomePage, WaliHomePage } from "./pages/TeacherPortalPages.tsx";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/masuk" element={<LoginPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeGate />} />
              <Route element={<RequireAccess allow="staff" />}>
                <Route path="/profil" element={<SchoolProfilePage />} />
                <Route path="/tahun-pelajaran" element={<YearsPage />} />
                <Route path="/semester" element={<SemestersPage />} />
                <Route path="/bidang" element={<FieldsPage />} />
                <Route path="/program" element={<ProgramsPage />} />
                <Route path="/konsentrasi" element={<ConcentrationsPage />} />
                <Route path="/guru" element={<TeachersPage />} />
                <Route path="/siswa" element={<StudentsPage />} />
                <Route path="/kelas" element={<ClassesPage />} />
                <Route path="/mapel" element={<SubjectsPage />} />
                <Route path="/kurikulum" element={<CurriculaPage />} />
                <Route path="/pengaturan-nilai" element={<GradePolicyPage />} />
                <Route path="/pengaturan-absensi" element={<AttendanceCompletenessPage />} />
                <Route path="/penugasan" element={<TeachingsPage />} />
                <Route path="/wali-kelas" element={<HomeroomsPage />} />
                <Route path="/nilai/penerimaan" element={<GradeStatusPage view="staff" />} />
                <Route path="/validasi-rapor" element={<ReportDecisionPage mode="validation" />} />
                <Route path="/pengesahan-rapor" element={<ReportDecisionPage mode="endorsement" />} />
                <Route path="/impor" element={<ImportPage />} />
                <Route path="/pengguna" element={<SchoolUsersPage />} />
              </Route>
              <Route element={<RequireAccess allow="guru" />}>
                <Route path="/guru/beranda" element={<TeacherHomePage />} />
                <Route path="/guru/kelas" element={<MyClassesPage />} />
                <Route path="/guru/nilai" element={<GradePage />} />
                <Route path="/guru/nilai-akhir" element={<GradeFinalPage view="guru" />} />
                <Route path="/guru/deskripsi-capaian" element={<CompetencyDescriptionPage />} />
                <Route path="/guru/status-nilai" element={<GradeStatusPage view="guru" />} />
                <Route path="/guru/absensi" element={<AttendancePage />} />
              </Route>
              <Route element={<RequireAccess allow="plan" />}>
                <Route path="/pembelajaran" element={<LearningPlansPage />} />
              </Route>
              <Route element={<RequireAccess allow="wali" />}>
                <Route path="/wali/beranda" element={<WaliHomePage />} />
                <Route path="/wali/penerimaan" element={<GradeStatusPage view="wali" />} />
                <Route path="/wali/monitoring-nilai" element={<GradeMonitorPage />} />
                <Route path="/wali/persiapan-rapor" element={<ReportPrepPage />} />
                <Route path="/wali/pratinjau-rapor" element={<ReportPreviewPage />} />
                <Route path="/wali/pemeriksaan-rapor" element={<ReportExaminationPage />} />
                <Route path="/wali/catatan-wali" element={<HomeroomNotePage />} />
                <Route path="/wali/deskripsi-capaian" element={<HomeroomDescriptionPage />} />
                <Route path="/wali/rekap-absensi" element={<AttendanceRecapPage />} />
                <Route path="/wali/absensi-harian" element={<DailyAttendancePage />} />
                <Route path="/wali/nilai-akhir" element={<GradeFinalPage view="wali" />} />
                <Route path="/wali/rekap-nilai" element={<GradeRecapPage />} />
              </Route>
              <Route path="/akun" element={<ProfilePage />} />
              <Route path="/akun/sandi" element={<AccountPasswordPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
