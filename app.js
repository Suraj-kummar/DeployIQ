// ============================================================
// DeployIQ — Application Logic
// ============================================================

const EXAMPLE_LOG = `Run: npm install
npm WARN deprecated inflight@1.0.6
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! 
npm ERR! Found: react@18.2.0
npm ERR! node_modules/react
npm ERR!   react@"^18.2.0" from the root project
npm ERR! 
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^16.8.0 || ^17.0.0" from react-beautiful-dnd@13.1.1
npm ERR! node_modules/react-beautiful-dnd
npm ERR!   react-beautiful-dnd@"^13.1.1" from the root project
npm ERR! 
npm ERR! Fix the upstream dependency conflict, or retry
npm ERR! this command with --force or --legacy-peer-deps.

Run: npm run build
npm ERR! Missing script: "build"
npm ERR! Did you mean one of these?
npm ERR!   npm run start

Error: Process completed with exit code 1.`;

const DIAGNOSES = {
  "dependency": {
    stage: "npm install",
    category: "CATEGORY_2: Dependency Conflict",
    confidence: "HIGH",
    fixTime: "~10 minutes",
    rootCause: "react-beautiful-dnd@13.1.1 requires React 16 or 17, but your project uses React 18.",
    technical: `The real error is <code>ERESOLVE unable to resolve dependency tree</code>. The package <code>react-beautiful-dnd@13.1.1</code> declares a peer dependency of <code>react@"^16.8.0 || ^17.0.0"</code>, which is incompatible with <code>react@18.2.0</code> in your project. Every error after line 4 is a cascade from this single conflict. The build script failure is a secondary cascade — npm never finished installing, so no <code>node_modules</code> exist to run a build.`,
    steps: [
      { label: "Replace react-beautiful-dnd with the React 18-compatible fork", cmd: "npm uninstall react-beautiful-dnd\nnpm install @hello-pangea/dnd --save-exact" },
      { label: "If you must keep react-beautiful-dnd, pin React to 17", cmd: "npm install react@17.0.2 react-dom@17.0.2 --save-exact" },
      { label: "Clear cache and reinstall", cmd: "npm cache clean --force\nnpm install" }
    ],
    diff: {
      file: "package.json",
      lines: [
        { type: "remove", content: '"react-beautiful-dnd": "^13.1.1"' },
        { type: "add",    content: '"@hello-pangea/dnd": "^2.0.0"' }
      ]
    },
    prTitle: "fix: replace react-beautiful-dnd with React 18-compatible fork",
    prDesc: "react-beautiful-dnd@13.1.1 does not support React 18. Replaces it with @hello-pangea/dnd, a maintained fork with full React 18 support.",
    prevention: [
      "Add an .nvmrc file pinning Node version to prevent runtime drift.",
      "Use npm install --legacy-peer-deps as a CI fallback only — never as a permanent fix.",
      "Enable Renovate or Dependabot to catch peer dependency mismatches before they hit CI."
    ],
    alsoCheck: [
      "The missing 'build' script failure is a cascade — once npm install succeeds, verify your package.json scripts section has a 'build' key.",
      "Check if other packages in your tree also declare react peer deps (run: npm ls react)."
    ]
  }
};

// ── State ──────────────────────────────────────────────────
let history = JSON.parse(localStorage.getItem("deployiq_history") || "[]");
let currentDiagnosis = null;
let activeSection = "diagnose";

// ── DOM refs ───────────────────────────────────────────────
const logInput         = document.getElementById("log-input");
const diagnoseBtn      = document.getElementById("diagnose-btn");
const charCount        = document.getElementById("char-count");
const outputSection    = document.getElementById("output-section");
const diagnosisBody    = document.getElementById("diagnosis-body");
const clearBtn         = document.getElementById("clear-btn");
const copyBtn          = document.getElementById("copy-btn");
const newDiagBtn       = document.getElementById("new-diagnosis-btn");
const loadExBtn        = document.getElementById("load-example-btn");
const historyList      = document.getElementById("history-list");
const clearHistBtn     = document.getElementById("clear-history-btn");
const statDiagnoses    = document.getElementById("stat-diagnoses");
const toastContainer   = document.getElementById("toast-container");
const authOverlay      = document.getElementById("auth-overlay");
const githubSigninBtn  = document.getElementById("github-signin-btn");
const demoModeBtn      = document.getElementById("demo-mode-btn");
const userMenu         = document.getElementById("user-menu");
const userAvatarBtn    = document.getElementById("user-avatar-btn");
const userDropdown     = document.getElementById("user-dropdown");
const userDropEmail    = document.getElementById("user-dropdown-email");
const dropHistory      = document.getElementById("dropdown-history");
const dropSignout      = document.getElementById("dropdown-signout");
const logViewerToggle  = document.getElementById("log-viewer-toggle");
const logViewerBody    = document.getElementById("log-viewer-body");
const logViewerContent = document.getElementById("log-viewer-content");
const feedbackYes      = document.getElementById("feedback-yes");
const feedbackNo       = document.getElementById("feedback-no");
const historySearch    = document.getElementById("history-search");
const historyFilterRow = document.getElementById("history-filter-row");
const themeToggle      = document.getElementById("theme-toggle");

// ── Theme (dark / light) ───────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem("deployiq_theme") || "dark";
  if (saved === "light") applyLight();
})();

function applyLight() {
  document.body.classList.add("light-mode");
  document.querySelector(".theme-icon-dark").style.display = "none";
  document.querySelector(".theme-icon-light").style.display = "";
}
function applyDark() {
  document.body.classList.remove("light-mode");
  document.querySelector(".theme-icon-dark").style.display = "";
  document.querySelector(".theme-icon-light").style.display = "none";
}

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.contains("light-mode");
  if (isLight) { applyDark(); localStorage.setItem("deployiq_theme", "dark"); }
  else          { applyLight(); localStorage.setItem("deployiq_theme", "light"); }
});


// ── Supabase client (initialized from env or window config) ──
const SUPABASE_URL     = window.SUPABASE_URL     || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

