const PAGE_PATHS = {
  home: "/",
  parse: "/parse",
  profile: "/profile",
  redeem: "/redeem",
};

const HOME_SECTION_IDS = new Set([
  "home",
  "features",
  "pricing",
  "faq",
  "contact",
]);

export function getPageFromPath(pathname = "/") {
  return (
    Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)?.[0] ||
    "home"
  );
}

export function getPathForPage(page) {
  return PAGE_PATHS[page] || PAGE_PATHS.home;
}

export function isHomeSection(sectionId) {
  return HOME_SECTION_IDS.has(sectionId);
}
