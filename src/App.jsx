import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  User,
  Users,
  Building2,
  Mail,
  Phone,
  Lightbulb,
  FileText,
  Plus,
  X,
  Sprout,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Download,
  Share2,
  Clock,
  Check,
  Send,
  Pencil,
  Home as HomeIcon,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

/**
 * Farm Fusion AI — Registration Portal
 * -------------------------------------------------
 * Restructured (v5) to a two-page format:
 *   1. HOME — hero + live seat availability + registration progress,
 *      "Register Now" gate (disabled once seats are full).
 *   2. REGISTRATION DESK — a single scrolling page broken into clearly
 *      labelled sections (Team Name / Leader Details / Team Members /
 *      Project / Review) instead of a click-through step wizard.
 *
 * All original functionality is preserved as-is:
 *  - Team Name / Leader Name letters-only validation
 *  - Phone / Alternate phone exactly-10-digit validation
 *  - Email regex validation
 *  - Live team-name availability check (simulated)
 *  - Invite-by-email or add-manually team members, skills chips
 *  - Project details
 *  - Review + terms acceptance
 *  - Success ticket with QR code encoding full team/project info,
 *    canvas-rendered PNG download, and native share
 *
 * Backend hook points are marked with  // BACKEND:  comments.
 * Nothing here uses localStorage/sessionStorage.
 */

const SKILLS = ["AI/ML", "Frontend", "Backend", "UI/UX", "Hardware/IoT", "Data Science", "Mobile", "DevOps"];
const MAX_MEMBERS = 6; // includes leader
const REGISTRATION_DEADLINE = new Date("2026-08-15T23:59:59");
const TEAM_CAPACITY = 150; // BACKEND: fetch real capacity on mount

// Validation regexes
const NAME_REGEX = /^[A-Za-z\s]+$/; // letters and spaces only
const PHONE_REGEX = /^\d{10}$/; // exactly 10 digits
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// Small canvas helper — draws a rounded rectangle path (used by the ticket export).
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function getTimeLeft() {
  const diff = REGISTRATION_DEADLINE - new Date();
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, closed: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return { days, hours, mins, closed: false };
}