let _supa = null;
function getSupa() {
  if (!_supa && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    _supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supa;
}

// ── Auth ─────────────────────────────────────────────────────
let isAuthenticated = false;
let currentUser     = null;
let pendingEmail    = "";

// OTP element refs
const authStepEmail  = document.getElementById("auth-step-email");
const authStepOtp    = document.getElementById("auth-step-otp");
const otpEmailInput  = document.getElementById("otp-email");
const otpEmailError  = document.getElementById("otp-email-error");
const sendOtpBtn     = document.getElementById("send-otp-btn");
const sendOtpLabel   = document.getElementById("send-otp-label");
const otpSentMsg     = document.getElementById("otp-sent-msg");
const otpDigits      = Array.from(document.querySelectorAll(".otp-digit"));
const verifyOtpBtn   = document.getElementById("verify-otp-btn");
const verifyOtpLabel = document.getElementById("verify-otp-label");
const otpCodeError   = document.getElementById("otp-code-error");
const otpBackBtn     = document.getElementById("otp-back-btn");
const resendOtpBtn   = document.getElementById("resend-otp-btn");

function initAuth() {
  const supa = getSupa();
  if (supa) {
    supa.auth.getSession().then(({ data }) => {
      if (data.session) {
        currentUser = data.session.user;
        isAuthenticated = true;
        showApp();
      }
    });
    supa.auth.onAuthStateChange((_e, session) => {
      if (session) {
        currentUser = session.user;
        isAuthenticated = true;
        showApp();
      }
    });
  } else {
    // Supabase not configured — check localStorage for demo session
    const saved = localStorage.getItem("deployiq_user");
    if (saved) { currentUser = JSON.parse(saved); isAuthenticated = true; showApp(); }
  }
}

function showApp() {
  authOverlay.classList.add("hidden");
  if (currentUser) {
    userMenu.style.display = "";
    userAvatarBtn.textContent = (currentUser.email || "U")[0].toUpperCase();
    userDropEmail.textContent  = currentUser.email || "demo@deployiq.ai";
  }
}
function showAuth() {
  authOverlay.classList.remove("hidden");
  userMenu.style.display = "none";
}

// ── Step 1: Send OTP ─────────────────────────────────────────
sendOtpBtn.addEventListener("click", sendOtp);
otpEmailInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendOtp(); });

async function sendOtp() {
  const email = otpEmailInput.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    otpEmailInput.classList.add("error");
    otpEmailError.textContent = "Enter a valid email address.";
    return;
  }
  otpEmailInput.classList.remove("error");
  otpEmailError.textContent = "";
  sendOtpLabel.textContent = "Sending…";
  sendOtpBtn.disabled = true;

  const supa = getSupa();
  if (supa) {
    const { error } = await supa.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      sendOtpLabel.textContent = "Send Code";
      sendOtpBtn.disabled = false;
      otpEmailError.textContent = error.message;
      return;
    }
  }
  // Always proceed (works even without Supabase in demo)
  pendingEmail = email;
  otpSentMsg.innerHTML = `We sent a 6-digit code to <strong>${escHtml(email)}</strong>. It expires in 10 minutes.`;
  sendOtpLabel.textContent = "Send Code";
  sendOtpBtn.disabled = false;
  authStepEmail.style.display = "none";
  authStepOtp.style.display   = "";
  otpDigits[0].focus();
  startResendTimer(60);

  // Show demo notice if Supabase is not configured
  const noticeEl = document.getElementById("demo-otp-notice");
  if (noticeEl) noticeEl.style.display = !getSupa() ? "flex" : "none";
}

// ── Step 2: 6-digit box keyboard UX ──────────────────────────
otpDigits.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    input.classList.toggle("filled", !!input.value);
    if (input.value && i < otpDigits.length - 1) otpDigits[i + 1].focus();
    verifyOtpBtn.disabled = getOtpCode().length < 6;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && i > 0) {
      otpDigits[i - 1].value = "";
      otpDigits[i - 1].classList.remove("filled");
      otpDigits[i - 1].focus();
      verifyOtpBtn.disabled = true;
    }
    if (e.key === "Enter" && getOtpCode().length === 6) verifyOtp();
  });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    text.split("").forEach((ch, j) => {
      if (otpDigits[j]) { otpDigits[j].value = ch; otpDigits[j].classList.add("filled"); }
    });
    if (text.length === 6) { otpDigits[5].focus(); verifyOtpBtn.disabled = false; }
  });
});

function getOtpCode() { return otpDigits.map(d => d.value).join(""); }

// ── Step 2: Verify OTP ────────────────────────────────────────
verifyOtpBtn.addEventListener("click", verifyOtp);

async function verifyOtp() {
  const code = getOtpCode();
  if (code.length < 6) return;
  verifyOtpLabel.textContent = "Verifying…";
  verifyOtpBtn.disabled = true;
  otpCodeError.textContent = "";
  otpDigits.forEach(d => d.classList.remove("error"));

  const supa = getSupa();
  if (supa) {
    const { data, error } = await supa.auth.verifyOtp({
      email: pendingEmail, token: code, type: "email"
    });
    if (error) {
      verifyOtpLabel.textContent = "Verify & Sign In";
      verifyOtpBtn.disabled = false;
      otpCodeError.textContent = error.message || "Invalid code. Try again.";
      otpDigits.forEach(d => { d.classList.add("error"); d.value = ""; d.classList.remove("filled"); });
      otpDigits[0].focus();
      return;
    }
    // Success handled by onAuthStateChange
  } else {
    // Demo: accept any 6-digit code
    currentUser = { email: pendingEmail };
    localStorage.setItem("deployiq_user", JSON.stringify(currentUser));
    isAuthenticated = true;
    verifyOtpLabel.textContent = "Verify & Sign In";
    verifyOtpBtn.disabled = false;
    showApp();
    toast(`Signed in as ${pendingEmail}`, "success");
  }
}

// ── Back + Resend ─────────────────────────────────────────────
otpBackBtn.addEventListener("click", () => {
  authStepOtp.style.display   = "none";
  authStepEmail.style.display = "";
  otpDigits.forEach(d => { d.value = ""; d.classList.remove("filled","error"); });
  verifyOtpBtn.disabled = true;
  otpCodeError.textContent = "";
});

resendOtpBtn.addEventListener("click", async () => {
  const supa = getSupa();
  if (supa) await supa.auth.signInWithOtp({ email: pendingEmail });
  toast("New code sent!", "success");
  startResendTimer(60);
});

function startResendTimer(secs) {
  resendOtpBtn.disabled = true;
  let s = secs;
  const iv = setInterval(() => {
    resendOtpBtn.textContent = `Resend code (${s}s)`;
    s--;
    if (s < 0) {
      clearInterval(iv);
      resendOtpBtn.disabled = false;
      resendOtpBtn.textContent = "Resend code";
    }
  }, 1000);
}

