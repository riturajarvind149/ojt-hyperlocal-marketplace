
import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const sectionRoutes = {
  student: {
    Dashboard: "/student/dashboard",
    "Browse Jobs": "/student/jobs",
    "My Applications": "/student/applications",
    Messages: "/student/messages",
    Profile: "/student/profile"
  },
  business: {
    Dashboard: "/business/dashboard",
    "Post Job": "/business/post-job",
    "My Jobs": "/business/jobs",
    Applications: "/business/applications",
    Messages: "/business/messages",
    Profile: "/business/profile"
  }
};

function routeFromPath(pathname) {
  const businessMatch = pathname.match(/^\/business\/jobs\/([^/]+)\/(rankings|team-selection)$/);
  if (businessMatch) {
    return {
      screen: "business",
      section: businessMatch[2],
      jobId: businessMatch[1]
    };
  }

  if (pathname.startsWith("/student")) return { screen: "student", section: pathname.split("/")[2] || "dashboard" };
  if (pathname.startsWith("/business")) return { screen: "business", section: pathname.split("/")[2] || "dashboard" };
  if (pathname === "/choose-role") return { screen: "choose-role", section: "" };
  if (pathname === "/login") return { screen: "login", section: "" };
  if (pathname === "/register") return { screen: "register", section: "" };
  return { screen: "home", section: "" };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
}

