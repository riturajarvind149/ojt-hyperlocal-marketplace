
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
  const businessMatch = pathname.match(/^\/business\/jobs\/([^/]+)\/(rankings|team-selection|ai-rankings)$/);
  if (businessMatch) {
    return { screen: "business", section: businessMatch[2], jobId: businessMatch[1] };
  }
  // AI test route: /test/:jobId
  const testMatch = pathname.match(/^\/test\/([^/]+)$/);
  if (testMatch) return { screen: "test", section: "", jobId: testMatch[1] };

  if (pathname.startsWith("/student"))  return { screen: "student",  section: pathname.split("/")[2] || "dashboard" };
  if (pathname.startsWith("/business")) return { screen: "business", section: pathname.split("/")[2] || "dashboard" };
  if (pathname === "/choose-role")      return { screen: "choose-role",    section: "" };
  if (pathname === "/login")            return { screen: "login",          section: "" };
  if (pathname === "/register")         return { screen: "register",       section: "" };
  if (pathname === "/local-services")   return { screen: "local-services", section: "" };
  if (pathname.startsWith("/local-services/")) return { screen: "local-workers", section: pathname.split("/")[2] || "" };
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
      const result = await request("/jobs/apply", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ jobId })
      });
      await Promise.all([loadStudentApplications(), loadJobs(), loadInbox()]);
      if (result.hasAiTest) {
        showNotice("Applied! Complete the skill test to be ranked.");
        navigate(`/test/${jobId}`);
      } else {
        showNotice("Application sent! Your simulated skill test score has been recorded.");
        navigate("/student/applications");
      }
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function createJob(form) {
    setBusy(true);
    try {
      const result = await request("/jobs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          budget: Number(form.budget),
          location: form.location,
          skills: parseSkills(form.skills),
          teamBased: form.teamBased,
          isOffline: form.isOffline || false
        })
      });

      const newJobId = result.job?._id;

      // Auto-generate AI test if enabled
      if (form.enableTest && form.testTopic?.trim() && newJobId) {
        try {
          const testResult = await request("/ai/generate-test", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              jobId: newJobId,
              topic: form.testTopic.trim(),
              difficulty: form.testDifficulty || "medium",
              numberOfQuestions: Number(form.testQuestions) || 5
            })
          });
          showNotice(`Job posted! ${testResult.message}`);
        } catch (testErr) {
          showNotice("Job posted, but AI test generation failed: " + testErr.message, "error");
        }
      } else {
        showNotice("Job posted successfully!");
      }

      await Promise.all([loadJobs(), loadBusinessApplications()]);
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
      {route.screen === "home"           && <Home navigate={navigate} />}
      {route.screen === "test"           && <TestPage jobId={route.jobId} navigate={navigate} authHeaders={authHeaders} showNotice={showNotice} />}
      {route.screen === "local-services" && <LocalServicesPage navigate={navigate} />}
      {route.screen === "local-workers"  && <LocalWorkersPage category={route.section} navigate={navigate} />}
      {route.screen === "choose-role"    && <RoleChoice roleChoice={roleChoice} setRoleChoice={setRoleChoice} navigate={navigate} />}
      {route.screen === "login"          && <AuthCard mode="login"    role={roleChoice} navigate={navigate} onSubmit={handleLogin} />}
      {route.screen === "register"       && <AuthCard mode="register" role={roleChoice} navigate={navigate} onSubmit={handleRegister} />}
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

// ─── CATEGORY DATA ────────────────────────────────────────────────
const CATEGORIES = [
  { id: "ai",          icon: "🤖", label: "AI Services",          count: "320+ jobs" },
  { id: "development", icon: "💻", label: "Development & IT",      count: "1.2k jobs" },
  { id: "design",      icon: "🎨", label: "Design & Creative",     count: "480 jobs"  },
  { id: "marketing",   icon: "📣", label: "Marketing",             count: "390 jobs"  },
  { id: "writing",     icon: "✍️",  label: "Writing & Translation", count: "210 jobs"  },
  { id: "finance",     icon: "💰", label: "Finance",               count: "140 jobs"  },
  { id: "legal",       icon: "⚖️",  label: "Legal",                 count: "90 jobs"   },
  { id: "engineering", icon: "🔧", label: "Engineering",           count: "260 jobs"  },
  { id: "business",    icon: "📊", label: "Business Support",      count: "310 jobs"  },
  { id: "local",       icon: "📍", label: "Local Services",        count: "Nearby",   isLocal: true },
];