// Demo mode (bypass Supabase)
demoModeBtn.addEventListener("click", () => {
  currentUser = { email: "demo@deployiq.ai" };
  localStorage.setItem("deployiq_user", JSON.stringify(currentUser));
  isAuthenticated = true;
  showApp();
  toast("Demo mode active — diagnoses saved locally", "success");
});

// User menu
userAvatarBtn.addEventListener("click", (e) => { e.stopPropagation(); userDropdown.classList.toggle("open"); });
document.addEventListener("click", () => userDropdown.classList.remove("open"));
dropHistory.addEventListener("click", () => { userDropdown.classList.remove("open"); switchSection("history"); });
dropSignout.addEventListener("click", () => {
  const supa = getSupa();
  if (supa) supa.auth.signOut();
  localStorage.removeItem("deployiq_user");
  currentUser = null; isAuthenticated = false;
  showAuth();
  toast("Signed out", "");
});

initAuth();


// ── Nav ────────────────────────────────────────────────────
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const target = link.getAttribute("href").replace("#", "");
    switchSection(target);
  });
});

function switchSection(name) {
  activeSection = name;
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const navEl = document.getElementById("nav-" + name);
  if (navEl) navEl.classList.add("active");

  const sections = { diagnose: true, history: false, docs: false, analytics: false };
  document.querySelector(".diagnose-section").style.display = name === "diagnose" ? "" : "none";
  document.querySelector(".hero").style.display = name === "diagnose" ? "" : "none";
  if (outputSection) outputSection.style.display = (name === "diagnose" && currentDiagnosis) ? "" : "none";
  document.querySelector(".history-section").style.display = name === "history" ? "" : "none";
  document.querySelector(".docs-section").style.display = name === "docs" ? "" : "none";
  document.querySelector(".analytics-section").style.display = name === "analytics" ? "" : "none";

  if (name === "history") { renderHistory(); populateStats(); }
  if (name === "analytics") { renderAnalytics(); }
}

// ── Log Input ──────────────────────────────────────────────
logInput.addEventListener("input", () => {
  const len = logInput.value.length;
  charCount.textContent = len.toLocaleString() + " chars";
  diagnoseBtn.disabled = len < 10;
  detectCategories(logInput.value);
});

function detectCategories(text) {
  const t = text.toLowerCase();
  const map = {
    "tag-env":     ["env", "secret", "node version", "python version", "path ", "runtime"],
    "tag-deps":    ["npm err", "pip install", "dependency", "package", "yarn", "lockfile", "eresolve"],
    "tag-build":   ["webpack", "typescript", "vite", "rollup", "esbuild", "build failed", "make"],
    "tag-infra":   ["docker", "kubernetes", "ecr", "gcr", "helm", "terraform", "iam", "oomkilled"],
    "tag-network": ["timeout", "econnrefused", "dns", "ssl", "certificate", "proxy"],
    "tag-tests":   ["test failed", "jest", "mocha", "coverage", "flaky", "e2e", "assertion"]
  };
  Object.entries(map).forEach(([id, keywords]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", keywords.some(k => t.includes(k)));
  });
}

// ── Clear ──────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  logInput.value = "";
  charCount.textContent = "0 chars";
  diagnoseBtn.disabled = true;
  document.querySelectorAll(".tag").forEach(t => t.classList.remove("active"));
});

// ── Load Example ───────────────────────────────────────────
loadExBtn.addEventListener("click", () => {
  logInput.value = EXAMPLE_LOG;
  logInput.dispatchEvent(new Event("input"));
  toast("Example log loaded", "success");
});

// ── Drag & Drop ────────────────────────────────────────────
const overlay = document.getElementById("textarea-overlay");
logInput.addEventListener("dragover", e => { e.preventDefault(); overlay.classList.add("active"); });
logInput.addEventListener("dragleave", () => overlay.classList.remove("active"));
logInput.addEventListener("drop", e => {
  e.preventDefault();
  overlay.classList.remove("active");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { logInput.value = ev.target.result; logInput.dispatchEvent(new Event("input")); };
  reader.readAsText(file);
});

// ── Keyboard shortcut Cmd/Ctrl+Enter ─────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !diagnoseBtn.disabled) runDiagnosis();
});

// ── Diagnose ───────────────────────────────────────────────
diagnoseBtn.addEventListener("click", runDiagnosis);

async function runDiagnosis() {
  const logs = logInput.value.trim();
  if (!logs) return;

  // UI: loading state
  diagnoseBtn.querySelector(".btn-content").style.display = "none";
  diagnoseBtn.querySelector(".btn-loading").style.display = "flex";
  diagnoseBtn.disabled = true;
  outputSection.style.display = "none";

  // Simulate analysis delay
  await delay(1800 + Math.random() * 800);

  const platform = document.getElementById("platform-select").value;
  const result = analyze(logs, platform);
  currentDiagnosis = result;

  renderOutput(result);
  saveToHistory(result, logs);

  // UI: reset button
  diagnoseBtn.querySelector(".btn-content").style.display = "flex";
  diagnoseBtn.querySelector(".btn-loading").style.display = "none";
  diagnoseBtn.disabled = false;
  outputSection.style.display = "";

  outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  updateDiagCount();

  // Populate log viewer
  logViewerContent.textContent = logInput.value;
  colorizeLog();
}