function formatDate(value) {
  if (!value) return "Recently";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelative(value) {
  if (!value) return "Recently";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "LH";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function normalizeSkill(skill = "") {
  return String(skill).trim().toLowerCase();
}

function parseSkills(text = "") {
  return text.split(",").map((skill) => skill.trim()).filter(Boolean);
}

function Logo({ navigate }) {
  return (
    <button className="logo" onClick={() => navigate("/")}>
      <span className="logo-mark">LH</span>
      <span>LocalHire</span>
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const [roleChoice, setRoleChoice] = useState("student");
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [studentApplications, setStudentApplications] = useState([]);
  const [businessApplications, setBusinessApplications] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [teamSuggestions, setTeamSuggestions] = useState([]);
  const [notice, setNotice] = useState({ text: "", type: "info" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function showNotice(text, type = "info") {
    setNotice({ text, type });
    setTimeout(() => setNotice({ text: "", type: "info" }), 4000);
  }

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(routeFromPath(path));
  }

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (route.screen !== "business") {
      setRankings(null);
      setTeamSuggestions([]);
      return;
    }
    if (route.section === "rankings" && route.jobId) loadRankings(route.jobId);
    if (route.section === "team-selection" && route.jobId) loadTeamSuggestions(route.jobId);
  }, [route.screen, route.section, route.jobId, user?.id]);

  async function request(path, options = {}) {
    const { headers: extraHeaders, ...restOptions } = options;
    const res = await fetch(`${API_URL}${path}`, {
      ...restOptions,
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  function authHeaders() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function bootstrap() {
    setLoading(true);
    await loadJobs();
    const token = localStorage.getItem("token");
    if (token) {
      try {
        // Validate token is not expired by decoding it client-side first
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          // Check expiry
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem("token");
            setLoading(false);
            return;
          }
        }
        const profile = await request("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        setUser(profile);
        setRoleChoice(profile.role);
        await loadPrivateData(profile.role);
      } catch {
        localStorage.removeItem("token");
      }
    }
    setLoading(false);
  }

  async function loadPrivateData(role = user?.role) {
    if (!role) return;
    const tasks = [loadInbox()];
    if (role === "student") tasks.push(loadStudentApplications());
    if (role === "business") tasks.push(loadBusinessApplications());
    await Promise.all(tasks);
  }

  async function loadJobs() {
    try {
      const data = await request("/jobs");
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      showNotice("Backend is not reachable. Start the server with npm run dev.", "error");
      setJobs([]);
    }
  }

  async function loadStudentApplications() {
    try {
      const data = await request("/jobs/my-applications", { headers: authHeaders() });
      setStudentApplications(Array.isArray(data) ? data : []);
    } catch {
      setStudentApplications([]);
    }
  }

  async function loadBusinessApplications() {
    try {
      const data = await request("/jobs/applications", { headers: authHeaders() });
      setBusinessApplications(Array.isArray(data) ? data : []);
    } catch {
      setBusinessApplications([]);
    }
  }

  async function loadInbox() {
    try {
      const data = await request("/jobs/messages/inbox", { headers: authHeaders() });
      const list = Array.isArray(data) ? data : [];
      setInbox(list);
    } catch {
      setInbox([]);
    }
  }

  async function loadRankings(jobId) {
    try {
      const data = await request(`/jobs/${jobId}/rankings`, { headers: authHeaders() });
      setRankings(data);
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function loadTeamSuggestions(jobId) {
    try {
      const data = await request(`/jobs/${jobId}/team-suggestions`, { headers: authHeaders() });
      setTeamSuggestions(data.suggestions || []);
    } catch (error) {
      showNotice(error.message, "error");
    }
  }
  async function handleLogin(form) {
    try {
      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password })
      });
      localStorage.setItem("token", data.token);
      setUser(data.user);
      setRoleChoice(data.user.role);
      await loadPrivateData(data.user.role);
      navigate(data.user.role === "business" ? "/business/dashboard" : "/student/dashboard");
      showNotice("Welcome back, " + data.user.name + ".");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function handleRegister(form) {
    const isBusiness = form.role === "business";
    const payload = isBusiness
      ? {
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          businessType: form.businessType,
          location: form.location,
          bio: form.bio
        }
      : {
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          college: form.college,
          location: form.location,
          bio: form.bio,
          skills: parseSkills(form.skills)
        };

    try {
      await request(isBusiness ? "/auth/register-business" : "/auth/register-student", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showNotice("Account created! Sign in with your new account.");
      navigate("/login");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function applyJob(jobId) {
    if (!user?.id || user.role !== "student") {
      setRoleChoice("student");
      showNotice("Sign in as a student to apply.", "error");
      navigate("/login");
      return;
    }

    setBusy(true);
    try {
      await request("/jobs/apply", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ jobId })
      });
      await Promise.all([loadStudentApplications(), loadJobs(), loadInbox()]);
      showNotice("Application sent! Your simulated skill test score has been recorded.");
      navigate("/student/applications");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function createJob(form) {
    setBusy(true);
    try {
      await request("/jobs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          budget: Number(form.budget),
          location: form.location,
          skills: parseSkills(form.skills),
          teamBased: form.teamBased
        })
      });
      await Promise.all([loadJobs(), loadBusinessApplications()]);
      showNotice("Job posted! AI skill test generated automatically.");
      navigate("/business/jobs");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(applicationId, status) {
    setBusy(true);
    try {
      await request("/jobs/application-status", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ applicationId, status })
      });
      await Promise.all([loadBusinessApplications(), loadJobs(), loadInbox()]);
      if (route.jobId) await loadRankings(route.jobId);
      showNotice(`Application status updated to: ${status.replace("_", " ")}.`);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(applicationId, shouldNavigate = true) {
    try {
      const data = await request(`/jobs/applications/${applicationId}/messages`, { headers: authHeaders() });
      setActiveConversation(data);
      if (shouldNavigate && user?.role) navigate(`/${user.role}/messages`);
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function sendMessage(text) {
    if (!activeConversation?.application?._id) return;
    setBusy(true);
    try {
      await request(`/jobs/applications/${activeConversation.application._id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text })
      });
      await Promise.all([openConversation(activeConversation.application._id, false), loadInbox()]);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(form) {
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        location: form.location,
        bio: form.bio,
        ...(user?.role === "student"
          ? { college: form.college, skills: parseSkills(form.skills) }
          : { businessType: form.businessType })
      };
      const data = await request("/auth/me", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      setUser(data.user);
      showNotice("Profile updated successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(jobId) {
    if (!user || user.role !== "business") {
      showNotice("You must be logged in as a business to delete jobs.", "error");
      return;
    }
    if (!window.confirm("Delete this job? This will also remove all applications and messages.")) return;
    setBusy(true);
    try {
      await request(`/jobs/${jobId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      await Promise.all([loadJobs(), loadBusinessApplications()]);
      showNotice("Job deleted successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function selectTeam(jobId, applicationIds) {
    setBusy(true);
    try {
      await request(`/jobs/${jobId}/select-team`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ applicationIds })
      });
      await Promise.all([loadBusinessApplications(), loadJobs(), loadTeamSuggestions(jobId), loadRankings(jobId)]);
      showNotice("Team selected and moved to in progress.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setStudentApplications([]);
    setBusinessApplications([]);
    setInbox([]);
    setActiveConversation(null);
    setRankings(null);
    setTeamSuggestions([]);
    navigate("/");
  }

  if (loading) return <main className="loading-screen">Loading LocalHire...</main>;

  return (
    <div className="app-shell">
      {notice.text && <div className={`toast toast-${notice.type}`}>{notice.text}</div>}
      {route.screen === "home" && <Home navigate={navigate} />}
      {route.screen === "choose-role" && <RoleChoice roleChoice={roleChoice} setRoleChoice={setRoleChoice} navigate={navigate} />}
      {route.screen === "login" && <AuthCard mode="login" role={roleChoice} navigate={navigate} onSubmit={handleLogin} />}
      {route.screen === "register" && <AuthCard mode="register" role={roleChoice} navigate={navigate} onSubmit={handleRegister} />}
      {route.screen === "student" && (
        <Protected user={user} role="student" navigate={navigate}>
          <DashboardShell role="student" user={user} navigate={navigate} logout={logout} currentPath={window.location.pathname}>
            <StudentArea
              route={route}
              user={user}
              jobs={jobs}
              applications={studentApplications}
              inbox={inbox}
              activeConversation={activeConversation}
              onApply={applyJob}
              onOpenConversation={openConversation}
              onSendMessage={sendMessage}
              onSaveProfile={saveProfile}
              navigate={navigate}
              busy={busy}
            />
          </DashboardShell>
        </Protected>
      )}
      {route.screen === "business" && (
        <Protected user={user} role="business" navigate={navigate}>
          <DashboardShell role="business" user={user} navigate={navigate} logout={logout} currentPath={window.location.pathname}>
            <BusinessArea
              route={route}
              user={user}
              jobs={jobs}
              applications={businessApplications}
              inbox={inbox}
              activeConversation={activeConversation}
              rankings={rankings}
              teamSuggestions={teamSuggestions}
              onCreateJob={createJob}
              onUpdateStatus={updateStatus}
              onOpenConversation={openConversation}
              onSendMessage={sendMessage}
              onSaveProfile={saveProfile}
              onNavigate={navigate}
              onSelectTeam={selectTeam}
              onDeleteJob={deleteJob}
              busy={busy}
            />
          </DashboardShell>
        </Protected>
      )}
    </div>
  );
}

function Protected({ user, role, navigate, children }) {
  useEffect(() => {
    if (!user || user.role !== role) navigate("/login");
  }, [user, role]);

  if (!user || user.role !== role) return null;
  return children;
}

function Home({ navigate }) {
  return (
    <div className="marketing-page">
      <header className="marketing-topbar">
        <Logo navigate={navigate} />
        <nav>
          <button className="ghost-button" onClick={() => navigate("/login")}>Log In</button>
          <button className="primary-button small" onClick={() => navigate("/choose-role")}>Get Started</button>
        </nav>
      </header>
      <main>
        <section className="hero-card">
          <span className="eyebrow">AI-Powered Job Matching</span>
          <h1>Connecting local talent to local business with faster hiring workflows.</h1>
          <p>LocalHire helps businesses post digital work, auto-generate skill tests, rank candidates, build teams, and start pre-hiring conversations in one place.</p>
          <div className="button-row center">
            <button className="primary-button" onClick={() => navigate("/choose-role")}>Get Started</button>
            <button className="secondary-button" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>Explore Features</button>
          </div>
        </section>

        <section className="feature-grid" id="features">
          <FeatureCard title="AI-Powered Testing" text="Every job can generate a simulated skill test so businesses can compare candidates with structure." />
          <FeatureCard title="Team Collaboration" text="Team-based jobs recommend complementary applicants for better local project delivery." />
          <FeatureCard title="Hyperlocal Hiring" text="Students discover nearby opportunities and businesses hire from their own community." />
        </section>

        <section className="metrics-strip">
          <MetricCard value="2,500+" label="Active Students" />
          <MetricCard value="450+" label="Businesses" />
          <MetricCard value="1,200+" label="Jobs Posted" />
          <MetricCard value="$125k+" label="Potential Payouts" />
        </section>

        <section className="cta-panel">
          <h2>Ready to get started?</h2>
          <p>Join students and businesses already using LocalHire to make hyperlocal hiring simpler.</p>
          <div className="button-row center">
            <button className="secondary-button inverted" onClick={() => navigate("/choose-role")}>I&apos;m a Student</button>
            <button className="primary-button inverted-light" onClick={() => navigate("/choose-role")}>I&apos;m a Business</button>
          </div>
        </section>
      </main>
      <footer className="marketing-footer">
        <div>
          <strong>LocalHire</strong>
          <p>Connecting local talent with local opportunities.</p>
        </div>
        <div className="footer-links">
          <span>Browse Jobs</span>
          <span>Post a Job</span>
          <span>How it Works</span>
          <span>Privacy</span>
        </div>
      </footer>
    </div>
  );
}
function RoleChoice({ roleChoice, setRoleChoice, navigate }) {
  return (
    <main className="auth-layout">
      <Logo navigate={navigate} />
      <section className="selector-card">
        <span className="eyebrow green">Choose Your Role</span>
        <h1>Use LocalHire as a student or a business.</h1>
        <p>Select the experience you want. You can always go back and switch before creating your account.</p>
        <div className="selector-grid">
          <button className={roleChoice === "student" ? "selector-option active" : "selector-option"} onClick={() => setRoleChoice("student")}>
            <span className="selector-icon">S</span>
            <strong>I&apos;m a Student</strong>
            <small>Find jobs, complete tests, track applications, and chat with employers.</small>
          </button>
          <button className={roleChoice === "business" ? "selector-option active" : "selector-option"} onClick={() => setRoleChoice("business")}>
            <span className="selector-icon">B</span>
            <strong>I&apos;m a Business</strong>
            <small>Post jobs, rank candidates, build teams, and manage hiring workflows.</small>
          </button>
        </div>
        <div className="button-row center">
          <button className="primary-button" onClick={() => navigate("/login")}>Continue to Login</button>
          <button className="secondary-button" onClick={() => navigate("/register")}>Create Account</button>
        </div>
      </section>
    </main>
  );
}

function AuthCard({ mode, role, navigate, onSubmit }) {
  const [form, setForm] = useState({
    role,
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    college: "",
    location: "",
    bio: "",
    skills: "",
    businessType: ""
  });

  useEffect(() => setForm((current) => ({ ...current, role })), [role]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (mode === "register" && form.password !== form.confirmPassword) return;
    onSubmit(form);
  }

  return (
    <main className="auth-layout">
      <Logo navigate={navigate} />
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p>{mode === "login" ? "Sign in to continue your LocalHire workflow." : `Join LocalHire as a ${role}.`}</p>
        {mode === "register" && <Input label={role === "business" ? "Business Name" : "Full Name"} name="name" value={form.name} onChange={update} />}
        <Input label="Email Address" name="email" type="email" value={form.email} onChange={update} />
        <Input label="Password" name="password" type="password" value={form.password} onChange={update} />
        {mode === "register" && <Input label="Confirm Password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} />}
        {mode === "register" && <Input label="Phone" name="phone" value={form.phone} onChange={update} />}
        {mode === "register" && <Input label="Location" name="location" value={form.location} onChange={update} />}
        {mode === "register" && role === "student" && (
          <>
            <Input label="College" name="college" value={form.college} onChange={update} />
            <Input label="Skills (comma separated)" name="skills" value={form.skills} onChange={update} placeholder="React, Figma, Content" />
          </>
        )}
        {mode === "register" && role === "business" && <Input label="Business Type" name="businessType" value={form.businessType} onChange={update} />}
        {mode === "register" && <Textarea label="Bio" name="bio" value={form.bio} onChange={update} placeholder="Tell us a bit about yourself or your business." />}
        <button className="primary-button full-width">{mode === "login" ? "Sign In" : "Create Account"}</button>
        <button className="link-button" type="button" onClick={() => navigate(mode === "login" ? "/register" : "/login")}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

function DashboardShell({ role, user, navigate, logout, currentPath, children }) {
  const items = Object.entries(sectionRoutes[role]);
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <Logo navigate={navigate} />
        <div className="sidebar-nav">
          {items.map(([label, path]) => (
            <button key={label} className={currentPath === path ? "sidebar-link active" : "sidebar-link"} onClick={() => navigate(path)}>
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar-profile">
          <span className="avatar-circle">{initials(user?.name)}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>{role === "business" ? user?.businessType || "Business" : user?.college || "Student"}</small>
          </div>
        </div>
        <button className="danger-link" onClick={logout}>Logout</button>
      </aside>
      <section className="dashboard-content">{children}</section>
    </div>
  );
}

function StudentArea({ route, user, jobs, applications, inbox, activeConversation, onApply, onOpenConversation, onSendMessage, onSaveProfile, busy, navigate }) {
  const appliedIds = useMemo(() => applications.map((app) => app.jobId?._id).filter(Boolean), [applications]);
  const approvedCount = applications.filter((app) => ["approved", "in_progress", "completed"].includes(app.status)).length;
  const pendingCount = applications.filter((app) => app.status === "pending").length;
  const earnings = applications.filter((app) => ["in_progress", "completed"].includes(app.status)).reduce((sum, app) => sum + Number(app.jobId?.budget || 0), 0);

  if (route.section === "jobs") return <StudentJobs jobs={jobs} appliedIds={appliedIds} onApply={onApply} busy={busy} />;
  if (route.section === "applications") return <StudentApplications applications={applications} onOpenConversation={onOpenConversation} />;
  if (route.section === "messages") return <MessagesScreen role="student" inbox={inbox} activeConversation={activeConversation} onOpenConversation={onOpenConversation} onSendMessage={onSendMessage} />;
  if (route.section === "profile") return <ProfileEditor user={user} onSave={onSaveProfile} />;

  return (
    <>
      <PageHeader title="Student Dashboard" subtitle="Track applications, discover jobs, and keep hiring conversations moving." />
      <HeroPanel title={`Welcome back, ${user?.name}`} text="Your dashboard combines live applications, simulated test performance, and recommended roles." actionLabel="Browse Jobs" actionPath="/student/jobs" navigate={navigate} />
      <StatsGrid items={[
        { label: "Applications", value: applications.length },
        { label: "Approved", value: approvedCount },
        { label: "Pending", value: pendingCount },
        { label: "Projected Earnings", value: formatMoney(earnings) }
      ]} />
      <SectionTitle title="Recommended for You" />
      <JobsList jobs={jobs.filter((job) => job.status === "open").slice(0, 4)} appliedIds={appliedIds} onApply={onApply} busy={busy} />
      <SectionTitle title="Recent Applications" />
      <StudentApplications applications={applications.slice(0, 4)} onOpenConversation={onOpenConversation} compact />
    </>
  );
}

function BusinessArea({ route, user, jobs, applications, inbox, activeConversation, rankings, teamSuggestions, onCreateJob, onUpdateStatus, onOpenConversation, onSendMessage, onSaveProfile, onNavigate, onSelectTeam, onDeleteJob, busy }) {
  const ownJobs = jobs.filter((job) => {
    const jobBusinessId = String(job.businessId?._id || job.businessId || "");
    const userId = String(user?.id || "");
    return jobBusinessId === userId && jobBusinessId !== "";
  });
  const pendingApplications = applications.filter((app) => app.status === "pending").length;
  const inProgressJobs = ownJobs.filter((job) => job.status === "in_progress").length;
  const hiredCount = applications.filter((app) => ["approved", "in_progress", "completed"].includes(app.status)).length;

  if (route.section === "post-job") return <PostJobForm onCreateJob={onCreateJob} busy={busy} />;
  if (route.section === "jobs") return <BusinessJobs jobs={ownJobs} onNavigate={onNavigate} onDeleteJob={onDeleteJob} busy={busy} />;
  if (route.section === "applications") return <BusinessApplications applications={applications} onUpdateStatus={onUpdateStatus} onOpenConversation={onOpenConversation} busy={busy} />;
  if (route.section === "messages") return <MessagesScreen role="business" inbox={inbox} activeConversation={activeConversation} onOpenConversation={onOpenConversation} onSendMessage={onSendMessage} />;
  if (route.section === "profile") return <ProfileEditor user={user} onSave={onSaveProfile} />;
  if (route.section === "rankings") return <RankingsScreen rankings={rankings} onNavigate={onNavigate} />;
  if (route.section === "team-selection") return <TeamSelectionScreen jobId={route.jobId} suggestions={teamSuggestions} onSelectTeam={onSelectTeam} />;

  return (
    <>
      <PageHeader title="Business Dashboard" subtitle="Manage job postings, compare ranked candidates, and move hires into delivery." />
      <HeroPanel title={`Welcome back, ${user?.name}`} text="Your jobs now generate simulated skill tests and structured candidate rankings automatically." actionLabel="Post New Job" actionPath="/business/post-job" navigate={onNavigate} />
      <StatsGrid items={[
        { label: "Total Jobs", value: ownJobs.length },
        { label: "Pending Applications", value: pendingApplications },
        { label: "Active Jobs", value: inProgressJobs },
        { label: "Hired Candidates", value: hiredCount }
      ]} />
      <section className="two-column">
        <div>
          <SectionTitle title="Your Jobs" />
          <BusinessJobs jobs={ownJobs.slice(0, 4)} onNavigate={onNavigate} onDeleteJob={onDeleteJob} busy={busy} compact />
        </div>
        <PostJobForm onCreateJob={onCreateJob} busy={busy} compact />
      </section>
      <SectionTitle title="Latest Applicants" />
      <BusinessApplications applications={applications.slice(0, 5)} onUpdateStatus={onUpdateStatus} onOpenConversation={onOpenConversation} busy={busy} compact />
    </>
  );
}
function StudentJobs({ jobs, appliedIds, onApply, busy }) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState("recent");
  const [selectedSkills, setSelectedSkills] = useState([]);

  const locations = useMemo(() => ["all", ...new Set(jobs.map((job) => job.location).filter(Boolean))], [jobs]);
  const skillOptions = useMemo(() => [...new Set(jobs.flatMap((job) => job.skills || []))], [jobs]);

  const filtered = useMemo(() => {
    let list = jobs.filter((job) => job.status === "open");
    if (search) {
      const query = search.toLowerCase();
      list = list.filter((job) => `${job.title} ${job.description} ${(job.skills || []).join(" ")}`.toLowerCase().includes(query));
    }
    if (location !== "all") list = list.filter((job) => job.location === location);
    if (selectedSkills.length) {
      list = list.filter((job) => selectedSkills.every((skill) => (job.skills || []).map(normalizeSkill).includes(normalizeSkill(skill))));
    }
    list = [...list].sort((a, b) => sort === "budget" ? Number(b.budget || 0) - Number(a.budget || 0) : new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }, [jobs, search, location, selectedSkills, sort]);

  function toggleSkill(skill) {
    setSelectedSkills((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]);
  }

  return (
    <>
      <PageHeader title="Browse Jobs" subtitle="Filter opportunities by skill, location, and recency." />
      <section className="jobs-layout">
        <aside className="filter-card">
          <Input label="Search" name="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job title, skill, company" required={false} />
          <Select label="Location" value={location} onChange={(event) => setLocation(event.target.value)} options={locations.map((item) => ({ label: item === "all" ? "All Locations" : item, value: item }))} />
          <Select label="Sort By" value={sort} onChange={(event) => setSort(event.target.value)} options={[{ label: "Most Recent", value: "recent" }, { label: "Highest Budget", value: "budget" }]} />
          <div className="chip-filter">
            <span>Skills</span>
            <div className="chip-wrap">
              {skillOptions.map((skill) => (
                <button key={skill} type="button" className={selectedSkills.includes(skill) ? "chip active" : "chip"} onClick={() => toggleSkill(skill)}>
                  {skill}
                </button>
              ))}
            </div>
          </div>
        </aside>
        <div>
          <SectionTitle title={`${filtered.length} jobs found`} />
          <JobsList jobs={filtered} appliedIds={appliedIds} onApply={onApply} busy={busy} />
        </div>
      </section>
    </>
  );
}

function JobsList({ jobs, appliedIds, onApply, busy }) {
  if (!jobs.length) return <EmptyState title="No matching jobs yet" text="Try changing filters or post a job from a business account." />;

  return (
    <div className="list-stack">
      {jobs.map((job) => {
        const applied = appliedIds.includes(job._id);
        return (
          <article key={job._id} className="job-card modern">
            <div className="job-main">
              <div className="job-headline">
                <div>
                  <h3>{job.title}</h3>
                  <p>{job.businessId?.name || "Business"} · {job.location || "Local"}</p>
                </div>
                <div className="job-price">{formatMoney(job.budget)}</div>
              </div>
              <p className="job-copy">{job.description}</p>
              <div className="chip-wrap">
                {(job.skills || []).map((skill) => <span key={skill} className="chip neutral">{skill}</span>)}
                {job.teamBased && <span className="chip accent">Team Based</span>}
              </div>
            </div>
            <div className="job-side">
              <span className="muted-text">{formatRelative(job.createdAt)}</span>
              <button className={applied ? "secondary-button" : "primary-button small"} disabled={applied || busy} onClick={() => onApply(job._id)}>
                {applied ? "Applied" : "Apply Now"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StudentApplications({ applications, onOpenConversation, compact = false }) {
  if (!applications.length) return <EmptyState title="No applications yet" text="Apply to a job to see simulated test scores, statuses, and messages here." />;
  return (
    <div className="list-stack">
      {applications.map((application) => (
        <article key={application._id} className="panel-card application-card">
          <div>
            <div className="card-row space-between">
              <div>
                <h3>{application.jobId?.title || "Job"}</h3>
                <p>{application.jobId?.businessId?.name || "Business"} · Applied {formatRelative(application.createdAt)}</p>
              </div>
              <div className="score-block">
                <strong>{application.testScore || 0}</strong>
                <span>Test Score</span>
              </div>
            </div>
            <div className="stats-inline">
              <span className={`status-pill ${application.status}`}>{application.status.replace("_", " ")}</span>
              <span>Ranking Score: {application.rankingScore || 0}</span>
              <span>Time Taken: {application.timeTaken || 0} min</span>
            </div>
            <p className="muted-text">{application.notes || "Structured review in progress."}</p>
          </div>
          {!compact && <div className="button-row"><button className="secondary-button" onClick={() => onOpenConversation(application._id)}>Message Employer</button></div>}
        </article>
      ))}
    </div>
  );
}

function BusinessJobs({ jobs, onNavigate, onDeleteJob, busy, compact = false }) {
  if (!jobs.length) return <EmptyState title="No jobs posted yet" text="Post a job to generate tests and start receiving ranked applicants." />;
  return (
    <div className="list-stack">
      {jobs.map((job) => (
        <article key={job._id} className="panel-card application-card">
          <div className="card-row space-between">
            <div>
              <h3>{job.title}</h3>
              <p>{formatMoney(job.budget)} · {job.location || "Local"} · Posted {formatRelative(job.createdAt)}</p>
            </div>
            <span className={`status-pill ${job.status}`}>{job.status.replace("_", " ")}</span>
          </div>
          <div className="chip-wrap">
            {(job.skills || []).map((skill) => <span key={skill} className="chip neutral">{skill}</span>)}
            {job.teamBased && <span className="chip accent">Team Based</span>}
          </div>
          {!compact && (
            <div className="button-row">
              <button className="secondary-button" onClick={() => onNavigate(`/business/jobs/${job._id}/rankings`)}>View Rankings</button>
              {job.teamBased && <button className="primary-button small" onClick={() => onNavigate(`/business/jobs/${job._id}/team-selection`)}>Team Suggestions</button>}
              {job.status === "open" && <button className="danger-link" disabled={busy} onClick={() => onDeleteJob(job._id)}>Delete</button>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function BusinessApplications({ applications, onUpdateStatus, onOpenConversation, busy, compact = false }) {
  if (!applications.length) return <EmptyState title="No applicants yet" text="Applications will show ranking, scores, and chat access once students apply." />;
  return (
    <div className="list-stack">
      {applications.map((application) => {
        const isPending = application.status === "pending";
        const isApproved = application.status === "approved";
        const isInProgress = application.status === "in_progress";
        const isDone = application.status === "completed" || application.status === "rejected";
        return (
          <article key={application._id} className="panel-card application-card">
            <div className="card-row space-between">
              <div>
                <h3>{application.studentId?.name || "Student"}</h3>
                <p>{application.jobId?.title || "Job"} · {application.jobId?.location || "Local"}</p>
              </div>
              <span className={`status-pill ${application.status}`}>{application.status.replace("_", " ")}</span>
            </div>
            <div className="stats-inline wrap">
              <span>Test Score: {application.testScore || 0}</span>
              <span>Ranking Score: {application.rankingScore || 0}</span>
              <span>Time Taken: {application.timeTaken || 0} min</span>
            </div>
            <div className="chip-wrap">{(application.matchedSkills || []).map((skill) => <span key={skill} className="chip neutral">{skill}</span>)}</div>
            {!compact && !isDone && (
              <div className="button-row wrap">
                <button className="secondary-button" onClick={() => onOpenConversation(application._id)}>Message</button>
                {isPending && <button className="secondary-button" disabled={busy} onClick={() => onUpdateStatus(application._id, "approved")}>Approve</button>}
                {isPending && <button className="danger-link" disabled={busy} onClick={() => onUpdateStatus(application._id, "rejected")}>Reject</button>}
                {(isPending || isApproved) && <button className="secondary-button" disabled={busy} onClick={() => onUpdateStatus(application._id, "in_progress")}>Start Work</button>}
                {isInProgress && <button className="primary-button small" disabled={busy} onClick={() => onUpdateStatus(application._id, "completed")}>Mark Complete</button>}
              </div>
            )}
            {!compact && isDone && (
              <div className="button-row wrap">
                <button className="secondary-button" onClick={() => onOpenConversation(application._id)}>Message</button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
function RankingsScreen({ rankings, onNavigate }) {
  if (!rankings) return <EmptyState title="Loading rankings" text="Fetching ranked candidates for this job." />;
  return (
    <>
      <PageHeader title="Test Results & Rankings" subtitle={`${rankings.job.title} candidate leaderboard`} />
      <div className="podium-grid">
        {(rankings.topPerformers || []).map((candidate, index) => (
          <div key={candidate._id} className={`podium-card position-${index + 1}`}>
            <span className="avatar-circle large">{initials(candidate.studentId?.name)}</span>
            <strong>{candidate.studentId?.name}</strong>
            <span>{candidate.testScore}</span>
            <small>{candidate.timeTaken} min</small>
          </div>
        ))}
      </div>
      <section className="panel-card rankings-table">
        {(rankings.candidates || []).map((candidate) => (
          <div key={candidate._id} className="rank-row">
            <strong>#{candidate.rank}</strong>
            <span>{candidate.studentId?.name}</span>
            <span>{candidate.testScore}</span>
            <span>{candidate.timeTaken} min</span>
            <button className="secondary-button" onClick={() => onNavigate(`/business/jobs/${rankings.job._id}/team-selection`)}>View Team Fit</button>
          </div>
        ))}
      </section>
    </>
  );
}

function TeamSelectionScreen({ jobId, suggestions, onSelectTeam }) {
  if (!suggestions.length) return <EmptyState title="No team suggestions yet" text="Team suggestions appear for team-based jobs once ranked applications are available." />;
  return (
    <>
      <PageHeader title="Team Selection" subtitle="AI-style suggested team combinations based on skill complementarity." />
      <div className="list-stack">
        {suggestions.map((suggestion, index) => (
          <article key={`${jobId}-${index}`} className="panel-card team-card">
            <div className="card-row space-between">
              <div>
                <h3>Team {index + 1}</h3>
                <p>Overall Score: {suggestion.overallScore} · Complementarity: {suggestion.complementarity}</p>
              </div>
              <button className="primary-button small" onClick={() => onSelectTeam(jobId, suggestion.applicationIds)}>Select Team</button>
            </div>
            <div className="list-stack compact-gap">
              {suggestion.members.map((member) => (
                <div key={member.applicationId} className="rank-row simple">
                  <strong>{member.name}</strong>
                  <span>{member.roleLabel}</span>
                  <span>{member.testScore}</span>
                  <span>{member.matchedSkills.join(", ") || "Generalist"}</span>
                </div>
              ))}
            </div>
            <p className="muted-text">{suggestion.rationale}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function MessagesScreen({ role, inbox, activeConversation, onOpenConversation, onSendMessage }) {
  const [draft, setDraft] = useState("");
  const streamRef = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [activeConversation?.messages?.length]);

  function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendMessage(text);
    setDraft("");
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="Keep pre-hiring conversations moving before approvals and delivery." />
      <section className="messages-layout">
        <aside className="conversation-list">
          {inbox.length ? inbox.map((item) => (
            <button
              key={String(item.applicationId)}
              className={String(activeConversation?.application?._id) === String(item.applicationId) ? "conversation-item active" : "conversation-item"}
              onClick={() => onOpenConversation(item.applicationId, false)}
            >
              <strong>{item.counterpart}</strong>
              <span>{item.jobTitle}</span>
              <small>{item.preview}</small>
            </button>
          )) : <EmptyState title="No conversations yet" text={`Messages will appear once ${role === "student" ? "you apply to a job" : "students apply to your jobs"}.`} compact />}
        </aside>
        <div className="chat-panel">
          {activeConversation ? (
            <>
              <div className="chat-header">
                <strong>{activeConversation.application?.jobId?.title || "Conversation"}</strong>
                <span className={`status-pill ${activeConversation.application?.status || "pending"}`}>
                  {(activeConversation.application?.status || "pending").replace("_", " ")}
                </span>
              </div>
              <div className="chat-stream" ref={streamRef}>
                {(activeConversation.messages || []).map((message) => (
                  <div
                    key={message._id}
                    className={
                      message.senderRole === "system"
                        ? "chat-bubble system"
                        : message.senderRole === role
                        ? "chat-bubble outgoing"
                        : "chat-bubble incoming"
                    }
                  >
                    <strong>{message.senderName}</strong>
                    <p>{message.text}</p>
                    <small>{formatRelative(message.createdAt)}</small>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={submit}>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message and press Enter..."
                  autoComplete="off"
                />
                <button className="primary-button small" type="submit" disabled={!draft.trim()}>Send</button>
              </form>
            </>
          ) : (
            <EmptyState title="Select a conversation" text="Click any thread on the left to open the chat." />
          )}
        </div>
      </section>
    </>
  );
}

function ProfileEditor({ user, onSave }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    location: user?.location || "",
    bio: user?.bio || "",
    college: user?.college || "",
    skills: (user?.skills || []).join(", "),
    businessType: user?.businessType || ""
  });

  useEffect(() => {
    setForm({
      name: user?.name || "",
      phone: user?.phone || "",
      location: user?.location || "",
      bio: user?.bio || "",
      college: user?.college || "",
      skills: (user?.skills || []).join(", "),
      businessType: user?.businessType || ""
    });
  }, [user]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave(form);
  }

  return (
    <>
      <PageHeader title="Edit Profile" subtitle="Keep your profile current so recommendations and chat context stay useful." />
      <form className="panel-card profile-form" onSubmit={submit}>
        <Input label="Name" name="name" value={form.name} onChange={update} />
        <Input label="Phone" name="phone" value={form.phone} onChange={update} />
        <Input label="Location" name="location" value={form.location} onChange={update} />
        {user?.role === "student" && <Input label="College" name="college" value={form.college} onChange={update} />}
        {user?.role === "student" && <Input label="Skills" name="skills" value={form.skills} onChange={update} />}
        {user?.role === "business" && <Input label="Business Type" name="businessType" value={form.businessType} onChange={update} />}
        <Textarea label="Bio" name="bio" value={form.bio} onChange={update} />
        <button className="primary-button">Save Changes</button>
      </form>
    </>
  );
}

function PostJobForm({ onCreateJob, busy, compact = false }) {
  const [form, setForm] = useState({ title: "", description: "", budget: "", location: "", skills: "", teamBased: false });
  const [error, setError] = useState("");

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Job title is required."); return; }
    if (!form.description.trim()) { setError("Job description is required."); return; }
    const budget = Number(form.budget);
    if (!form.budget || isNaN(budget) || budget <= 0) { setError("Enter a valid budget amount."); return; }
    setError("");
    onCreateJob(form);
    if (!compact) setForm({ title: "", description: "", budget: "", location: "", skills: "", teamBased: false });
  }

  return (
    <form className="panel-card post-job-form" onSubmit={submit}>
      <h3>{compact ? "Quick Post" : "Post a New Job"}</h3>
      {error && <p className="form-error">{error}</p>}
      <Input label="Job Title" name="title" value={form.title} onChange={update} required={false} />
      <Textarea label="Job Description" name="description" value={form.description} onChange={update} required={false} />
      <div className="two-column compact-grid">
        <Input label="Budget (₹)" name="budget" type="number" min="1" value={form.budget} onChange={update} required={false} />
        <Input label="Location" name="location" value={form.location} onChange={update} required={false} />
      </div>
      <Input label="Required Skills" name="skills" value={form.skills} onChange={update} placeholder="React, TypeScript, Design" required={false} />
      <label className="checkbox-row"><input type="checkbox" name="teamBased" checked={form.teamBased} onChange={update} />Team-based project</label>
      <p className="helper-copy">Posting this job generates a simulated skill test based on the skills you provide.</p>
      <button className="primary-button" disabled={busy}>{busy ? "Posting..." : compact ? "Post Job" : "Post Job & Generate Test"}</button>
    </form>
  );
}

function PageHeader({ title, subtitle }) {
  return <header className="page-header"><div><h2>{title}</h2><p>{subtitle}</p></div></header>;
}
function HeroPanel({ title, text, actionLabel, actionPath, navigate }) {
  return (
    <section className="hero-panel">
      <h1>{title}</h1>
      <p>{text}</p>
      {actionLabel && actionPath && (
        <button className="secondary-button light-link" onClick={() => navigate && navigate(actionPath)}>{actionLabel}</button>
      )}
    </section>
  );
}
function StatsGrid({ items }) {
  return <section className="stats-grid">{items.map((item) => <article key={item.label} className="stat-card"><span>{item.label}</span><strong>{item.value}</strong></article>)}</section>;
}
function SectionTitle({ title }) { return <h3 className="section-title">{title}</h3>; }
function FeatureCard({ title, text }) { return <article className="feature-card"><span className="selector-icon">+</span><h3>{title}</h3><p>{text}</p></article>; }
function MetricCard({ value, label }) { return <div className="metric-card"><strong>{value}</strong><span>{label}</span></div>; }
function EmptyState({ title, text, compact = false }) { return <section className={compact ? "empty-state compact" : "empty-state"}><h3>{title}</h3><p>{text}</p></section>; }
function Input({ label, required = true, ...props }) { return <label className="field"><span>{label}</span><input required={required} {...props} /></label>; }
function Textarea({ label, required = false, ...props }) { return <label className="field"><span>{label}</span><textarea required={required} {...props} /></label>; }
function Select({ label, options, ...props }) { return <label className="field"><span>{label}</span><select {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }

