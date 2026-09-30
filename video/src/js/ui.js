// Kit d'interface : composants reconstruits en HTML d'après les vraies
// captures de l'application (mêmes couleurs, rayons, typo Inter, libellés),
// pour pouvoir les animer élément par élément là où une capture figée ne
// suffit pas (bulles qui arrivent, notifications, badges, statuts…).
(() => {
  const { icon, logoSVG } = DC;
  const SHOTS = "../application/presentation/shots/";
  const AVATARS = "assets/avatars/";

  const avatar = (who, size = 36, extra = "") => {
    const photo = { karim: 1, ines: 1, nathan: 1, sophie: 1, lucas: 1, emma: 1, jean: 1 }[who];
    if (photo) return `<span class="av ${extra}" style="--s:${size}px"><img src="${AVATARS}${who}.jpg" alt=""></span>`;
    const [initials, tint] = who.split(":");
    return `<span class="av av-ini av-${tint || "violet"} ${extra}" style="--s:${size}px">${initials}</span>`;
  };

  const avatarStack = (list, size = 30) => `<span class="av-stack">${list.map((w) => avatar(w, size)).join("")}</span>`;

  const pill = (text, kind = "teal", ic = "") =>
    `<span class="pill pill-${kind}">${ic ? icon(ic, { size: 14, stroke: 2.2 }) : ""}${text}</span>`;

  const statusPill = (text, kind) => `<span class="status status-${kind}"><i></i>${text}</span>`;

  const statusBar = (dark = false) => `
    <div class="sbar ${dark ? "sbar-dark" : ""}">
      <span class="sbar-time">9:41</span>
      <span class="sbar-right">
        <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.4A10.4 10.4 0 0 0 8 .3 10.4 10.4 0 0 0 .7 3.2L2 4.6a8.5 8.5 0 0 1 6-2.4Zm0 3.8c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.8 6.8 0 0 0 8 4.1c-1.8 0-3.4.7-4.7 1.8l1.3 1.4C5.5 6.5 6.7 6 8 6Zm0 3.7L9.9 7.8a2.9 2.9 0 0 0-3.8 0L8 9.7Z"/></svg>
        <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" opacity=".45"/></svg>
      </span>
    </div>`;

  const tabBar = (active = "Messagerie", badge = 0) => {
    const tabs = [
      ["Accueil", "home"],
      ["Planning", "calendar-days"],
      ["Missions", "briefcase"],
      ["Messagerie", "message-circle"],
      ["Menu", "menu"],
    ];
    const menuIcon = `<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
    const homeIcon = `<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
    return `<div class="tabbar">${tabs
      .map(([label, ic]) => {
        const svg = ic === "menu" ? menuIcon : ic === "home" ? homeIcon : icon(ic, { size: 24, stroke: 1.8 });
        const b = label === "Messagerie" && badge ? `<b class="tab-badge">${badge}</b>` : "";
        return `<span class="tab ${label === active ? "on" : ""}">${svg}${b}<em>${label}</em></span>`;
      })
      .join("")}</div>`;
  };

  /** Coque de téléphone ; `inner` = HTML de l'écran (390 × 882 logiques). */
  const phone = (inner, cls = "") => `
    <div class="phone ${cls}">
      <div class="phone-edge"></div>
      <div class="phone-body">
        <div class="phone-screen">${inner}<div class="phone-island"></div><div class="phone-glare"></div></div>
      </div>
      <i class="phone-btn b1"></i><i class="phone-btn b2"></i><i class="phone-btn b3"></i>
    </div>`;

  /** Écran à partir d'une vraie capture de l'application (+ barre d'état). */
  const shotScreen = (file, dark = false) =>
    `<div class="screen shot ${dark ? "dark" : ""}">${statusBar(dark)}<img class="shot-img" src="${SHOTS}${file}" alt=""></div>`;

  const browser = (inner, url = "deepclean.app", cls = "") => `
    <div class="browser ${cls}">
      <div class="browser-bar">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="url">${icon("lock", { size: 13, stroke: 2.4 })}${url}</span>
        <span class="bar-spacer"></span>
      </div>
      <div class="browser-content">${inner}</div>
    </div>`;

  const bubble = (text, side = "in", time = "17:36", cls = "") =>
    `<div class="bubble ${side} ${cls}"><span class="bubble-text">${text}</span><span class="bubble-time">${time}${side === "out" ? icon("check-check", { size: 15, stroke: 2.2 }) : ""}</span></div>`;

  const typing = (side = "in") => `<div class="bubble ${side} typing"><i></i><i></i><i></i></div>`;

  const appIcon = (size = 64, cls = "") =>
    `<span class="app-icon ${cls}" style="--s:${size}px">${logoSVG({ fill: "#fff" })}</span>`;

  const toast = ({ title, body, time = "maintenant", ic = "bell", cls = "" }) => `
    <div class="toast ${cls}">
      ${appIcon(40)}
      <div class="toast-main">
        <div class="toast-top"><b>DEEP CLEAN</b><span>${time}</span></div>
        <div class="toast-title">${icon(ic, { size: 16, stroke: 2.2 })}${title}</div>
        <div class="toast-body">${body}</div>
      </div>
    </div>`;

  const missionCard = ({
    title,
    place,
    day = "Aujourd'hui",
    hours,
    people = [],
    count,
    status = ["PLANIFIÉE", "teal"],
    live = false,
    cls = "",
  }) => `
    <div class="mcard ${live ? "live" : ""} ${cls}">
      <div class="mcard-row">
        <span class="mcard-ic ${live ? "orange" : ""}">${live ? `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>` : icon("calendar-days", { size: 20, stroke: 1.9 })}</span>
        <div class="mcard-main">
          <div class="mcard-title">${title}</div>
          <div class="mcard-place">${icon("map-pin", { size: 15, stroke: 1.9 })}${place}</div>
          <div class="mcard-pills">${pill(day, live ? "orange" : "teal", "calendar-days")}${pill(hours, "grey", "clock")}</div>
          <div class="mcard-foot">${avatarStack(people, 28)}<span class="mcard-count">${count} personnes</span>${statusPill(status[0], status[1])}</div>
        </div>
      </div>
    </div>`;

  const fileChip = ({ name, meta, kind = "pdf", cls = "" }) => `
    <div class="file ${cls}">
      <span class="file-ic file-${kind}">${icon(kind === "img" ? "image" : kind === "xls" ? "file-spreadsheet" : "file-text", { size: 22, stroke: 1.9 })}</span>
      <span class="file-main"><b>${name}</b><em>${meta}</em><span class="file-bar"><i></i></span></span>
      <span class="file-ok">${icon("check", { size: 16, stroke: 3 })}</span>
    </div>`;

  window.UI = {
    SHOTS,
    avatar,
    avatarStack,
    pill,
    statusPill,
    statusBar,
    tabBar,
    phone,
    shotScreen,
    browser,
    bubble,
    typing,
    appIcon,
    toast,
    missionCard,
    fileChip,
  };
})();