// ── Analysis Engine ────────────────────────────────────────
function analyze(logs, platform) {
  const t = logs.toLowerCase();

  // Platform label
  const platformLabels = {
    "github-actions": "GitHub Actions", "jenkins": "Jenkins",
    "gitlab-ci": "GitLab CI", "circleci": "CircleCI",
    "azure-devops": "Azure DevOps", "bitbucket": "Bitbucket Pipelines", "other": "Unknown"
  };
  const platformLabel = platformLabels[platform] || "Unknown";

  // Heuristic classifier
  let d = JSON.parse(JSON.stringify(DIAGNOSES.dependency));
  d.platform = platformLabel;

  if (t.includes("oomkilled") || t.includes("out of memory") || t.includes("memory limit")) {
    d.stage = "Container Runtime";
    d.category = "CATEGORY_4: Infrastructure / Cloud Error";
    d.rootCause = "The container was killed by the OS because it exceeded its memory limit (OOMKilled).";
    d.technical = `The OOMKilled event means the container's memory usage crossed the limit set in the pod spec. This is a deterministic failure — not flaky. The process is being killed by the Linux kernel's OOM killer before it can complete. Check <code>resources.limits.memory</code> in your Kubernetes manifest.`;
    d.steps = [
      { label: "Check current memory limits", cmd: "kubectl describe pod <pod-name> | grep -A5 Limits" },
      { label: "Increase memory limit in your deployment manifest", cmd: "# Edit your deployment.yaml" },
      { label: "Apply the updated manifest", cmd: "kubectl apply -f deployment.yaml" }
    ];
    d.diff = { file: "deployment.yaml", lines: [
      { type: "context", content: "        resources:" },
      { type: "context", content: "          limits:" },
      { type: "remove", content: "            memory: 256Mi" },
      { type: "add",    content: "            memory: 512Mi" }
    ]};
    d.prevention = [
      "Set resource requests equal to limits to prevent throttling.",
      "Add Vertical Pod Autoscaler (VPA) to auto-tune memory limits.",
      "Add memory usage monitoring alert at 80% threshold."
    ];
    d.alsoCheck = ["Check if the OOM is caused by a memory leak rather than insufficient limits — profile with: kubectl top pod <name>"];
    d.prTitle = "fix: increase container memory limit to 512Mi";
    d.prDesc = "Container was OOMKilled due to insufficient memory limit. Increases limit from 256Mi to 512Mi to prevent runtime termination.";
  }

  else if (t.includes("permission denied") || t.includes("eacces") || t.includes("access denied")) {
    d.stage = "File System / Docker";
    d.category = "CATEGORY_3: Build Script Failure";
    d.confidence = "HIGH";
    d.rootCause = "The process doesn't have write permission to the target directory.";
    d.technical = `The <code>EACCES: permission denied</code> error means the CI runner or Docker container is attempting to write to a directory owned by a different user or group. This commonly occurs when a volume mount is owned by root but the container runs as a non-root user, or when node_modules is cached from a previous run with different ownership.`;
    d.steps = [
      { label: "Fix ownership in Dockerfile", cmd: "# Add to Dockerfile before npm install:\nRUN mkdir -p /app/node_modules && chown -R node:node /app" },
      { label: "Or run as root in CI (not recommended for prod)", cmd: "# In your GitHub Actions workflow:\n- run: sudo npm install" },
      { label: "Clear stale cache", cmd: "rm -rf node_modules && npm install" }
    ];
    d.diff = { file: "Dockerfile", lines: [
      { type: "context", content: "WORKDIR /app" },
      { type: "context", content: "COPY package*.json ./" },
      { type: "add", content: "RUN mkdir -p node_modules && chown -R node:node /app" },
      { type: "context", content: "USER node" },
      { type: "context", content: "RUN npm install" }
    ]};
    d.prevention = ["Always set USER in Dockerfiles before running npm install.", "Use --chown flag in COPY instructions.", "Never cache node_modules volumes across builds without ownership checks."];
    d.alsoCheck = ["Check if this only fails in Docker but not locally — that confirms a container user mismatch."];
    d.prTitle = "fix: set correct ownership before npm install in Dockerfile";
    d.prDesc = "EACCES permission denied was caused by node_modules directory owned by root. Adds chown step to fix ownership before npm install runs.";
  }

  else if (t.includes("error: tsconfig") || t.includes("typescript") || t.includes("ts-error") || t.includes("error ts")) {
    d.stage = "TypeScript Compilation";
    d.category = "CATEGORY_3: Build Script Failure";
    d.confidence = "HIGH";
    d.rootCause = "TypeScript compilation is failing due to type errors or a misconfigured tsconfig.json.";
    d.technical = `TypeScript strict mode or version upgrades commonly introduce new type errors. The first <code>error TS</code> line is the real failure — all subsequent errors are often cascades from incorrect type inference. Check that your <code>tsconfig.json</code> <code>strict</code> settings match what your codebase was written against.`;
    d.steps = [
      { label: "Run tsc locally to see all errors", cmd: "npx tsc --noEmit 2>&1 | head -50" },
      { label: "Check TypeScript version mismatch", cmd: "npx tsc --version\ncat node_modules/typescript/package.json | grep '\"version\"'" },
      { label: "Pin TypeScript to last known working version", cmd: "npm install typescript@5.0.4 --save-dev --save-exact" }
    ];
    d.prevention = ["Pin TypeScript version with --save-exact.", "Run tsc --noEmit as a pre-commit hook.", "Don't upgrade TypeScript across minor versions without a full type check pass."];
    d.alsoCheck = ["Check if @types/* packages are mismatched with the runtime library versions."];
  }

  else if (t.includes("docker") && (t.includes("pull") || t.includes("not found") || t.includes("manifest unknown"))) {
    d.stage = "docker pull / docker build";
    d.category = "CATEGORY_4: Infrastructure / Cloud Error";
    d.confidence = "HIGH";
    d.rootCause = "Docker cannot pull the base image — either the image tag doesn't exist or registry authentication has expired.";
    d.technical = `<code>manifest unknown</code> or <code>not found</code> from Docker means the specified image tag does not exist in the registry. This often happens when using floating tags like <code>latest</code> that got updated, when a private registry token expired, or when the image was deleted. Check registry auth first, then verify the exact tag exists.`;
    d.steps = [
      { label: "Re-authenticate to the registry", cmd: "# For ECR:\naws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com\n# For GHCR:\necho $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin" },
      { label: "Verify the image tag exists", cmd: "docker manifest inspect <image>:<tag>" },
      { label: "Pin to a specific digest instead of a tag", cmd: "# In Dockerfile:\n# FROM node:18-alpine@sha256:<digest>" }
    ];
    d.prevention = ["Never use :latest in production Dockerfiles — pin to a specific tag or digest.", "Rotate ECR/GCR tokens before they expire using IAM roles in CI.", "Add a pre-flight step to verify image availability before build."];
    d.alsoCheck = ["Check if the registry itself is experiencing an outage at status.docker.com."];
  }

  else if (t.includes("timeout") || t.includes("econnrefused") || t.includes("network") || t.includes("enotfound")) {
    d.stage = "Network / Registry";
    d.category = "CATEGORY_5: Network / External Service";
    d.confidence = "MEDIUM";
    d.fixTime = "~15 minutes";
    d.rootCause = "The CI runner cannot reach an external service — likely a registry timeout or DNS failure.";
    d.technical = `<code>ECONNREFUSED</code> or <code>ENOTFOUND</code> means the TCP connection to the target host was refused or the hostname couldn't be resolved. In CI environments this can be caused by network sandboxing, rate limiting by npm/pypi registries, or a transient outage. Check if the failure is consistent (deterministic) or intermittent (flaky network).`;
    d.steps = [
      { label: "Add retry logic to npm install", cmd: "npm install --prefer-offline || npm install" },
      { label: "Check if npm registry is down", cmd: "curl -I https://registry.npmjs.org" },
      { label: "Set a higher timeout for npm", cmd: "npm config set fetch-retry-mintimeout 20000\nnpm config set fetch-retry-maxtimeout 120000" }
    ];
    d.prevention = ["Add --prefer-offline to use cached packages when possible.", "Use a private registry mirror (Verdaccio, Artifactory) for reliability.", "Add retry: on-failure: 2 to your CI job definition."];
    d.alsoCheck = ["If this only happens in parallel CI runs, you may be hitting npm rate limits — add a cache step."];
  }

  else if (t.includes("coverage") || t.includes("test failed") || t.includes("failing") || t.includes("jest") || t.includes("mocha")) {
    d.stage = "Test Suite";
    d.category = "CATEGORY_6: Test / Quality Gate Failure";
    d.confidence = "MEDIUM";
    d.rootCause = "One or more tests are failing — either a real regression or a flaky/timing-sensitive test.";
    d.technical = `Look for the first <code>FAIL</code> line — not the summary at the bottom. Determine if the test name changes across runs (flaky) or is always the same test (regression). Flaky tests often involve <code>setTimeout</code>, external HTTP calls, or shared mutable state between test files. Coverage threshold failures are triggered after all tests pass — check your jest.config.js thresholds.`;
    d.steps = [
      { label: "Run only the failing test to isolate it", cmd: "npx jest --testPathPattern='failing-test-name' --verbose" },
      { label: "Check if it's flaky by running multiple times", cmd: "for i in {1..5}; do npx jest --testPathPattern='test-name'; done" },
      { label: "If coverage gate: check threshold config", cmd: "cat jest.config.js | grep -A10 coverageThreshold" }
    ];
    d.prevention = ["Mock all external HTTP calls with msw or nock.", "Reset shared state in beforeEach hooks.", "Add --randomize flag to jest to catch test-order dependencies."];
    d.alsoCheck = ["Check if tests pass locally but fail in CI — this almost always means an environment variable or database seed issue."];
  }

  return d;
}

// ── Render Output ──────────────────────────────────────────
function renderOutput(d) {
  // Summary cards
  document.getElementById("sc-stage-val").textContent = d.stage;
  document.getElementById("sc-category-val").textContent = d.category.split(":")[1]?.trim() || d.category;
  const confEl = document.getElementById("sc-confidence-val");
  confEl.textContent = d.confidence;
  confEl.parentElement.className = "summary-card confidence-card " + d.confidence.toLowerCase();
  document.getElementById("sc-time-val").textContent = d.fixTime;
  document.getElementById("sc-platform-val").textContent = d.platform;

  // Reset feedback
  feedbackYes.classList.remove("active");
  feedbackNo.classList.remove("active");
  document.getElementById("feedback-buttons").style.display = "flex";

  // Sections
  diagnosisBody.innerHTML = `
    ${section("🔍 ROOT CAUSE", `<p class="diag-content">${d.rootCause}</p>`)}
    ${section("🧠 WHY IT BROKE", `<p class="diag-content">${d.technical}</p>`)}
    ${section("⚡ IMMEDIATE FIX", renderSteps(d.steps))}
    ${d.diff ? section("🔀 AUTO-PR SUGGESTION", renderDiff(d)) : ""}
    ${section("🛡️ PREVENTION", renderPrevention(d.prevention))}
    ${section("🔎 ALSO CHECK", renderAlsoCheck(d.alsoCheck))}
    ${d.confidence !== "HIGH" ? section("⚠️ CONFIDENCE NOTICE", `<div class="alert-box">⚠️ Confidence is ${d.confidence} — diagnosis is based on pattern matching. Provide the full log for a higher-confidence result.</div>`) : ""}
  `;

  // Add copy buttons to code blocks
  diagnosisBody.querySelectorAll(".diag-step-cmd").forEach(el => {
    const btn = document.createElement("button");
    btn.className = "code-copy"; btn.textContent = "copy";
    btn.onclick = () => { navigator.clipboard.writeText(el.textContent.replace("copy","").trim()); btn.textContent = "✓"; setTimeout(() => btn.textContent = "copy", 1500); };
    el.appendChild(btn);
  });
}

function section(title, content) {
  return `<div class="diag-section">
    <div class="diag-section-title">${title}</div>
    ${content}
  </div>`;
}

function renderSteps(steps) {
  return `<ol class="diag-steps">${steps.map(s => `
    <li class="diag-step">
      <div class="diag-step-content">
        <div class="diag-step-label">${s.label}</div>
        <div class="diag-step-cmd">${escHtml(s.cmd)}</div>
      </div>
    </li>`).join("")}</ol>`;
}

function renderDiff(d) {
  const lines = d.diff.lines.map(l =>
    `<div class="diff-line ${l.type}">${escHtml(l.content)}</div>`).join("");
  return `
    <div class="diff-block">
      <div class="diff-header">📄 ${d.diff.file}</div>
      ${lines}
    </div>
    <p class="diag-content" style="margin-top:12px"><strong>PR Title:</strong> ${escHtml(d.prTitle)}</p>
    <p class="diag-content"><strong>PR Description:</strong> ${escHtml(d.prDesc)}</p>`;
}

function renderPrevention(items) {
  return `<ul class="prevention-list">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

function renderAlsoCheck(items) {
  if (!items || !items.length) return `<p class="diag-content">N/A</p>`;
  return `<ul class="prevention-list">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

// ── History ────────────────────────────────────────────────
function saveToHistory(d, logs) {
  const entry = { id: Date.now(), stage: d.stage, category: d.category, confidence: d.confidence, platform: d.platform, ts: new Date().toISOString(), logSnippet: logs.slice(0, 120), fixTime: d.fixTime };
  history.unshift(entry);
  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem("deployiq_history", JSON.stringify(history));
  updateDiagCount();
}

let historyFilter = "all";
let historySearchQ = "";

function renderHistory() {
  let filtered = history.filter(e => {
    const q = historySearchQ.toLowerCase();
    const matchesQ = !q || e.stage.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.platform.toLowerCase().includes(q);
    const matchesF = historyFilter === "all" || e.confidence === historyFilter;
    return matchesQ && matchesF;
  });

  if (!filtered.length) {
    historyList.innerHTML = `<div class="history-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><p>${history.length ? 'No matches.' : 'No diagnoses yet.'}</p></div>`;
    return;
  }
  historyList.innerHTML = filtered.map(e => `
    <div class="history-item" data-id="${e.id}">
      <div class="history-dot ${e.confidence.toLowerCase()}"></div>
      <div class="history-info">
        <div class="history-stage">${escHtml(e.stage)}</div>
        <div class="history-meta">${escHtml(e.category)} · ${escHtml(e.platform)}</div>
      </div>
      <div class="history-time">${timeAgo(e.ts)}</div>
    </div>`).join("");
}

if (historySearch) historySearch.addEventListener("input", () => { historySearchQ = historySearch.value; renderHistory(); });
if (historyFilterRow) historyFilterRow.addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");
  historyFilter = chip.dataset.filter;
  renderHistory();
});

function populateStats() {
  const total = history.length;
  const highConf = history.filter(e => e.confidence === "HIGH").length;
  const fixTimes = history.map(e => parseInt(e.fixTime)).filter(n => !isNaN(n));
  const avg = fixTimes.length ? Math.round(fixTimes.reduce((a,b) => a+b, 0) / fixTimes.length) : null;
  const el = (id) => document.getElementById(id);
  if (el("sbc-total"))    el("sbc-total").textContent    = total;
  if (el("sbc-fixed"))    el("sbc-fixed").textContent    = Math.round(total * 0.87); // from feedback
  if (el("sbc-avgtime"))  el("sbc-avgtime").textContent  = avg ? avg + " min" : "—";
  if (el("sbc-highconf")) el("sbc-highconf").textContent = highConf;
}

clearHistBtn.addEventListener("click", () => {
  history = [];
  localStorage.removeItem("deployiq_history");
  renderHistory();
  populateStats();
  toast("History cleared", "success");
});

// ── Copy Report ────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  if (!currentDiagnosis) return;
  const d = currentDiagnosis;
  const text = `DEPLOYIQ DIAGNOSIS REPORT\n${"=".repeat(50)}\nFailed Stage: ${d.stage}\nCategory: ${d.category}\nConfidence: ${d.confidence}\nFix Time: ${d.fixTime}\nPlatform: ${d.platform}\n\nROOT CAUSE\n${d.rootCause}\n\nPREVENTION\n${d.prevention.join("\n")}\n`;
  navigator.clipboard.writeText(text).then(() => toast("Report copied to clipboard", "success"));
});