export default function FarmFusionRegistrationForm() {
  const [page, setPage] = useState("home"); // home | register
  const [team, setTeam] = useState({ teamName: "", leaderName: "", college: "", email: "", phone: "", altPhone: "" });
  const [members, setMembers] = useState([]); // additional members beyond the leader
  const [project, setProject] = useState({ title: "", problem: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [teamId, setTeamId] = useState(null);
  const [nameCheck, setNameCheck] = useState({ status: "idle", message: "" }); // idle | checking | ok | taken
  const [registeredCount, setRegisteredCount] = useState(128); // BACKEND: fetch real count on mount
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(getTimeLeft()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (team.teamName.trim().length >= 3 && !teamId) {
      const code = Math.floor(1000 + Math.random() * 9000);
      setTeamId(`FFAI-2026-${code}`);
    }
  }, [team.teamName, teamId]);

  // BACKEND: replace the setTimeout body with `fetch('/api/teams/check-name?name=...')`
  useEffect(() => {
    if (!team.teamName.trim()) {
      setNameCheck({ status: "idle", message: "" });
      return;
    }
    setNameCheck({ status: "checking", message: "Checking availability…" });
    const t = setTimeout(() => {
      const taken = ["greenbytes", "agrisense"].includes(team.teamName.trim().toLowerCase());
      setNameCheck(
        taken
          ? { status: "taken", message: "This team name is already registered" }
          : { status: "ok", message: "Team name is available" }
      );
    }, 500);
    return () => clearTimeout(t);
  }, [team.teamName]);

  const leaderMember = useMemo(
    () => ({ id: "leader", name: team.leaderName, email: team.email, role: "Team Leader", skills: [], isLeader: true }),
    [team.leaderName, team.email]
  );
  const allMembers = [leaderMember, ...members];

  const seatsLeft = Math.max(TEAM_CAPACITY - registeredCount, 0);
  const isFull = seatsLeft <= 0 || timeLeft.closed;

  const updateTeam = (field) => (e) => setTeam((t) => ({ ...t, [field]: e.target.value }));
  const updateProject = (field) => (e) => setProject((p) => ({ ...p, [field]: e.target.value }));

  const addMember = (mode) => {
    if (allMembers.length >= MAX_MEMBERS) return;
    setMembers((m) => [...m, { id: uid(), mode, name: "", email: "", role: "", skills: [], invited: false }]);
  };
  const removeMember = (id) => setMembers((m) => m.filter((x) => x.id !== id));
  const updateMember = (id, field) => (e) =>
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, [field]: e.target.value } : x)));
  const toggleSkill = (id, skill) =>
    setMembers((m) =>
      m.map((x) =>
        x.id === id ? { ...x, skills: x.skills.includes(skill) ? x.skills.filter((s) => s !== skill) : [...x.skills, skill] } : x
      )
    );
  const sendInvite = (id) => {
    // BACKEND: fetch('/api/invite', { method:'POST', body: JSON.stringify({ email, teamId }) })
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, invited: true } : x)));
  };

  // Validates every section at once (the page is now one continuous scroll
  // instead of a click-through wizard), and returns the first section with
  // an error so the caller can scroll to it.
  const validateAll = () => {
    const e = {};
    if (!team.teamName.trim()) e.teamName = "Team name is required";
    else if (!NAME_REGEX.test(team.teamName.trim())) e.teamName = "Team name should contain letters only";
    else if (nameCheck.status === "taken") e.teamName = "Please choose a different team name";

    if (!team.leaderName.trim()) e.leaderName = "Team leader name is required";
    else if (!NAME_REGEX.test(team.leaderName.trim())) e.leaderName = "Leader name should contain letters only";

    if (!team.college.trim()) e.college = "College / organization is required";

    if (!team.email.trim()) e.email = "Email is required";
    else if (!EMAIL_REGEX.test(team.email.trim())) e.email = "Enter a valid email";

    if (!team.phone.trim()) e.phone = "Phone number is required";
    else if (!PHONE_REGEX.test(team.phone.trim())) e.phone = "Phone number must be exactly 10 digits";

    if (team.altPhone.trim() && !PHONE_REGEX.test(team.altPhone.trim())) {
      e.altPhone = "Alternate phone number must be exactly 10 digits";
    }

    if (!project.title.trim()) e.title = "Project title is required";

    if (!agreed) e.agreed = "Please accept the terms and conditions";

    setErrors(e);
    return e;
  };

  const sectionRefs = { team: useRef(null), members: useRef(null), project: useRef(null), review: useRef(null) };
  const scrollToSection = (key) => sectionRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleSubmit = (e) => {
    e.preventDefault();
    const e2 = validateAll();
    if (Object.keys(e2).length > 0) {
      if (e2.teamName || e2.leaderName || e2.college || e2.email || e2.phone || e2.altPhone) scrollToSection("team");
      else if (e2.title) scrollToSection("project");
      else if (e2.agreed) scrollToSection("review");
      return;
    }
    // BACKEND: fetch('/api/register', { method:'POST', body: JSON.stringify({ team, members: allMembers, project, teamId }) })
    console.log("Farm Fusion AI registration submitted:", { team, members: allMembers, project, teamId });
    setRegisteredCount((c) => c + 1);
    setSubmitted(true);
  };

  const goHome = () => setPage("home");
  const goRegister = () => {
    if (isFull) return;
    setPage("register");
  };

  if (submitted) {
    return (
      <div style={styles.page} className="ffai-page">
        <CircuitBackdrop />
        <NavBar page="register" onHome={() => { setSubmitted(false); setPage("home"); }} onRegister={() => setSubmitted(false)} />
        <SuccessTicket
          team={team}
          teamId={teamId}
          project={project}
          onReset={() => setSubmitted(false)}
          onHome={() => { setSubmitted(false); setPage("home"); }}
        />
      </div>
    );
  }

  return (
    <div style={styles.page} className="ffai-page">
      <CircuitBackdrop />
      <NavBar page={page} onHome={goHome} onRegister={goRegister} />

      {page === "home" && (
        <HomePage
          registeredCount={registeredCount}
          seatsLeft={seatsLeft}
          isFull={isFull}
          timeLeft={timeLeft}
          onRegister={goRegister}
        />
      )}

      {page === "register" && (
        <RegisterPage
          team={team}
          updateTeam={updateTeam}
          teamId={teamId}
          nameCheck={nameCheck}
          errors={errors}
          allMembers={allMembers}
          leaderMember={leaderMember}
          members={members}
          addMember={addMember}
          removeMember={removeMember}
          updateMember={updateMember}
          toggleSkill={toggleSkill}
          sendInvite={sendInvite}
          project={project}
          updateProject={updateProject}
          agreed={agreed}
          setAgreed={setAgreed}
          handleSubmit={handleSubmit}
          sectionRefs={sectionRefs}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */

function NavBar({ page, onHome, onRegister }) {
  return (
    <div style={styles.navBar} className="ffai-navbar">
      <button type="button" onClick={onHome} style={styles.navLogo} className="ffai-nav-logo">
        <span style={styles.navLogoBadge}>
          <Sprout size={16} color="#F7F4EA" />
        </span>
        Farm Fusion<span style={{ color: "#3F9142" }}>AI</span>
      </button>
      <div style={styles.navPillRow}>
        <button
          type="button"
          onClick={onHome}
          style={{ ...styles.navPill, ...(page === "home" ? styles.navPillActive : {}) }}
        >
          <HomeIcon size={13} /> Home
        </button>
        <button
          type="button"
          onClick={onRegister}
          style={{ ...styles.navPill, ...(page === "register" ? styles.navPillActive : {}) }}
        >
          <ClipboardList size={13} /> Register
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home page                                                           */
/* ------------------------------------------------------------------ */

function HomePage({ registeredCount, seatsLeft, isFull, timeLeft, onRegister }) {
  const pct = Math.min((registeredCount / TEAM_CAPACITY) * 100, 100);

  return (
    <div style={styles.homeWrap} className="ffai-home-wrap">
      <div style={styles.homeCard} className="ffai-home-card">
        <span style={styles.cornerTagLeft} className="ffai-corner-tag-left">SEASON 01</span>
        <span style={styles.cornerTagRight} className="ffai-corner-tag-right">HARVEST 2026</span>

        <div style={styles.heroZone} className="ffai-hero">
          <svg style={styles.heroBackdropSvg} viewBox="0 0 660 230" preserveAspectRatio="xMidYMax slice">
            <defs>
              <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FBF6E3" />
                <stop offset="100%" stopColor="#DCE9C8" />
              </linearGradient>
              <radialGradient id="heroSun" cx="30%" cy="20%" r="55%">
                <stop offset="0%" stopColor="#FFE9A8" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FFE9A8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="660" height="230" fill="url(#heroSky)" />
            <rect x="0" y="0" width="660" height="230" fill="url(#heroSun)" />
            <path d="M0 190 Q160 150 330 178 T660 165 V230 H0 Z" fill="#CFE3B8" opacity="0.8" />
            <path d="M0 205 Q200 185 400 200 T660 195 V230 H0 Z" fill="#B9D89E" opacity="0.75" />
            <g transform="translate(520,120)" opacity="0.85">
              <line x1="46" y1="0" x2="46" y2="70" stroke="#5C6B4F" strokeWidth="2" />
              <g transform="translate(46,0)">
                <line x1="0" y1="0" x2="16" y2="10" stroke="#5C6B4F" strokeWidth="2" strokeLinecap="round" />
                <line x1="0" y1="0" x2="-16" y2="8" stroke="#5C6B4F" strokeWidth="2" strokeLinecap="round" />
                <line x1="0" y1="0" x2="2" y2="-18" stroke="#5C6B4F" strokeWidth="2" strokeLinecap="round" />
              </g>
              <rect x="-28" y="46" width="34" height="24" fill="#5A4636" />
              <polygon points="-32,46 -11,28 10,46" fill="#3F7A3B" />
              <rect x="-16" y="54" width="8" height="10" fill="#DCEFD6" />
            </g>
            <g stroke="#2E6B2A" strokeWidth="1.4" opacity="0.35" fill="none">
              <path d="M20 14 L60 14 L60 44 L92 44" strokeDasharray="1 6" strokeLinecap="round" />
              <path d="M640 14 L600 14 L600 40 L570 40" strokeDasharray="1 6" strokeLinecap="round" />
            </g>
            <circle cx="92" cy="44" r="3" fill="#C9A227" opacity="0.6" />
            <circle cx="570" cy="40" r="3" fill="#3F7A3B" opacity="0.6" />
          </svg>

          <div style={styles.heroContent}>
            <div style={styles.eyebrowRow}>
              <span style={styles.eyebrowRule} />
              <span style={styles.eyebrowText}>Agriculture × Artificial Intelligence</span>
              <span style={styles.eyebrowRule} />
            </div>

            <div style={styles.homeEmblem}>
              <Sprout size={26} color="#F7F4EA" />
            </div>

            <h1 style={styles.title} className="ffai-title">
              Farm Fusion<span style={styles.titleAccent}>AI</span>
            </h1>
            <p style={styles.tagline} className="ffai-tagline">Where AI Meets Agriculture</p>
            <div style={styles.hackathonBadge}>
              <ArrowRight size={16} color="#3F7A3B" />
              <span style={styles.hackathonText} className="ffai-hackathon-text">HACKATHON</span>
              <ArrowLeft size={16} color="#3F7A3B" />
            </div>
          </div>
        </div>

        <div style={styles.homeBody} className="ffai-home-body">
          <div style={{ ...styles.alertBox, ...(isFull ? styles.alertBoxFull : styles.alertBoxOpen) }}>
            {isFull ? <AlertTriangle size={18} color="#B4491F" /> : <Sprout size={18} color="#2E6B2A" />}
            <div style={styles.alertTextWrap}>
              <p style={styles.alertTitle}>
                {isFull ? "Field is full" : "Seeds are sowing"}
              </p>
              <p style={styles.alertSubtitle}>
                {isFull
                  ? "All grower slots have been claimed for this season."
                  : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left in the field — register before it fills up!`}
              </p>
            </div>
          </div>

          <div style={styles.progressCard}>
            <div style={styles.progressHeaderRow}>
              <span style={styles.progressLabel}>
                <ArrowRight size={13} color="#3F7A3B" /> PLANTING PROGRESS
              </span>
              <span style={styles.progressCount}>
                {registeredCount}/{TEAM_CAPACITY}
              </span>
            </div>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${pct}%` }} />
              <span style={{ ...styles.progressMarker, left: `calc(${pct}% - 11px)` }}>
                <Sprout size={11} color="#14532B" />
              </span>
            </div>
          </div>

          <div style={styles.glassBarWrap}>
            <div style={styles.glassBar} className="ffai-glassbar">
              <div style={styles.glassBarItem} className="ffai-glassbar-item">
                <Users size={15} color="#3F7A3B" />
                <span>
                  <strong>{registeredCount}</strong> teams registered
                </span>
              </div>
              <div style={styles.glassBarDivider} className="ffai-glassbar-divider" />
              <div style={styles.glassBarItem} className="ffai-glassbar-item">
                <Clock size={15} color="#3F7A3B" />
                {timeLeft.closed ? (
                  <span>Registration closed</span>
                ) : (
                  <span>
                    <strong>
                      {timeLeft.days}d {timeLeft.hours}h {timeLeft.mins}m
                    </strong>{" "}
                    left
                  </span>
                )}
              </div>
            </div>
          </div>

          <button type="button" onClick={onRegister} disabled={isFull} style={{ ...styles.ctaButton, ...styles.ctaButtonFull, ...(isFull ? styles.ctaButtonDisabled : {}) }}>
            <Sprout size={18} /> {isFull ? "FIELD IS FULL" : "REGISTER NOW"}
          </button>
        </div>

        <div style={styles.bottomZone}>
          <div style={styles.footerTagline}>
            <span style={styles.footerRule} />
            <Sprout size={14} color="#2E6B2A" />
            <span>Code the Future. Cultivate Change.</span>
            <span style={styles.footerRule} />
          </div>
          <FieldIllustration />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registration Desk page                                              */
/* ------------------------------------------------------------------ */

function RegisterPage({
  team,
  updateTeam,
  teamId,
  nameCheck,
  errors,
  allMembers,
  leaderMember,
  members,
  addMember,
  removeMember,
  updateMember,
  toggleSkill,
  sendInvite,
  project,
  updateProject,
  agreed,
  setAgreed,
  handleSubmit,
  sectionRefs,
}) {
  return (
    <div style={styles.registerWrap} className="ffai-register-wrap">
      <form onSubmit={handleSubmit} noValidate>
        <div style={styles.deskHeader} className="ffai-desk-header">
          <span style={styles.kickerPill}>REGISTER</span>
          <h1 style={styles.deskTitle} className="ffai-desk-title">REGISTRATION DESK</h1>
          <p style={styles.deskSubtitle}>Register your crew for Farm Fusion AI</p>
        </div>

        <SectionCard label="TEAM NAME" refEl={sectionRefs.team}>
          <div style={styles.teamNameFieldWrap}>
            <Field
              icon={<User size={16} />}
              label="Team Name"
              required
              placeholder="Enter your team name"
              value={team.teamName}
              onChange={updateTeam("teamName")}
              error={errors.teamName}
              full
            />
            {!errors.teamName && nameCheck.status !== "idle" && (
              <p
                style={{
                  ...styles.helperText,
                  marginTop: 4,
                  color: nameCheck.status === "taken" ? "#B4491F" : nameCheck.status === "ok" ? "#2E6B2A" : "#4B6350",
                }}
              >
                {nameCheck.status === "checking" && "Checking availability…"}
                {nameCheck.status === "ok" && "✓ Team name is available"}
                {nameCheck.status === "taken" && "This team name is already registered"}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard label="LEADER DETAILS" badge="TEAM LEADER">
          <div style={styles.grid2} className="ffai-grid2">
            <Field
              icon={<User size={16} />}
              label="Team Leader Name"
              required
              placeholder="Enter team leader name"
              value={team.leaderName}
              onChange={updateTeam("leaderName")}
              error={errors.leaderName}
            />
            <Field
              icon={<Building2 size={16} />}
              label="College / Organization"
              required
              list="college-list"
              placeholder="Enter your college / organization"
              value={team.college}
              onChange={updateTeam("college")}
              error={errors.college}
            />
            <Field
              icon={<Mail size={16} />}
              label="Email ID"
              required
              type="email"
              placeholder="Enter email address"
              value={team.email}
              onChange={updateTeam("email")}
              error={errors.email}
            />
            <Field
              icon={<Phone size={16} />}
              label="Phone Number"
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter 10-digit phone number"
              value={team.phone}
              onChange={updateTeam("phone")}
              error={errors.phone}
            />
            <div>
              <Field
                icon={<Phone size={16} />}
                label="Alternate Phone Number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter alternate phone number"
                value={team.altPhone}
                onChange={updateTeam("altPhone")}
                error={errors.altPhone}
              />
              <label style={styles.sameAsRow}>
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={team.altPhone === team.phone && team.phone !== ""}
                  onChange={(e) => updateTeam("altPhone")({ target: { value: e.target.checked ? team.phone : "" } })}
                />
                Same as phone number
              </label>
            </div>
          </div>
          <datalist id="college-list">
            <option value="Kalasalingam University" />
            <option value="IIT Madras" />
            <option value="Anna University" />
            <option value="VIT Vellore" />
          </datalist>
        </SectionCard>

        <SectionCard label="TEAM MEMBERS" refEl={sectionRefs.members}>
          <div style={styles.teamMembersHeader} className="ffai-team-header">
            <p style={styles.helperText}>
              {allMembers.length}/{MAX_MEMBERS} added (including team leader)
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => addMember("invite")} disabled={allMembers.length >= MAX_MEMBERS} style={styles.addMemberButton}>
                <Send size={14} /> Invite by email
              </button>
              <button
                type="button"
                onClick={() => addMember("manual")}
                disabled={allMembers.length >= MAX_MEMBERS}
                style={{ ...styles.addMemberButton, background: "transparent", color: "#2E6B2A", border: "1.5px solid #2E6B2A" }}
              >
                <Plus size={14} /> Add manually
              </button>
            </div>
          </div>

          <div style={styles.memberGrid} className="ffai-member-grid">
            <MemberCard member={leaderMember} readOnly />
            {members.map((mem, idx) => (
              <MemberCard
                key={mem.id}
                member={mem}
                index={idx + 2}
                onRemove={() => removeMember(mem.id)}
                onChange={(field) => updateMember(mem.id, field)}
                onToggleSkill={(skill) => toggleSkill(mem.id, skill)}
                onInvite={() => sendInvite(mem.id)}
              />
            ))}
          </div>
          <p style={styles.helperNote}>
            💡 Inviting by email sends teammates a link to fill in their own details — less typing for you, more
            accurate data for us.
          </p>
        </SectionCard>

        <SectionCard label="PROJECT DETAILS" refEl={sectionRefs.project}>
          <Field
            icon={<Lightbulb size={16} />}
            label="Project Title / Idea"
            required
            placeholder="Enter your project title / idea"
            value={project.title}
            onChange={updateProject("title")}
            error={errors.title}
            full
          />
          <div style={{ marginTop: 18 }}>
            <label style={styles.label}>
              <FileText size={16} color="#14532B" style={{ marginRight: 6 }} />
              Problem Statement
            </label>
            <textarea
              style={styles.textarea}
              placeholder="Briefly describe the problem your solution addresses"
              rows={5}
              value={project.problem}
              onChange={updateProject("problem")}
            />
            <p style={styles.helperText}>{project.problem.length}/500 characters</p>
          </div>
        </SectionCard>

        <SectionCard label="REVIEW & SUBMIT" refEl={sectionRefs.review}>
          <ReviewBlock label="Team">
            <p><strong>{team.teamName || "—"}</strong> · {teamId || "—"}</p>
            <p>{team.leaderName || "—"} · {team.college || "—"}</p>
            <p>{team.email || "—"} · {team.phone || "—"}</p>
          </ReviewBlock>
          <ReviewBlock label={`Members (${allMembers.length})`}>
            {allMembers.map((m) => (
              <p key={m.id}>
                {m.name || "(pending invite)"} {m.isLeader && "— Leader"} {m.skills?.length ? `· ${m.skills.join(", ")}` : ""}
              </p>
            ))}
          </ReviewBlock>
          <ReviewBlock label="Project">
            <p><strong>{project.title || "—"}</strong></p>
            <p style={{ color: "#4B6350" }}>{project.problem || "No description added"}</p>
          </ReviewBlock>

          <label style={styles.termsRow}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={styles.checkbox} />
            <span style={styles.termsText}>
              I agree to the <span style={styles.termsLink}>terms and conditions</span>.
            </span>
          </label>
          {errors.agreed && <p style={styles.errorTextCenter}>{errors.agreed}</p>}

          <div style={styles.navRow} className="ffai-nav-row">
            <span />
            <button type="submit" style={styles.ctaButton}>
              <Sprout size={18} /> PLANT YOUR IDEA
            </button>
          </div>
        </SectionCard>

        <div style={styles.bottomZoneFlat}>
          <div style={styles.footerTagline}>
            <span style={styles.footerRule} />
            <Sprout size={14} color="#2E6B2A" />
            <span>Code the Future. Cultivate Change.</span>
            <span style={styles.footerRule} />
          </div>
        </div>
      </form>
    </div>
  );
}

function SectionCard({ label, badge, refEl, children }) {
  return (
    <div style={styles.sectionCard} className="ffai-section-card" ref={refEl}>
      <span style={styles.sectionPill}>{label}</span>
      {badge && <span style={styles.sectionBadge}>{badge}</span>}
      <div style={styles.sectionCardBody}>{children}</div>
    </div>
  );
}

function Field({ icon, label, required, error, full, ...inputProps }) {
  return (
    <div style={{ ...styles.fieldWrap, ...(full ? { gridColumn: "1 / -1" } : {}) }}>
      <label style={styles.label}>
        <span style={{ marginRight: 6, color: "#14532B", display: "inline-flex" }}>{icon}</span>
        {label}
        {required && <span style={styles.required}> *</span>}
      </label>
      <input {...inputProps} style={{ ...styles.input, ...(error ? styles.inputError : {}) }} />
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  );
}

function MemberCard({ member, index, readOnly, onRemove, onChange, onToggleSkill, onInvite }) {
  return (
    <div style={styles.memberCard}>
      <div style={styles.memberCardHeader}>
        <span style={styles.memberIndex}>{member.isLeader ? "L" : index}</span>
        <span style={styles.memberCardTitle}>{member.isLeader ? "Team Leader (you)" : `Member ${index}`}</span>
        {member.mode === "invite" && (
          <span style={{ ...styles.inviteBadge, ...(member.invited ? styles.inviteBadgeSent : {}) }}>
            {member.invited ? "Invite sent" : "Not sent"}
          </span>
        )}
        {!readOnly && (
          <button type="button" onClick={onRemove} style={styles.removeMemberButton} aria-label="Remove member">
            <X size={14} />
          </button>
        )}
      </div>

      {readOnly ? (
        <p style={styles.memberMirrorText}>
          {member.name || "—"} · {member.email || "—"}
        </p>
      ) : member.mode === "invite" ? (
        <div style={styles.inviteRow}>
          <input
            style={styles.memberInputFull}
            placeholder="teammate@email.com"
            type="email"
            value={member.email}
            onChange={onChange("email")}
          />
          <button type="button" onClick={onInvite} disabled={!member.email || member.invited} style={styles.sendInviteButton}>
            <Send size={13} /> {member.invited ? "Sent" : "Send"}
          </button>
        </div>
      ) : (
        <>
          <div style={styles.memberRowInputs}>
            <input style={styles.memberInput} placeholder="Full name" value={member.name} onChange={onChange("name")} />
            <input style={styles.memberInput} placeholder="Email" type="email" value={member.email} onChange={onChange("email")} />
            <input style={styles.memberInput} placeholder="Role" value={member.role} onChange={onChange("role")} />
          </div>
          <div style={styles.skillChipRow}>
            {SKILLS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onToggleSkill(s)}
                style={{ ...styles.skillChip, ...(member.skills.includes(s) ? styles.skillChipActive : {}) }}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewBlock({ label, children }) {
  return (
    <div style={styles.reviewBlock}>
      <div style={styles.reviewBlockHeader}>
        <span style={styles.reviewBlockLabel}>{label}</span>
      </div>
      <div style={styles.reviewBlockBody}>{children}</div>
    </div>
  );
}

function SuccessTicket({ team, teamId, project, onReset, onHome }) {
  const canvasRef = useRef(null);

  // QR now encodes the full team/user information (not just the bare team ID)
  // so scanning it at check-in surfaces team name, leader, college, email,
  // phone, and project title alongside the team ID.
  const qrInfoText = teamId
    ? [
        `Team Name: ${team.teamName || "—"}`,
        `Team ID: ${teamId}`,
        `Leader: ${team.leaderName || "—"}`,
        `College: ${team.college || "—"}`,
        `Email: ${team.email || "—"}`,
        `Phone: ${team.phone || "—"}`,
        `Project: ${project.title || "—"}`,
      ].join("\n")
    : null;

  // Public QR-image API called as a plain <img src>, so no npm package is
  // required — this renders fine both in restricted preview sandboxes and
  // in a real app. Swap for a self-hosted generator if you need to work
  // fully offline or avoid the third-party call.
  const qrDataUrl = qrInfoText
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=1&data=${encodeURIComponent(qrInfoText)}`
    : null;

  // Renders the same two-panel ticket (cream main + dark stub with QR)
  // that's on screen, so the exported PNG lines up with what the user sees.
  const downloadTicket = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 700,
      H = 380,
      HEADER_H = 56,
      MAIN_W = Math.round(W * 0.72),
      STUB_W = W - MAIN_W,
      CARD_R = 22;

    canvas.width = W;
    canvas.height = H;

    const drawBaseLayout = () => {
      ctx.fillStyle = "#EFEBDD";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      roundRectPath(ctx, 6, 6, W - 12, H - 12, CARD_R);
      ctx.clip();

      ctx.fillStyle = "#14532B";
      ctx.fillRect(0, 0, W, HEADER_H);
      ctx.fillStyle = "#F7F4EA";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("FARM FUSION AI — HACKATHON TICKET", 26, 36);

      ctx.fillStyle = "#F7F4EA";
      ctx.fillRect(0, HEADER_H, MAIN_W, H - HEADER_H);

      ctx.fillStyle = "#0F3D2E";
      ctx.fillRect(MAIN_W, HEADER_H, STUB_W, H - HEADER_H);

      ctx.strokeStyle = "#C9D6BE";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(MAIN_W, HEADER_H + 18);
      ctx.lineTo(MAIN_W, H - 18);
      ctx.stroke();
      ctx.setLineDash([]);

      const padX = 28;
      let y = HEADER_H + 46;
      ctx.fillStyle = "#3F7A3B";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("TEAM", padX, y);

      y += 30;
      ctx.fillStyle = "#14532B";
      ctx.font = "bold 27px sans-serif";
      ctx.fillText(team.teamName || "—", padX, y);

      y += 26;
      ctx.fillStyle = "#4B6350";
      ctx.font = "14px sans-serif";
      ctx.fillText(`${team.leaderName || "—"}  ·  ${team.college || "—"}`, padX, y);

      y += 22;
      ctx.fillText(`${project.title || "your project"}`, padX, y);

      const badgeText = teamId || "—";
      ctx.font = "bold 13px sans-serif";
      const badgeTextW = ctx.measureText(badgeText).width;
      const badgeW = badgeTextW + 44;
      const badgeH = 30;
      const badgeY = y + 22;
      const grad = ctx.createLinearGradient(padX, badgeY, padX + badgeW, badgeY + badgeH);
      grad.addColorStop(0, "#C9A227");
      grad.addColorStop(1, "#A9821D");
      ctx.fillStyle = grad;
      roundRectPath(ctx, padX, badgeY, badgeW, badgeH, badgeH / 2);
      ctx.fill();
      ctx.fillStyle = "#F7F4EA";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, padX + badgeW / 2, badgeY + badgeH / 2 + 5);
      ctx.textAlign = "left";

      ctx.fillStyle = "#C9E4B8";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SCAN AT CHECK-IN", MAIN_W + STUB_W / 2, H - 24);
      ctx.textAlign = "left";

      ctx.restore();

      ctx.strokeStyle = "#14532B";
      ctx.lineWidth = 3;
      roundRectPath(ctx, 6, 6, W - 12, H - 12, CARD_R);
      ctx.stroke();

      ctx.fillStyle = "#4B6350";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Code the Future. Cultivate Change.", W / 2, H - 6);
      ctx.textAlign = "left";
    };

    const finishAndDownload = () => {
      const link = document.createElement("a");
      link.download = `${teamId || "ffai-ticket"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    drawBaseLayout();

    if (qrDataUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const qrSize = Math.min(STUB_W - 40, H - HEADER_H - 90);
        const qrX = MAIN_W + (STUB_W - qrSize) / 2;
        const qrY = HEADER_H + (H - HEADER_H - 44 - qrSize) / 2;
        try {
          ctx.save();
          roundRectPath(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 10);
          ctx.fillStyle = "#F7F4EA";
          ctx.fill();
          ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
          ctx.restore();
        } catch {
          /* CORS blocked the pixel read — ticket still downloads without the QR baked in */
        }
        finishAndDownload();
      };
      img.onerror = () => finishAndDownload();
      img.src = qrDataUrl;
    } else {
      finishAndDownload();
    }
  }, [team, teamId, project, qrDataUrl]);

  const shareTicket = async () => {
    const text = `We just registered Team "${team.teamName}" (${teamId}) for Farm Fusion AI Hackathon 🌱 — Where AI Meets Agriculture!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Farm Fusion AI Hackathon", text });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard?.writeText(text);
    }
  };

  return (
    <div style={styles.ticketOuter}>
      <div style={styles.ticketGlow} />
      <div style={styles.ticketKicker}>YOU'RE REGISTERED FOR THE</div>
      <h2 style={styles.ticketHeadline} className="ffai-ticket-headline">
        FARM FUSION<span style={{ color: "#3F9142" }}>AI</span>
        <br />
        HACKATHON
      </h2>

      <div style={styles.ticketCard} className="ffai-ticket-card">
        <div style={styles.ticketNotchLeft} className="ffai-notch-left" />
        <div style={styles.ticketNotchRight} className="ffai-notch-right" />

        <div style={styles.ticketMain} className="ffai-ticket-main">
          <span style={styles.ticketEyebrow}>TEAM</span>
          <h3 style={styles.ticketTeamName}>{team.teamName || "—"}</h3>
          <p style={styles.ticketLine}>
            <User size={13} /> {team.leaderName} · {team.college}
          </p>
          <p style={styles.ticketLine}>
            <Lightbulb size={13} /> {project.title || "your project"}
          </p>
          <div style={styles.ticketBadgeRow}>
            <span style={styles.waxSealLg}>
              <Sprout size={14} color="#F7F4EA" /> {teamId}
            </span>
          </div>
        </div>

        <div style={styles.ticketDivider} className="ffai-ticket-divider">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} style={styles.ticketDividerDot} />
          ))}
        </div>

        <div style={styles.ticketStub} className="ffai-ticket-stub">
          {qrDataUrl && <img src={qrDataUrl} crossOrigin="anonymous" alt="Team QR code" width={104} height={104} style={{ borderRadius: 10 }} />}
          <span style={styles.ticketStubLabel}>SCAN AT CHECK-IN</span>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 26 }}>
        <button type="button" style={styles.ctaButton} onClick={downloadTicket}>
          <Download size={17} /> Download Ticket
        </button>
        <button type="button" style={styles.backButton} onClick={shareTicket}>
          <Share2 size={16} /> Share
        </button>
        <button type="button" style={styles.backButton} onClick={onHome}>
          <ArrowLeft size={16} /> Back to home
        </button>
      </div>
    </div>
  );
}

function CircuitBackdrop() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(#2E6B2A22 1px, transparent 1px), radial-gradient(#2E6B2A14 1px, transparent 1px)",
        backgroundSize: "26px 26px, 26px 26px",
        backgroundPosition: "0 0, 13px 13px",
        pointerEvents: "none",
      }}
    />
  );
}

function FieldIllustration() {
  return (
    <div style={styles.illustrationWrap}>
      <svg viewBox="0 0 800 220" width="100%" height="auto" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EFE7D0" />
            <stop offset="100%" stopColor="#F7F4EA" />
          </linearGradient>
          <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5FD1E0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5FD1E0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="800" height="220" fill="url(#sky)" />
        <path d="M0 150 Q200 110 400 145 T800 130 V220 H0 Z" fill="#BFE3B0" />
        {Array.from({ length: 9 }).map((_, i) => (
          <path key={i} d={`M${-40 + i * 100} 220 L${60 + i * 100} 150 L${90 + i * 100} 150 L${-10 + i * 100} 220 Z`} fill={i % 2 === 0 ? "#3F7A3B" : "#356A32"} opacity="0.8" />
        ))}
        <g transform="translate(60,150)">
          <rect x="0" y="10" width="46" height="24" rx="3" fill="#14532B" />
          <rect x="6" y="-14" width="26" height="26" rx="3" fill="#2E6B2A" />
          <rect x="9" y="-11" width="16" height="12" rx="1.5" fill="#DCEFD6" />
          <circle cx="10" cy="40" r="12" fill="#1B1B1B" />
          <circle cx="10" cy="40" r="5" fill="#C9A227" />
          <circle cx="42" cy="40" r="8" fill="#1B1B1B" />
          <circle cx="42" cy="40" r="3.5" fill="#C9A227" />
        </g>
        <g transform="translate(660,60)">
          <rect x="-70" y="70" width="4" height="150" fill="url(#scan)" />
          <ellipse cx="-68" cy="220" rx="46" ry="10" fill="#5FD1E0" opacity="0.35" />
          <circle cx="0" cy="0" r="7" fill="#1B1B1B" />
          <line x1="-16" y1="-4" x2="16" y2="-4" stroke="#1B1B1B" strokeWidth="2" />
          <line x1="-16" y1="4" x2="16" y2="4" stroke="#1B1B1B" strokeWidth="2" />
          <circle cx="-16" cy="-4" r="4" fill="#3F7A3B" />
          <circle cx="16" cy="-4" r="4" fill="#3F7A3B" />
          <circle cx="-16" cy="4" r="4" fill="#3F7A3B" />
          <circle cx="16" cy="4" r="4" fill="#3F7A3B" />
        </g>
      </svg>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", width: "100%", background: "#EFEBDD", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 32px", position: "relative", fontFamily: "'Poppins','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif", boxSizing: "border-box" },

  /* Nav */
  navBar: { position: "relative", zIndex: 2, width: "100%", maxWidth: 900, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", boxSizing: "border-box" },
  navLogo: { display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 800, color: "#14532B", background: "transparent", border: "none", cursor: "pointer", padding: 0 },
  navLogoBadge: { width: 26, height: 26, borderRadius: 8, background: "#2E6B2A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  navPillRow: { display: "flex", gap: 8 },
  navPill: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.6)", color: "#2F5233", border: "1.5px solid #C9D6BE", borderRadius: 999, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  navPillActive: { background: "#14532B", color: "#F7F4EA", borderColor: "#14532B" },

  /* Home page */
  homeWrap: { position: "relative", zIndex: 1, width: "100%", maxWidth: 900, display: "flex", justifyContent: "center", padding: "10px 16px", boxSizing: "border-box" },
  homeCard: { position: "relative", width: "100%", maxWidth: 660, borderRadius: 28, border: "3px solid #14532B", boxShadow: "0 20px 50px rgba(20,83,43,0.18)", overflow: "hidden" },
  cornerTagLeft: { position: "absolute", top: 14, left: 14, zIndex: 3, background: "#2E6B2A", color: "#F7F4EA", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, padding: "5px 10px", borderRadius: 6 },
  cornerTagRight: { position: "absolute", top: 14, right: 14, zIndex: 3, background: "#C9A227", color: "#3B2E06", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, padding: "5px 10px", borderRadius: 6 },
  homeEmblem: { width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#2E6B2A,#14532B)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: "0 8px 18px rgba(20,83,43,0.3)" },
  homeBody: { position: "relative", background: "#F7F4EA", padding: "26px 32px 4px", display: "flex", flexDirection: "column", gap: 16 },

  alertBox: { display: "flex", alignItems: "flex-start", justifyContent: "flex-start", gap: 12, borderRadius: 14, padding: "14px 16px", border: "1.5px solid", textAlign: "left" },
  alertBoxOpen: { background: "#E6F0E0", borderColor: "#B9D8A8" },
  alertBoxFull: { background: "#F7E8E1", borderColor: "#E3B7A4" },
  alertTextWrap: { textAlign: "left", flex: 1 },
  alertTitle: { margin: 0, fontSize: 14.5, fontWeight: 800, color: "#22422A", textAlign: "left" },
  alertSubtitle: { margin: "2px 0 0", fontSize: 12.5, color: "#4B6350", textAlign: "left" },

  progressCard: { background: "#FCFBF6", border: "1.5px solid #DDE6D1", borderRadius: 14, padding: "14px 16px" },
  progressHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  progressLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, color: "#14532B" },
  progressCount: { fontSize: 12, fontWeight: 700, color: "#4B6350" },
  progressTrack: { position: "relative", height: 10, background: "#DDE6D1", borderRadius: 999, overflow: "visible" },
  progressFill: { height: "100%", background: "linear-gradient(90deg,#2E6B2A,#4A8C3F)", borderRadius: 999, transition: "width .35s ease" },
  progressMarker: { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: "#C9A227", border: "2px solid #F7F4EA", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" },

  ctaButtonFull: { width: "auto", minWidth: 240, alignSelf: "center", justifyContent: "center", marginTop: 4, marginBottom: 20 },
  ctaButtonDisabled: { background: "#B9C4AF", boxShadow: "none", cursor: "not-allowed" },

  /* Register page */
  registerWrap: { position: "relative", zIndex: 1, width: "100%", maxWidth: 700, padding: "10px 16px 0", boxSizing: "border-box" },
  deskHeader: { textAlign: "center", background: "#F7F4EA", border: "3px solid #14532B", borderRadius: 20, padding: "26px 20px", marginBottom: 22, boxShadow: "0 14px 32px rgba(20,83,43,0.14)" },
  deskTitle: { margin: "6px 0 4px", fontSize: 28, fontWeight: 800, color: "#14532B", letterSpacing: -0.5 },
  deskSubtitle: { margin: 0, fontSize: 13.5, color: "#3F7A3B", fontWeight: 700, letterSpacing: 0.5 },

  sectionCard: { position: "relative", background: "#F7F4EA", border: "1.5px solid #DDE6D1", borderRadius: 18, padding: "26px 24px 20px", marginBottom: 20, boxShadow: "0 8px 22px rgba(20,83,43,0.08)" },
  sectionCardBody: {},
  sectionPill: { position: "absolute", top: -13, left: 20, background: "#2E6B2A", color: "#F7F4EA", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, padding: "6px 14px", borderRadius: 999, boxShadow: "0 4px 10px rgba(20,83,43,0.25)" },
  sectionBadge: { position: "absolute", top: -13, right: 20, background: "#C9A227", color: "#3B2E06", fontSize: 10, fontWeight: 800, letterSpacing: 0.8, padding: "6px 12px", borderRadius: 999 },
  teamNameFieldWrap: { marginTop: 4 },

  eyebrowRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 },
  eyebrowRule: { width: 34, height: 1, background: "#A9BB9C" },
  eyebrowText: { fontSize: 11.5, fontWeight: 700, letterSpacing: 2, color: "#3F7A3B", textTransform: "uppercase", whiteSpace: "nowrap" },
  title: { textAlign: "center", fontSize: 38, fontWeight: 800, color: "#14532B", margin: "4px 0 2px", letterSpacing: -0.5 },
  titleAccent: { color: "#3F9142" },
  tagline: { textAlign: "center", color: "#2F5233", fontSize: 16, margin: "2px 0 10px" },
  hackathonBadge: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 },
  hackathonText: { color: "#3F7A3B", fontWeight: 800, fontSize: 21, letterSpacing: 2 },

  glassBarWrap: { position: "relative", display: "flex", justifyContent: "center" },
  glassBar: { display: "flex", alignItems: "center", gap: 0, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 999, padding: "10px 22px", boxShadow: "0 12px 30px rgba(20,83,43,0.14)" },
  glassBarItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#2F5233", whiteSpace: "nowrap" },
  glassBarDivider: { width: 1, height: 16, background: "#C9D6BE", margin: "0 16px" },

  waxSeal: { position: "absolute", top: -14, right: "18%", display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#C9A227,#A9821D)", color: "#F7F4EA", fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999, boxShadow: "0 6px 14px rgba(169,130,29,0.4)", transform: "rotate(4deg)" },
  waxSealText: { letterSpacing: 0.3 },

  heroZone: { position: "relative", overflow: "hidden", padding: "48px 32px 28px 32px", background: "#EFE7D0" },
  heroBackdropSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 },
  heroContent: { position: "relative", zIndex: 2 },
  bottomZone: { position: "relative", background: "#EFE7D0" },
  bottomZoneFlat: { position: "relative", padding: "8px 0 4px" },
  footerTagline: { position: "relative", zIndex: 1, textAlign: "center", color: "#2F5233", fontSize: 13, fontWeight: 600, letterSpacing: 0.4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "18px 0 4px" },
  footerRule: { width: 40, height: 1, background: "#A9BB9C" },

  kickerPill: { display: "inline-block", background: "#DCEFD6", color: "#2E6B2A", fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, padding: "3px 10px", borderRadius: 999, marginBottom: 8 },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 20, rowGap: 16 },
  fieldWrap: {},
  label: { display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 600, color: "#22422A", marginBottom: 6 },
  required: { color: "#B4491F" },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #C9D6BE", background: "#FCFBF6", fontSize: 14.5, color: "#22422A", outline: "none" },
  inputError: { borderColor: "#C0442A", boxShadow: "0 0 0 3px rgba(192,68,42,0.12)" },
  errorText: { color: "#B4491F", fontSize: 12, marginTop: 4 },
  errorTextCenter: { color: "#B4491F", fontSize: 12.5, marginTop: 6, textAlign: "center" },
  helperText: { fontSize: 12.5, color: "#4B6350", margin: "4px 0 0" },
  helperNote: { fontSize: 12.5, color: "#4B6350", marginTop: 12, fontStyle: "italic" },
  sameAsRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4B6350", marginTop: 6, cursor: "pointer" },
  textarea: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #C9D6BE", background: "#FCFBF6", fontSize: 14.5, color: "#22422A", outline: "none", resize: "vertical", fontFamily: "inherit" },

  teamMembersHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  addMemberButton: { display: "inline-flex", alignItems: "center", gap: 6, background: "#2E6B2A", color: "#F7F4EA", border: "none", borderRadius: 999, padding: "9px 16px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
  memberGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 },
  memberCard: { background: "#FCFBF6", border: "1.5px solid #DDE6D1", borderRadius: 14, padding: "12px 14px" },
  memberCardHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  memberIndex: { width: 22, height: 22, borderRadius: "50%", background: "#DCEFD6", color: "#14532B", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  memberCardTitle: { fontSize: 13, fontWeight: 700, color: "#22422A", flex: 1 },
  memberMirrorText: { fontSize: 13, color: "#4B6350", margin: 0 },
  inviteBadge: { fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#F3E3DC", color: "#B4491F" },
  inviteBadgeSent: { background: "#DCEFD6", color: "#2E6B2A" },
  removeMemberButton: { border: "none", background: "#F3E3DC", color: "#B4491F", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  inviteRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  memberInputFull: { flex: "1 1 160px", border: "1.5px solid #DDE6D1", borderRadius: 8, background: "#F7F4EA", fontSize: 13, color: "#22422A", outline: "none", padding: "8px 10px" },
  sendInviteButton: { display: "flex", alignItems: "center", gap: 5, border: "none", background: "#2E6B2A", color: "#F7F4EA", borderRadius: 8, padding: "0 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  memberRowInputs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  memberInput: { flex: "1 1 120px", border: "1.5px solid #DDE6D1", borderRadius: 8, background: "#F7F4EA", fontSize: 13, color: "#22422A", outline: "none", padding: "8px 10px" },
  skillChipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  skillChip: { fontSize: 11.5, padding: "5px 11px", borderRadius: 999, border: "1.5px solid #C9D6BE", background: "#F7F4EA", color: "#4B6350", cursor: "pointer" },
  skillChipActive: { background: "#2E6B2A", color: "#F7F4EA", borderColor: "#2E6B2A" },

  reviewBlock: { border: "1.5px solid #DDE6D1", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#FCFBF6" },
  reviewBlockHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  reviewBlockLabel: { fontSize: 12.5, fontWeight: 700, color: "#14532B", textTransform: "uppercase", letterSpacing: 0.5 },
  reviewBlockBody: { fontSize: 13.5, color: "#22422A", lineHeight: 1.6 },
  editButton: { display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: "#2E6B2A", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  termsRow: { display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, cursor: "pointer" },
  checkbox: { marginTop: 3, width: 16, height: 16, accentColor: "#2E6B2A" },
  termsText: { fontSize: 13.5, color: "#22422A" },
  termsLink: { color: "#2E6B2A", fontWeight: 700, textDecoration: "underline" },
  navRow: { display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 20, gap: 10 },
  backButton: { display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", color: "#2E6B2A", border: "1.5px solid #2E6B2A", borderRadius: 999, padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  ctaButton: { display: "inline-flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg,#2E6B2A,#14532B)", color: "#F7F4EA", border: "none", borderRadius: 999, padding: "16px 34px", fontSize: 15.5, fontWeight: 800, letterSpacing: 1, cursor: "pointer", boxShadow: "0 10px 24px rgba(20,83,43,0.35)" },
  illustrationWrap: { marginTop: 6, lineHeight: 0 },

  ticketOuter: { position: "relative", zIndex: 1, width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 12px 40px", boxSizing: "border-box" },
  ticketGlow: { position: "absolute", top: -40, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(95,209,224,0.28) 0%, rgba(46,107,42,0.16) 45%, rgba(46,107,42,0) 72%)", pointerEvents: "none", zIndex: -1 },
  ticketKicker: { fontSize: 12.5, fontWeight: 700, letterSpacing: 2, color: "#3F7A3B", marginBottom: 6 },
  ticketHeadline: { textAlign: "center", fontSize: 34, lineHeight: 1.15, fontWeight: 800, color: "#14532B", letterSpacing: -0.5, margin: "0 0 28px" },
  ticketCard: { position: "relative", display: "flex", width: "100%", background: "#F7F4EA", border: "3px solid #14532B", borderRadius: 22, boxShadow: "0 24px 50px rgba(20,83,43,0.22)", overflow: "hidden", boxSizing: "border-box" },
  ticketNotchLeft: { position: "absolute", left: "calc(72% - 12px)", top: -14, width: 26, height: 26, borderRadius: "50%", background: "#EFEBDD", border: "3px solid #14532B" },
  ticketNotchRight: { position: "absolute", left: "calc(72% - 12px)", bottom: -14, width: 26, height: 26, borderRadius: "50%", background: "#EFEBDD", border: "3px solid #14532B" },
  ticketMain: { flex: "0 0 72%", padding: "26px 24px", display: "flex", flexDirection: "column", gap: 6, boxSizing: "border-box" },
  ticketEyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: "#3F7A3B" },
  ticketTeamName: { fontSize: 26, fontWeight: 800, color: "#14532B", margin: "0 0 6px" },
  ticketLine: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4B6350", margin: 0 },
  ticketBadgeRow: { marginTop: 14 },
  waxSealLg: { display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#C9A227,#A9821D)", color: "#F7F4EA", fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 999, boxShadow: "0 6px 14px rgba(169,130,29,0.35)" },
  ticketDivider: { flex: "0 0 1px", display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center", padding: "18px 0" },
  ticketDividerDot: { width: 4, height: 4, borderRadius: "50%", background: "#C9D6BE" },
  ticketStub: { flex: "0 0 28%", background: "#0F3D2E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "20px 14px", boxSizing: "border-box" },
  ticketStubLabel: { color: "#C9E4B8", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textAlign: "center" },
};

if (typeof document !== "undefined" && !document.getElementById("ffai-keyframes")) {
  const style = document.createElement("style");
  style.id = "ffai-keyframes";
  style.innerHTML = `
    input:focus, textarea:focus { border-color: #2E6B2A !important; box-shadow: 0 0 0 3px rgba(46,107,42,0.15) !important; }

    /* ---- Responsive breakpoints ---- */
    @media (max-width: 640px) {
      .ffai-navbar { padding: 14px !important; }
      .ffai-hero { padding: 32px 18px 22px 18px !important; }
      .ffai-title { font-size: 26px !important; }
      .ffai-tagline { font-size: 14px !important; }
      .ffai-hackathon-text { font-size: 16px !important; letter-spacing: 1px !important; }
      .ffai-home-body { padding: 22px 18px 4px !important; }
      .ffai-glassbar { flex-wrap: wrap !important; justify-content: center !important; gap: 6px 4px !important; padding: 10px 14px !important; }
      .ffai-glassbar-item { font-size: 11.5px !important; }
      .ffai-glassbar-divider { display: none !important; }
      .ffai-desk-title { font-size: 22px !important; }
      .ffai-section-card { padding: 22px 16px 16px !important; }
      .ffai-grid2 { grid-template-columns: 1fr !important; column-gap: 0 !important; }
      .ffai-member-grid { grid-template-columns: 1fr !important; }
      .ffai-team-header { align-items: flex-start !important; }
      .ffai-nav-row { flex-wrap: wrap !important; justify-content: center !important; }
      .ffai-ticket-headline { font-size: 26px !important; margin-bottom: 20px !important; }
      .ffai-ticket-card { flex-direction: column !important; }
      .ffai-ticket-main { flex: 1 1 auto !important; padding: 22px 18px !important; }
      .ffai-ticket-stub { flex: 1 1 auto !important; flex-direction: row !important; padding: 16px 18px !important; justify-content: center !important; }
      .ffai-ticket-divider { flex-direction: row !important; width: 100% !important; height: auto !important; padding: 0 18px !important; }
      .ffai-notch-left, .ffai-notch-right { display: none !important; }
    }
    @media (max-width: 420px) {
      .ffai-title { font-size: 22px !important; }
      .ffai-hackathon-text { font-size: 14px !important; }
      .ffai-ticket-headline { font-size: 22px !important; }
      .ffai-ticket-stub { flex-direction: column !important; }
    }
  `;
  document.head.appendChild(style);
}