const LOCAL_SERVICES = [
  { id: "maid",        icon: "🧹", label: "Maid",          desc: "Daily / weekly cleaning" },
  { id: "cook",        icon: "👨‍🍳", label: "Cook",          desc: "Home-cooked meals" },
  { id: "cleaning",    icon: "🏠", label: "Home Cleaning",  desc: "Deep clean service" },
  { id: "electrician", icon: "⚡", label: "Electrician",    desc: "Wiring & repairs" },
  { id: "plumber",     icon: "🔩", label: "Plumber",        desc: "Pipe & tap fixes" },
  { id: "carpenter",   icon: "🪚", label: "Carpenter",      desc: "Furniture & woodwork" },
  { id: "babysitter",  icon: "👶", label: "Babysitter",     desc: "Trusted childcare" },
  { id: "driver",      icon: "🚗", label: "Driver",         desc: "Local trips & errands" },
];

// Simulated local workers data
const MOCK_WORKERS = {
  maid:        [{ name: "Sunita D.", rating: 4.8, price: "₹400/day", dist: "1.2 km", avail: "Available Today" }, { name: "Rekha M.", rating: 4.6, price: "₹350/day", dist: "2.1 km", avail: "Available Tomorrow" }, { name: "Kavitha R.", rating: 4.9, price: "₹450/day", dist: "0.8 km", avail: "Available Today" }],
  cook:        [{ name: "Ramesh K.", rating: 4.7, price: "₹500/day", dist: "1.5 km", avail: "Available Today" }, { name: "Meena S.", rating: 4.5, price: "₹420/day", dist: "3.0 km", avail: "Available Today" }],
  cleaning:    [{ name: "CleanPro Team", rating: 4.9, price: "₹800/visit", dist: "2.4 km", avail: "Available Today" }, { name: "Sparkle Services", rating: 4.7, price: "₹650/visit", dist: "1.8 km", avail: "Available Tomorrow" }],
  electrician: [{ name: "Vijay E.", rating: 4.8, price: "₹300/hr", dist: "0.9 km", avail: "Available Today" }, { name: "Raju Electricals", rating: 4.6, price: "₹250/hr", dist: "2.2 km", avail: "Available Today" }],
  plumber:     [{ name: "Suresh P.", rating: 4.7, price: "₹280/hr", dist: "1.1 km", avail: "Available Today" }, { name: "Quick Fix Plumbing", rating: 4.5, price: "₹320/hr", dist: "3.5 km", avail: "Available Tomorrow" }],
  carpenter:   [{ name: "Mohan C.", rating: 4.6, price: "₹400/hr", dist: "2.0 km", avail: "Available Today" }],
  babysitter:  [{ name: "Priya N.", rating: 4.9, price: "₹250/hr", dist: "0.7 km", avail: "Available Today" }, { name: "Anita B.", rating: 4.8, price: "₹220/hr", dist: "1.4 km", avail: "Available Today" }],
  driver:      [{ name: "Arun D.", rating: 4.7, price: "₹200/hr", dist: "1.0 km", avail: "Available Today" }, { name: "Sanjay V.", rating: 4.5, price: "₹180/hr", dist: "2.8 km", avail: "Available Tomorrow" }],
};

// ─── INTENT MODAL ─────────────────────────────────────────────────
function IntentModal({ category, onClose, onHire, onWork }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{category.icon} {category.label}</h2>
        <p>What do you want to do in this field?</p>
        <div className="modal-options">
          <button className="modal-option" onClick={onHire}>
            <span className="opt-icon">🏢</span>
            <div>
              <strong>Hire Talent</strong>
              <small>Post a job and find skilled freelancers</small>
            </div>
          </button>
          <button className="modal-option" onClick={onWork}>
            <span className="opt-icon">🎓</span>
            <div>
              <strong>Find Work</strong>
              <small>Browse jobs and apply as a student or freelancer</small>
            </div>
          </button>
        </div>
        <button className="modal-close" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─── HOME PAGE ─────────────────────────────────────────────────────
function Home({ navigate }) {
  const [activeCategory, setActiveCategory] = useState(null);

  function handleCategoryClick(cat) {
    if (cat.isLocal) { navigate("/local-services"); return; }
    setActiveCategory(cat);
  }

  return (
    <div className="marketing-page">
      {/* Topbar */}
      <header className="marketing-topbar">
        <Logo navigate={navigate} />
        <nav>
          <button className="ghost-button" onClick={() => navigate("/login")}>Log In</button>
          <button className="primary-button small" onClick={() => navigate("/choose-role")}>Get Started</button>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="hero-card">
          <span className="eyebrow">Hyperlocal Talent & Services Platform</span>
          <h1>Find work, hire talent, or book local services — all in one place.</h1>
          <p>LocalHire connects businesses with skilled students, freelancers with real opportunities, and households with trusted local workers — powered by AI-simulated skill testing.</p>
          <div className="hero-cta-row">
            <button className="cta-hire"  onClick={() => navigate("/choose-role")}>🏢 Hire Talent</button>
            <button className="cta-work"  onClick={() => navigate("/choose-role")}>🎓 Find Work</button>
            <button className="cta-local" onClick={() => navigate("/local-services")}>📍 Explore Local Services</button>
          </div>
        </section>

        {/* Category Grid */}
        <section className="category-section">
          <h2>Browse by Field</h2>
          <p>Click any category to hire talent, find work, or book a local service.</p>
          <div className="category-grid">
            {CATEGORIES.map((cat) => (
              <button key={cat.id} className={`category-card${cat.isLocal ? " local" : ""}`} onClick={() => handleCategoryClick(cat)}>
                <span className="cat-icon">{cat.icon}</span>
                <span className="cat-label">{cat.label}</span>
                <span className="cat-count">{cat.count}</span>
              </button>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <SectionTitle title="How it works" />
          <div className="how-strip">
            <div className="how-card">
              <div className="step">01</div>
              <h4>Choose your field</h4>
              <p>Pick from 9 digital categories or browse local services near you.</p>
            </div>
            <div className="how-card">
              <div className="step">02</div>
              <h4>Select your intent</h4>
              <p>Hire talent, find work, or book a local worker — same platform, different flows.</p>
            </div>
            <div className="how-card">
              <div className="step">03</div>
              <h4>Get matched instantly</h4>
              <p>AI-simulated skill tests rank candidates. Local workers show availability and distance.</p>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="metrics-strip">
          <MetricCard value="2,500+" label="Active Students" />
          <MetricCard value="450+"   label="Businesses" />
          <MetricCard value="1,200+" label="Jobs Posted" />
          <MetricCard value="800+"   label="Local Workers" />
        </section>

        {/* CTA */}
        <section className="cta-panel">
          <h2>Ready to get started?</h2>
          <p>Join students, businesses, and local workers already using LocalHire.</p>
          <div className="button-row center">
            <button className="secondary-button inverted"    onClick={() => navigate("/choose-role")}>I&apos;m a Student</button>
            <button className="primary-button inverted-light" onClick={() => navigate("/choose-role")}>I&apos;m a Business</button>
            <button className="cta-local" style={{ padding: "12px 22px" }} onClick={() => navigate("/local-services")}>Book Local Service</button>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div>
          <strong>LocalHire</strong>
          <p>Talent, freelance work, and local services — all in one place.</p>
        </div>
        <div className="footer-links">
          <span>Browse Jobs</span>
          <span>Hire Talent</span>
          <span>Local Services</span>
          <span>How it Works</span>
        </div>
      </footer>

      {/* Intent Modal */}
      {activeCategory && (
        <IntentModal
          category={activeCategory}
          onClose={() => setActiveCategory(null)}
          onHire={() => { setActiveCategory(null); navigate("/choose-role"); }}
          onWork={() => { setActiveCategory(null); navigate("/choose-role"); }}
        />
      )}
    </div>
  );
}

// ─── LOCAL SERVICES PAGE ───────────────────────────────────────────
function LocalServicesPage({ navigate }) {
  return (
    <div className="local-services-page">
      <header className="marketing-topbar">
        <Logo navigate={navigate} />
        <nav>
          <button className="ghost-button" onClick={() => navigate("/login")}>Log In</button>
          <button className="primary-button small" onClick={() => navigate("/choose-role")}>Get Started</button>
        </nav>
      </header>
      <button className="local-back" onClick={() => navigate("/")}>← Back to Home</button>
      <span className="eyebrow green">Nearby & Available</span>
      <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", margin: "10px 0 6px" }}>Book a Local Service</h1>
      <p style={{ color: "#665f55", marginBottom: 0 }}>Trusted workers near you — verified, rated, and available today.</p>
      <div className="local-grid">
        {LOCAL_SERVICES.map((svc) => (
          <button key={svc.id} className="local-card" onClick={() => navigate(`/local-services/${svc.id}`)}>
            <span className="local-icon">{svc.icon}</span>
            <span className="local-label">{svc.label}</span>
            <span className="local-desc">{svc.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── LOCAL WORKERS LISTING PAGE ────────────────────────────────────
function LocalWorkersPage({ category, navigate }) {
  const [sortBy, setSortBy] = useState("distance");
  const svc = LOCAL_SERVICES.find((s) => s.id === category);
  const workers = MOCK_WORKERS[category] || [];

  const sorted = [...workers].sort((a, b) => {
    if (sortBy === "rating")   return b.rating - a.rating;
    if (sortBy === "price")    return parseInt(a.price) - parseInt(b.price);
    return parseFloat(a.dist) - parseFloat(b.dist);
  });

  return (
    <div className="worker-listing-page">
      <header className="marketing-topbar">
        <Logo navigate={navigate} />
        <nav>
          <button className="ghost-button" onClick={() => navigate("/login")}>Log In</button>
          <button className="primary-button small" onClick={() => navigate("/choose-role")}>Get Started</button>
        </nav>
      </header>
      <button className="local-back" onClick={() => navigate("/local-services")}>← Back to Local Services</button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: "2rem" }}>{svc?.icon}</span>
        <div>
          <h2 style={{ margin: 0 }}>{svc?.label || category} Workers</h2>
          <p style={{ margin: 0, color: "#665f55", fontSize: "0.9rem" }}>{sorted.length} workers available near you</p>
        </div>
      </div>

      <div className="worker-filters">
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Sort by:</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="distance">Distance</option>
          <option value="rating">Rating</option>
          <option value="price">Price</option>
        </select>
        <span className="chip neutral">📍 Bangalore</span>
        <span className="chip accent">✅ Verified Only</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No workers found" text="Try a different category or check back later." />
      ) : (
        <div className="worker-grid">
          {sorted.map((w, i) => (
            <div key={i} className="worker-card">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="worker-avatar">{w.name[0]}</div>
                <div>
                  <div className="worker-name">{w.name}</div>
                  <div className="worker-meta">⭐ {w.rating} · {w.dist}</div>
                </div>
              </div>
              <div className="worker-price">{w.price}</div>
              <span className={`worker-badge ${w.avail.includes("Today") ? "" : "pending"}`}>
                {w.avail.includes("Today") ? "🟢" : "🟡"} {w.avail}
              </span>
              <button className="book-btn" onClick={() => alert(`Booking request sent to ${w.name}!\nFeature coming soon.`)}>
                Book Now
              </button>
            </div>
          ))}
        </div>
      )}
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
  if (route.section === "applications") return <StudentApplications applications={applications} onOpenConversation={onOpenConversation} navigate={navigate} />;
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
      <StudentApplications applications={applications.slice(0, 4)} onOpenConversation={onOpenConversation} navigate={navigate} compact />
    </>
  );
}

function BusinessArea({ route, user, jobs, applications, inbox, activeConversation, rankings, teamSuggestions, onCreateJob, onUpdateStatus, onOpenConversation, onSendMessage, onSaveProfile, onNavigate, onSelectTeam, onDeleteJob, busy }) {
  const ownJobs = jobs.filter((job) => {
    const jobBusinessId = String(job.businessId?._id || job.businessId || "");
    const userId = String(user?.id || "");
    return jobBusinessId === userId && jobBusinessId !== "";
  });
  const pendingApplications = applications.filter((app) => app.status === "pending" || app.status === "test_pending").length;
  const inProgressJobs = ownJobs.filter((job) => job.status === "in_progress").length;
  const hiredCount = applications.filter((app) => ["approved", "in_progress", "completed"].includes(app.status)).length;

  if (route.section === "post-job") return <PostJobForm onCreateJob={onCreateJob} busy={busy} />;
  if (route.section === "jobs") return <BusinessJobs jobs={ownJobs} onNavigate={onNavigate} onDeleteJob={onDeleteJob} busy={busy} />;
  if (route.section === "applications") return <BusinessApplications applications={applications} onUpdateStatus={onUpdateStatus} onOpenConversation={onOpenConversation} busy={busy} />;
  if (route.section === "messages") return <MessagesScreen role="business" inbox={inbox} activeConversation={activeConversation} onOpenConversation={onOpenConversation} onSendMessage={onSendMessage} />;
  if (route.section === "profile") return <ProfileEditor user={user} onSave={onSaveProfile} />;
  if (route.section === "rankings") return <RankingsScreen rankings={rankings} onNavigate={onNavigate} onUpdateStatus={onUpdateStatus} busy={busy} />;
  if (route.section === "ai-rankings") return <AiRankingsScreen jobId={route.jobId} onNavigate={onNavigate} />;
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
                {job.isOffline && <span className="offline-badge">📍 On-site</span>}
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

function StudentApplications({ applications, onOpenConversation, navigate, compact = false }) {
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
                <strong>{application.finalScore || application.testScore || 0}</strong>
                <span>{application.testSubmitted ? "Final Score" : "Sim. Score"}</span>
              </div>
            </div>
            <div className="stats-inline">
              <span className={`status-pill ${application.status}`}>{(application.status || "pending").replace("_", " ")}</span>
              {application.testSubmitted
                ? <span>Real Test: {application.realTestScore || 0}%</span>
                : <span>Skill Match: {application.skillMatchScore || 0}%</span>
              }
              <span>Time: {application.timeTaken || 0} min</span>
            </div>
            <p className="muted-text">{application.notes || "Structured review in progress."}</p>
          </div>
          {!compact && (
            <div className="button-row">
              {application.status === "test_pending" && navigate && (
                <button className="primary-button small" onClick={() => navigate(`/test/${application.jobId?._id}`)}>
                  🎯 Take Test
                </button>
              )}
              <button className="secondary-button" onClick={() => onOpenConversation(application._id)}>Message Employer</button>
            </div>
          )}
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span className={`status-pill ${job.status}`}>{job.status.replace("_", " ")}</span>
              {job.aiTest?.generated && <span className="chip accent" style={{ fontSize: "0.75rem" }}>🤖 AI Test Ready</span>}
            </div>
          </div>
          <div className="chip-wrap">
            {(job.skills || []).map((skill) => <span key={skill} className="chip neutral">{skill}</span>)}
            {job.teamBased && <span className="chip accent">Team Based</span>}
            {job.isOffline && <span className="offline-badge">📍 Offline</span>}
          </div>
          {!compact && (
            <div className="button-row wrap">
              <button className="secondary-button" onClick={() => onNavigate(`/business/jobs/${job._id}/rankings`)}>View Rankings</button>
              <button className="secondary-button" onClick={() => onNavigate(`/business/jobs/${job._id}/ai-rankings`)}>🏆 AI Rankings</button>
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
function RankingsScreen({ rankings, onNavigate, onUpdateStatus, busy }) {
  if (!rankings) return <EmptyState title="Loading rankings" text="Fetching ranked candidates for this job." />;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <>
      <PageHeader title="Test Results & Rankings" subtitle={`${rankings.job?.title} — candidate leaderboard`} />

      {/* Podium */}
      {rankings.topPerformers?.length > 0 && (
        <div className="podium-grid">
          {rankings.topPerformers.map((candidate, index) => (
            <div key={candidate._id} className="podium-card">
              <div style={{ fontSize: "2rem" }}>{medals[index] || "🎖️"}</div>
              <span className="avatar-circle large">{initials(candidate.studentId?.name)}</span>
              <strong>{candidate.studentId?.name || "Student"}</strong>
              <div style={{ fontSize: "1.4rem", fontWeight: 900, margin: "4px 0" }}>{candidate.testScore || 0}</div>
              <small style={{ color: "#888" }}>{candidate.timeTaken || 0} min</small>
              <span className={`status-pill ${candidate.status}`} style={{ marginTop: 8 }}>{(candidate.status || "pending").replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Full table */}
      <section className="panel-card rankings-table">
        {!(rankings.candidates?.length) && <EmptyState title="No applicants yet" text="Rankings appear once students apply." compact />}
        {(rankings.candidates || []).map((candidate) => {
          const isDone = ["approved", "rejected", "in_progress", "completed"].includes(candidate.status);
          return (
            <div key={candidate._id} className="rank-row">
              <strong style={{ fontSize: "1.1rem" }}>#{candidate.rank}</strong>
              <div>
                <strong>{candidate.studentId?.name || "Student"}</strong>
                <div className="stats-inline" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                  <span>Score: {candidate.testScore || 0}</span>
                  <span>Time: {candidate.timeTaken || 0}m</span>
                  <span>Rank: {candidate.rankingScore || 0}</span>
                </div>
                <div className="chip-wrap" style={{ marginTop: 4 }}>
                  {(candidate.matchedSkills || []).map(s => <span key={s} className="chip neutral" style={{ fontSize: "0.72rem", padding: "4px 8px" }}>{s}</span>)}
                </div>
              </div>
              <span className={`status-pill ${candidate.status || "pending"}`}>{(candidate.status || "pending").replace("_", " ")}</span>
              <div className="rank-actions">
                {!isDone && onUpdateStatus && (
                  <>
                    <button className="accept-btn" disabled={busy} onClick={() => onUpdateStatus(candidate._id, "approved")}>✓ Accept</button>
                    <button className="reject-btn" disabled={busy} onClick={() => onUpdateStatus(candidate._id, "rejected")}>✕ Reject</button>
                  </>
                )}
                <button className="secondary-button" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => onNavigate(`/business/jobs/${rankings.job._id}/team-selection`)}>Team Fit</button>
              </div>
            </div>
          );
        })}
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
  const [form, setForm] = useState({
    title: "", description: "", budget: "", location: "", skills: "",
    teamBased: false, isOffline: false,
    enableTest: false, testTopic: "", testDifficulty: "medium", testQuestions: "5"
  });
  const [error, setError] = useState("");

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!form.title.trim())       { setError("Job title is required."); return; }
    if (!form.description.trim()) { setError("Job description is required."); return; }
    const budget = Number(form.budget);
    if (!form.budget || isNaN(budget) || budget <= 0) { setError("Enter a valid budget amount."); return; }
    if (form.enableTest && !form.testTopic.trim()) { setError("Enter a test topic or leave 'Enable Test' unchecked."); return; }
    setError("");
    onCreateJob(form);
    if (!compact) setForm({ title: "", description: "", budget: "", location: "", skills: "", teamBased: false, isOffline: false, enableTest: false, testTopic: "", testDifficulty: "medium", testQuestions: "5" });
  }

  if (compact) {
    return (
      <form className="panel-card post-job-form" onSubmit={submit}>
        <h3>Quick Post</h3>
        {error && <p className="form-error">{error}</p>}
        <Input label="Job Title" name="title" value={form.title} onChange={update} required={false} />
        <div className="two-column compact-grid">
          <Input label="Budget (₹)" name="budget" type="number" min="1" value={form.budget} onChange={update} required={false} />
          <Input label="Location" name="location" value={form.location} onChange={update} required={false} />
        </div>
        <Input label="Required Skills" name="skills" value={form.skills} onChange={update} placeholder="React, Design" required={false} />
        <button className="primary-button" disabled={busy}>{busy ? "Posting..." : "Post Job"}</button>
      </form>
    );
  }

  return (
    <form className="panel-card post-job-form" onSubmit={submit}>
      <h3>Post a New Job</h3>
      {error && <p className="form-error">{error}</p>}

      {/* ── Basic Info ── */}
      <Input label="Job Title" name="title" value={form.title} onChange={update} required={false} />
      <Textarea label="Job Description" name="description" value={form.description} onChange={update} required={false} />
      <div className="two-column compact-grid">
        <Input label="Budget (₹)" name="budget" type="number" min="1" value={form.budget} onChange={update} required={false} />
        <Input label="Location" name="location" value={form.location} onChange={update} required={false} />
      </div>
      <Input label="Required Skills" name="skills" value={form.skills} onChange={update} placeholder="React, TypeScript, Design" required={false} />

      {/* ── Job Options ── */}
      <hr className="form-section-divider" />
      <p className="form-section-title">Job Options</p>
      <label className="checkbox-row">
        <input type="checkbox" name="teamBased" checked={form.teamBased} onChange={update} />
        Team-based project (multiple students)
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="isOffline" checked={form.isOffline} onChange={update} />
        📍 Need offline / on-site worker
        {form.isOffline && <span className="offline-badge" style={{ marginLeft: 8 }}>Offline Job</span>}
      </label>
      {form.isOffline && (
        <p className="helper-copy" style={{ marginTop: -6 }}>
          Offline jobs will be visible to local workers near the location you specified above.
        </p>
      )}

      {/* ── AI Test Configuration ── */}
      <hr className="form-section-divider" />
      <p className="form-section-title">🤖 AI Skill Test</p>
      <label className="checkbox-row">
        <input type="checkbox" name="enableTest" checked={form.enableTest} onChange={update} />
        Enable AI-generated skill test for applicants
      </label>
      {form.enableTest && (
        <>
          <Input
            label="Test Topic"
            name="testTopic"
            value={form.testTopic}
            onChange={update}
            placeholder={form.skills ? form.skills.split(",")[0].trim() : "e.g. React, Mathematics, Marketing"}
            required={false}
          />
          <div className="test-config-grid">
            <div className="field">
              <span>Difficulty</span>
              <select name="testDifficulty" value={form.testDifficulty} onChange={update}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="field">
              <span>Questions</span>
              <select name="testQuestions" value={form.testQuestions} onChange={update}>
                {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} questions</option>)}
              </select>
            </div>
            <div className="field">
              <span>Type</span>
              <select disabled>
                <option>MCQ</option>
              </select>
            </div>
          </div>
          <p className="helper-copy">
            The AI test will be auto-generated when you post the job. Students must complete it before being ranked.
          </p>
        </>
      )}

      <button className="primary-button" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Posting..." : form.enableTest ? "Post Job & Generate AI Test" : "Post Job"}
      </button>
    </form>
  );
}

// ─── AI TEST PAGE ─────────────────────────────────────────────────
function TestPage({ jobId, navigate, authHeaders, showNotice }) {
  const [testData, setTestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [tabWarnings, setTabWarnings] = useState(0);
  const timerRef = useRef(null);

  // Fetch test
  useEffect(() => {
    async function fetchTest() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/ai/test/${jobId}`, {
          headers: { "Content-Type": "application/json", ...authHeaders() }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        setTestData(data);
        setTimeLeft(data.timeLimit * 60);
      } catch (e) {
        showNotice(e.message, "error");
        navigate("/student/applications");
      } finally {
        setLoading(false);
      }
    }
    fetchTest();
  }, [jobId]);

  // Timer
  useEffect(() => {
    if (!testData || submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [testData, submitted]);

  // Anti-cheat: tab switch detection
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && !submitted) {
        setTabWarnings((w) => {
          const next = w + 1;
          if (next >= 3) { handleSubmit(true); }
          return next;
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [submitted]);

  // Anti-cheat: disable right click
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  async function handleSubmit(autoSubmit = false) {
    if (submitted) return;
    clearInterval(timerRef.current);
    setSubmitted(true);

    const timeTakenMinutes = testData
      ? Math.round((testData.timeLimit * 60 - timeLeft) / 60)
      : 0;

    const answersArray = Object.entries(answers).map(([idx, selected]) => ({
      questionIndex: Number(idx),
      selected
    }));

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/ai/test/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, answers: answersArray, timeTakenMinutes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data.result);
    } catch (e) {
      showNotice(e.message, "error");
    }
  }

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");
  const timerClass = timeLeft < 60 ? "test-timer danger" : timeLeft < 180 ? "test-timer warning" : "test-timer";

  if (loading) return <main className="loading-screen" style={{ background: "#0d0d0d", color: "#fff" }}>Loading test...</main>;

  if (result) {
    const pct = result.finalScore || 0;
    return (
      <div className="result-shell">
        <div className="result-card">
          <h2 style={{ marginBottom: 6 }}>Test Complete 🎉</h2>
          <p style={{ color: "#888", marginBottom: 24 }}>{testData?.jobTitle}</p>
          <div className="result-score-ring" style={{ "--pct": `${pct * 3.6}deg` }}>
            <span className="result-score-num">{pct}</span>
          </div>
          <p style={{ color: "#888", marginBottom: 0 }}>Final Score</p>
          <div className="result-breakdown">
            <div className="result-stat">
              <strong>{result.realTestScore}%</strong>
              <span>Test Score</span>
            </div>
            <div className="result-stat">
              <strong>{result.skillMatchScore}%</strong>
              <span>Skill Match</span>
            </div>
            <div className="result-stat">
              <strong>{result.correctAnswers}/{result.totalQuestions}</strong>
              <span>Correct</span>
            </div>
          </div>
          <p style={{ color: "#888", fontSize: "0.85rem", marginBottom: 20 }}>
            Time taken: {result.timeTakenMinutes} min · Formula: (Test×0.6) + (Skills×0.3) − (Time×0.1)
          </p>
          <button className="result-back-btn" onClick={() => navigate("/student/applications")}>
            Back to My Applications
          </button>
        </div>
      </div>
    );
  }

  const q = testData?.questions?.[current];
  const total = testData?.questions?.length || 0;
  const letters = ["A", "B", "C", "D", "E"];

  return (
    <div className="test-shell">
      {/* Topbar */}
      <div className="test-topbar">
        <div>
          <h2>🎯 {testData?.jobTitle}</h2>
          {tabWarnings > 0 && <small style={{ color: "#f59e0b" }}>⚠️ Tab switch warning {tabWarnings}/3</small>}
        </div>
        <div className={timerClass}>{mins}:{secs}</div>
      </div>

      {/* Progress bar */}
      <div className="test-progress-bar">
        <div className="test-progress-fill" style={{ width: `${((current + 1) / total) * 100}%` }} />
      </div>

      {/* Question */}
      <div className="test-body">
        <div className="test-card">
          <div className="test-q-meta">
            <span className="test-q-num">Question {current + 1} of {total}</span>
            <div className="test-dot-nav">
              {testData.questions.map((_, i) => (
                <div
                  key={i}
                  className={`test-dot ${answers[i] ? "answered" : ""} ${i === current ? "current" : ""}`}
                  onClick={() => setCurrent(i)}
                />
              ))}
            </div>
          </div>

          <p className="test-q-text">{q?.question}</p>

          <div className="test-options">
            {(q?.options || []).map((opt, i) => (
              <button
                key={i}
                className={`test-option ${answers[current] === opt ? "selected" : ""}`}
                onClick={() => setAnswers((prev) => ({ ...prev, [current]: opt }))}
              >
                <span className="opt-letter">{letters[i]}</span>
                {opt}
              </button>
            ))}
          </div>

          <div className="test-nav">
            <button className="test-nav-btn" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>← Previous</button>
            <span style={{ color: "#888", fontSize: "0.85rem" }}>{Object.keys(answers).length}/{total} answered</span>
            {current < total - 1
              ? <button className="test-nav-btn" onClick={() => setCurrent((c) => c + 1)}>Next →</button>
              : <button className="test-submit-btn" onClick={() => handleSubmit(false)}>Submit Test ✓</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI RANKINGS SCREEN ────────────────────────────────────────────
function AiRankingsScreen({ jobId, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/ai/rankings/${jobId}`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setData(json);
      } catch (e) {
        setData({ error: e.message });
      } finally {
        setLoading(false);
      }
    }
    if (jobId) load();
  }, [jobId]);

  if (loading) return <EmptyState title="Loading AI Rankings..." text="Fetching hybrid scores." />;
  if (data?.error) return <EmptyState title="No AI Rankings Yet" text={data.error} />;
  if (!data?.rankings?.length) return <EmptyState title="No submissions yet" text="Rankings appear after students complete the AI test." />;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <>
      <PageHeader title="🏆 AI Hybrid Rankings" subtitle={`${data.job?.title} · ${data.totalSubmissions} submissions`} />

      {/* Top 3 podium */}
      <div className="podium-grid" style={{ marginBottom: 20 }}>
        {data.topPerformers.map((c, i) => (
          <div key={c.applicationId} className="podium-card">
            <div style={{ fontSize: "2rem" }}>{medals[i] || "🎖️"}</div>
            <span className="avatar-circle large">{initials(c.student.name)}</span>
            <strong>{c.student.name}</strong>
            <div style={{ fontSize: "1.6rem", fontWeight: 900 }}>{c.scores.finalScore}</div>
            <small>Final Score</small>
          </div>
        ))}
      </div>

      {/* Full table */}
      <section className="panel-card rankings-table">
        <div className="ai-rank-row" style={{ fontWeight: 700, fontSize: "0.8rem", color: "#888", borderBottom: "2px solid rgba(17,17,17,.1)" }}>
          <span>Rank</span><span>Student</span><span>Final</span><span>Test</span><span>Skills</span><span>Time</span>
        </div>
        {data.rankings.map((c) => (
          <div key={c.applicationId} className="ai-rank-row">
            <span className="ai-rank-medal">{medals[c.rank - 1] || `#${c.rank}`}</span>
            <div>
              <strong>{c.student.name}</strong>
              <div className="score-bar-wrap">
                <div className="score-bar-fill" style={{ width: `${c.scores.finalScore}%` }} />
              </div>
              <small style={{ color: "#888" }}>{(c.matchedSkills || []).join(", ") || "No skill match"}</small>
            </div>
            <strong>{c.scores.finalScore}</strong>
            <span>{c.scores.realTestScore}%</span>
            <span>{c.scores.skillMatchScore}%</span>
            <span>{c.scores.timeTaken}m</span>
          </div>
        ))}
      </section>

      <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(255,255,255,.6)", borderRadius: 14, fontSize: "0.82rem", color: "#665f55" }}>
        Formula: <strong>Final Score = (Test × 0.6) + (Skill Match × 0.3) − (Time × 0.1)</strong>
      </div>
    </>
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