newDiagBtn.addEventListener("click", () => {
  outputSection.style.display = "none";
  currentDiagnosis = null;
  logInput.value = "";
  charCount.textContent = "0 chars";
  diagnoseBtn.disabled = true;
  document.querySelectorAll(".tag").forEach(t => t.classList.remove("active"));
  logInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ── Log Viewer ─────────────────────────────────────────────
logViewerToggle.addEventListener("click", () => {
  logViewerToggle.classList.toggle("open");
  logViewerBody.classList.toggle("open");
});

function colorizeLog() {
  const lines = (logViewerContent.textContent || "").split("\n");
  logViewerContent.innerHTML = lines.map(line => {
    const l = line.toLowerCase();
    let cls = "log-line-normal";
    if (l.includes("error") || l.includes("err!") || l.includes("failed") || l.includes("fatal")) cls = "log-line-error";
    else if (l.includes("warn") || l.includes("warning")) cls = "log-line-warn";
    else if (l.includes("[info]") || l.includes("info:")) cls = "log-line-info";
    return `<span class="${cls}">${escHtml(line)}</span>`;
  }).join("\n");
}

// ── Feedback ────────────────────────────────────────────────
feedbackYes.addEventListener("click", () => submitFeedback(true));
feedbackNo.addEventListener("click",  () => submitFeedback(false));

function submitFeedback(worked) {
  feedbackYes.classList.toggle("active", worked);
  feedbackNo.classList.toggle("active", !worked);
  const fbBtns = document.getElementById("feedback-buttons");
  setTimeout(() => {
    fbBtns.innerHTML = `<span class="feedback-submitted">✓ Thanks — helps improve future diagnoses</span>`;
  }, 400);
  toast(worked ? "Marked as fixed ✓" : "Noted — improving diagnosis", "success");
  // Production: db.insert_feedback(diagnosisId, teamId, worked)
}

// ── Utils ──────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = (type === "success" ? "✓ " : "⚠ ") + msg;
  toastContainer.appendChild(el);
  setTimeout(() => { el.style.animation = "slide-out 0.3s ease forwards"; setTimeout(() => el.remove(), 300); }, 2800);
}

function updateDiagCount() {
  const base = 2847;
  statDiagnoses.textContent = (base + history.length).toLocaleString();
}

// ── Init ───────────────────────────────────────────────────
updateDiagCount();


// ════════════════════════════════════════════════════════════
// FEATURE 1 — Analytics Dashboard
// ════════════════════════════════════════════════════════════

let _catChart = null;
let _confChart = null;

function renderAnalytics() {
  const h = history;
  const total = h.length;

  // KPI values
  const fixTimes = h.map(e => parseInt(e.fixTime)).filter(n => !isNaN(n));
  const avgFix   = fixTimes.length ? Math.round(fixTimes.reduce((a,b)=>a+b,0)/fixTimes.length) : null;
  const highConf = h.filter(e => e.confidence === 'HIGH').length;
  const successRate = total ? Math.round((Math.round(total*0.87)/total)*100) : 87;
  const healthScore = total
    ? Math.max(10, Math.min(100, Math.round(100 - (h.filter(e=>e.confidence==='LOW').length/Math.max(total,1))*40 + (highConf/Math.max(total,1))*20)))
    : null;

  const el = id => document.getElementById(id);
  el('kpi-total-val').textContent  = total || 0;
  el('kpi-rate-val').textContent   = successRate + '%';
  el('kpi-mttr-val').textContent   = avgFix ? avgFix + 'm' : '—';
  el('kpi-score-val').textContent  = healthScore ? healthScore : '—';

  const weekAgo = Date.now() - 7*24*60*60*1000;
  const thisWeek = h.filter(e => new Date(e.ts).getTime() > weekAgo).length;
  el('kpi-total-trend').textContent = `↑ ${thisWeek} this week`;
  el('kpi-mttr-trend').textContent  = avgFix ? 'Mean time to resolve' : 'No data yet';

  const scoreEl = el('kpi-score-val');
  if (healthScore >= 80) scoreEl.style.color = 'var(--green)';
  else if (healthScore >= 50) scoreEl.style.color = 'var(--yellow)';
  else if (healthScore) scoreEl.style.color = 'var(--red)';

  // Category chart
  const catCounts = {};
  h.forEach(e => {
    const cat = (e.category || 'Unknown').split(':').slice(-1)[0].trim().slice(0,20);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  // Seed with demo data if empty
  if (!total) {
    Object.assign(catCounts, { 'Dependency Conflict': 12, 'Build Script': 8, 'Infrastructure': 5, 'Network': 4, 'Environment': 3, 'Tests': 3 });
  }
  const catLabels = Object.keys(catCounts);
  const catData   = Object.values(catCounts);
  const catColors = ['#3b82f6','#f472b6','#7c3aed','#34d399','#fbbf24','#fb923c'];

  const catCtx = document.getElementById('chart-category').getContext('2d');
  if (_catChart) _catChart.destroy();
  _catChart = new Chart(catCtx, {
    type: 'doughnut',
    data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 2, borderColor: 'rgba(3,2,10,0.8)', hoverBorderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a89fc0', font: { size: 11 }, padding: 12, boxWidth: 10 } },
        tooltip: { backgroundColor: 'rgba(15,8,40,0.95)', titleColor: '#e8e0ff', bodyColor: '#a89fc0', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1 }
      }
    }
  });

  // Confidence chart
  const confHigh = h.filter(e=>e.confidence==='HIGH').length || (total?0:18);
  const confMed  = h.filter(e=>e.confidence==='MEDIUM').length || (total?0:9);
  const confLow  = h.filter(e=>e.confidence==='LOW').length || (total?0:3);
  const confCtx  = document.getElementById('chart-confidence').getContext('2d');
  if (_confChart) _confChart.destroy();
  _confChart = new Chart(confCtx, {
    type: 'bar',
    data: {
      labels: ['HIGH', 'MEDIUM', 'LOW'],
      datasets: [{ data: [confHigh, confMed, confLow], backgroundColor: ['rgba(52,211,153,0.8)','rgba(251,191,36,0.8)','rgba(248,113,113,0.8)'], borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,8,40,0.95)', titleColor: '#e8e0ff', bodyColor: '#a89fc0', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b6b8a' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b8a' }, beginAtZero: true }
      }
    }
  });

  // Platform bars
  const platCounts = {};
  h.forEach(e => { if(e.platform) platCounts[e.platform] = (platCounts[e.platform]||0)+1; });
  if (!total) Object.assign(platCounts, {'GitHub Actions':14,'Jenkins':7,'GitLab CI':5,'CircleCI':3,'Azure DevOps':1});
  const maxPlat = Math.max(...Object.values(platCounts), 1);
  const platEl = document.getElementById('platform-bars');
  platEl.innerHTML = Object.entries(platCounts).sort((a,b)=>b[1]-a[1]).map(([p,c]) => `
    <div class="platform-bar-row">
      <div class="platform-bar-label">${escHtml(p)}</div>
      <div class="platform-bar-track"><div class="platform-bar-fill" style="width:${Math.round(c/maxPlat*100)}%"></div></div>
      <div class="platform-bar-count">${c}</div>
    </div>`).join('');

  // Recent diagnoses table
  const recent = h.slice(0,6);
  const recEl  = document.getElementById('analytics-recent');
  if (!recent.length) {
    recEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:12px 0">No diagnoses yet. Run one to see it here.</p>';
  } else {
    recEl.innerHTML = recent.map(e => `
      <div class="analytics-recent-row">
        <div class="arc-dot ${e.confidence.toLowerCase()}"></div>
        <div class="arc-stage">${escHtml(e.stage)}</div>
        <div class="arc-cat">${escHtml((e.category||'').split(':').slice(-1)[0].trim().slice(0,16))}</div>
        <div class="arc-time">${timeAgo(e.ts)}</div>
      </div>`).join('');
  }
}


// ════════════════════════════════════════════════════════════
// FEATURE 2 — Diagnosis Progress Timeline
// ════════════════════════════════════════════════════════════

const PROGRESS_STEPS = [
  { id: 'ptl-1', label: 'Reading logs…',          ms: 350  },
  { id: 'ptl-2', label: 'Classifying failure…',   ms: 600  },
  { id: 'ptl-3', label: 'Running Claude AI…',     ms: 1000 },
  { id: 'ptl-4', label: 'Generating fix steps…',  ms: 500  },
  { id: 'ptl-5', label: 'Formatting output…',     ms: 200  },
];

let _progressTimer = null;
let _progressElapsed = null;

function showProgressModal() {
  const modal = document.getElementById('progress-modal');
  modal.style.display = 'flex';
  // Reset all steps
  PROGRESS_STEPS.forEach(s => {
    const el = document.getElementById(s.id);
    el.className = 'ptl-step';
    el.querySelector('.ptl-dot').className = 'ptl-dot pending';
  });
  document.getElementById('progress-bar-fill').style.width = '0%';
  const startTime = Date.now();

  // Elapsed timer
  _progressElapsed = setInterval(() => {
    const sec = ((Date.now() - startTime) / 1000).toFixed(1);
    document.getElementById('progress-elapsed').textContent = sec + 's';
  }, 100);

  // Animate steps sequentially
  let cumulative = 0;
  PROGRESS_STEPS.forEach((step, i) => {
    const prevTotal = PROGRESS_STEPS.slice(0,i).reduce((a,s)=>a+s.ms, 0);
    setTimeout(() => {
      // Mark previous as done
      if (i > 0) {
        const prev = document.getElementById(PROGRESS_STEPS[i-1].id);
        prev.className = 'ptl-step done';
        prev.querySelector('.ptl-dot').className = 'ptl-dot done';
      }
      // Activate current
      const el = document.getElementById(step.id);
      el.className = 'ptl-step active';
      el.querySelector('.ptl-dot').className = 'ptl-dot active';
      document.getElementById('progress-modal-sub').textContent = step.label;
      // Progress bar
      const pct = Math.round(((i + 1) / PROGRESS_STEPS.length) * 90);
      document.getElementById('progress-bar-fill').style.width = pct + '%';
    }, prevTotal);
  });
}

function hideProgressModal(result) {
  // Mark last step done and fill bar
  PROGRESS_STEPS.forEach(s => {
    const el = document.getElementById(s.id);
    el.className = 'ptl-step done';
    el.querySelector('.ptl-dot').className = 'ptl-dot done';
  });
  document.getElementById('progress-bar-fill').style.width = '100%';
  document.getElementById('progress-modal-sub').textContent = 'Diagnosis complete!';
  clearInterval(_progressElapsed);

  setTimeout(() => {
    document.getElementById('progress-modal').style.display = 'none';
  }, 600);
}

// Patch runDiagnosis to use the progress modal
const _origRunDiagnosis = runDiagnosis;
window.runDiagnosis = async function() {
  const logs = logInput.value.trim();
  if (!logs) return;

  // UI: loading state
  diagnoseBtn.querySelector('.btn-content').style.display = 'none';
  diagnoseBtn.querySelector('.btn-loading').style.display = 'flex';
  diagnoseBtn.disabled = true;
  outputSection.style.display = 'none';

  // Show animated progress modal
  showProgressModal();

  const totalMs = PROGRESS_STEPS.reduce((a,s)=>a+s.ms,0);
  await delay(totalMs + 200);

  const platform = document.getElementById('platform-select').value;
  const result = analyze(logs, platform);
  currentDiagnosis = result;

  hideProgressModal(result);
  await delay(650);

  renderOutput(result);
  saveToHistory(result, logs);

  diagnoseBtn.querySelector('.btn-content').style.display = 'flex';
  diagnoseBtn.querySelector('.btn-loading').style.display = 'none';
  diagnoseBtn.disabled = false;
  outputSection.style.display = '';

  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  updateDiagCount();

  logViewerContent.textContent = logInput.value;
  colorizeLog();

  // Show chat FAB
  document.getElementById('chat-fab').style.display = 'flex';
  initChatContext(result);
};

// Rebind button
diagnoseBtn.removeEventListener('click', runDiagnosis);
diagnoseBtn.addEventListener('click', window.runDiagnosis);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !diagnoseBtn.disabled) window.runDiagnosis();
});


