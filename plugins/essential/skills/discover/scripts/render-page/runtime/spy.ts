/**
 * marks the drawer's nav link for whichever section is being read
 * @param drawer the drawer root, which holds the nav
 */
export function installSectionSpy(drawer: HTMLElement): void {
  const links = [...drawer.querySelectorAll<HTMLElement>(".drawer-nav a")];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        for (const link of links)
          if (link.getAttribute("href") === `#${entry.target.id}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-20% 0px -70% 0px" },
  );

  for (const section of document.querySelectorAll("[data-section]"))
    observer.observe(section);
}