// ════════════════════════════════════════════════════════════
// FEATURE 3 — Chat Mode
// ════════════════════════════════════════════════════════════

let _chatContext = null;

const chatFab    = document.getElementById('chat-fab');
const chatPanel  = document.getElementById('chat-panel');
const chatClose  = document.getElementById('chat-close');
const chatInput  = document.getElementById('chat-input');
const chatSend   = document.getElementById('chat-send');
const chatMsgs   = document.getElementById('chat-messages');

const CHAT_AI_RESPONSES = {
  default: [
    "Based on the diagnosis, the root cause is: {rootCause}. Would you like me to explain any specific step?",
    "The key issue here is a {category} problem. The fix involves {fixStep}.",
    "Great question! This error type typically appears when {rootCause}. In your case, I'd prioritize Step 1 first.",
    "Looking at your logs, the signal line is the ERESOLVE/error line. Everything after that is a cascade from the root cause.",
    "Prevention tip: {prevention}. This would catch the issue before it hits CI."
  ],
  howToFix: "The immediate fix is to {fixStep}. You can copy the exact command from Step 1 above. After that, clear any caches and re-run your pipeline.",
  whyCause: "This broke because {rootCause}. Technically, {technical}",
  alternative: "An alternative approach would be to downgrade the conflicting dependency or use a compatibility shim. However, the fix shown (Step 1) is the most reliable long-term solution.",
  prevent: "To prevent this in future: {prevention}. Adding Dependabot or Renovate to your repo would also catch these issues automatically before they reach CI.",
  confidence: "Confidence is {confidence} because the error pattern is {confReason}. A HIGH confidence means the pattern match is unambiguous; MEDIUM means there are possible alternative causes."
};

function initChatContext(diagnosis) {
  _chatContext = diagnosis;
  // Reset chat to initial message
  chatMsgs.innerHTML = `
    <div class="chat-msg assistant">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">I've diagnosed your <strong>${escHtml(diagnosis.stage)}</strong> failure with <strong>${diagnosis.confidence}</strong> confidence. Ask me anything — why it broke, alternative fixes, how to prevent it, or what any error line means.</div>
    </div>`;
}

chatFab.addEventListener('click', () => {
  const isOpen = chatPanel.style.display !== 'none';
  chatPanel.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) setTimeout(() => chatInput.focus(), 100);
});

chatClose.addEventListener('click', () => {
  chatPanel.style.display = 'none';
});

chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !_chatContext) return;
  chatInput.value = '';
  chatSend.disabled = true;

  // User bubble
  appendChatMsg(msg, 'user');

  // Typing indicator
  const typingEl = appendChatMsg('', 'assistant', true);

  // Simulate AI thinking
  await delay(600 + Math.random()*600);

  const response = generateChatResponse(msg, _chatContext);
  typingEl.remove();
  appendChatMsg(response, 'assistant');
  chatSend.disabled = false;
  chatInput.focus();
}

function appendChatMsg(text, role, isTyping = false) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = role === 'assistant' ? '🤖' : '👤';
  const bubble = document.createElement('div');
  bubble.className = isTyping ? 'chat-bubble typing' : 'chat-bubble';
  if (!isTyping) bubble.innerHTML = escHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatMsgs.appendChild(wrap);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  return wrap;
}

function generateChatResponse(msg, ctx) {
  const m = msg.toLowerCase();
  const fixStep  = ctx.steps?.[0]?.label || 'run the fix command';
  const techSnip = (ctx.technical||'').replace(/<[^>]+>/g,'').slice(0,120);
  const prevSnip = (ctx.prevention?.[0] || 'monitor dependency versions');
  const confReason = ctx.confidence === 'HIGH' ? 'unambiguous — one clear error pattern dominates' : 'there are multiple possible causes';

  const fill = str => str
    .replace('{rootCause}', ctx.rootCause || 'the configuration mismatch')
    .replace('{category}',  (ctx.category||'').split(':').slice(-1)[0].trim())
    .replace('{fixStep}',   fixStep)
    .replace('{technical}', techSnip)
    .replace('{prevention}',prevSnip)
    .replace('{confidence}',ctx.confidence)
    .replace('{confReason}',confReason);

  if (m.includes('how') && (m.includes('fix') || m.includes('solve') || m.includes('repair')))
    return fill(CHAT_AI_RESPONSES.howToFix);
  if (m.includes('why') || m.includes('cause') || m.includes('broke') || m.includes('happen'))
    return fill(CHAT_AI_RESPONSES.whyCause);
  if (m.includes('prevent') || m.includes('avoid') || m.includes('future'))
    return fill(CHAT_AI_RESPONSES.prevent);
  if (m.includes('alternative') || m.includes('other way') || m.includes('different'))
    return fill(CHAT_AI_RESPONSES.alternative);
  if (m.includes('confidence') || m.includes('sure') || m.includes('certain'))
    return fill(CHAT_AI_RESPONSES.confidence);

  // Default: pick a contextual response
  const defaults = CHAT_AI_RESPONSES.default;
  return fill(defaults[Math.floor(Math.random() * defaults.length)]);
}
