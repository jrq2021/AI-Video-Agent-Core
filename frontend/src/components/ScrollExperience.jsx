import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const STEP_SECTION_IDS = [
  "home",
  "download-workspace",
  "features",
  "pricing",
  "faq",
  "contact",
];

const REVEAL_GROUPS = [
  {
    section: "#download-workspace",
    heading: ".section-heading",
    content: ".video-input-panel",
  },
  {
    section: "#pricing",
    heading: ".section-heading",
    content: ".pricing-section__tools, .pricing-grid",
  },
  {
    section: "#faq",
    heading: ".section-heading",
    content: ".faq-list",
  },
  {
    section: "#contact",
    heading: ".section-heading",
    content: ".contact-section .grid, .contact-section .legal-note",
  },
];

const SNAP_DELAY = 180;
const SNAP_MIN_DELTA = 28;
const SNAP_MAX_DISTANCE = 240;
const SNAP_VIEWPORT_RATIO = 0.22;
const SNAP_BOTTOM_GUARD = 280;

function getDocumentTop(element) {
  return element.getBoundingClientRect().top + window.scrollY;
}

function getMaxScrollTop() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  return Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
}

function getStepSections() {
  return STEP_SECTION_IDS.map((id) => document.getElementById(id)).filter(
    Boolean,
  );
}

function getNearestSnapTop() {
  const maxDistance = Math.min(
    SNAP_MAX_DISTANCE,
    window.innerHeight * SNAP_VIEWPORT_RATIO,
  );
  const currentTop = window.scrollY;
  const maxScrollTop = getMaxScrollTop();
  let nearest = null;

  if (maxScrollTop - currentTop <= SNAP_BOTTOM_GUARD) {
    return null;
  }

  getStepSections().forEach((section) => {
    const top = getDocumentTop(section);
    const distance = Math.abs(top - currentTop);

    if (!nearest || distance < nearest.distance) {
      nearest = { top, distance };
    }
  });

  if (
    !nearest ||
    nearest.distance < SNAP_MIN_DELTA ||
    nearest.distance > maxDistance
  ) {
    return null;
  }

  return nearest.top;
}

export default function ScrollExperience() {
  useLayoutEffect(() => {
    const media = gsap.matchMedia();

    media.add(
      {
        desktop: "(min-width: 769px)",
        mobile: "(max-width: 768px)",
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { desktop, reduceMotion } = context.conditions;
        if (!desktop || reduceMotion) return undefined;

        let snapTimer;
        let isSnapping = false;

        const gsapContext = gsap.context(() => {
          gsap.to(".cinematic-hero__video", {
            yPercent: 9,
            scale: 1.075,
            ease: "none",
            scrollTrigger: {
              trigger: "#home",
              start: "top top",
              end: "bottom top",
              scrub: 0.22,
              invalidateOnRefresh: true,
            },
          });

          gsap.to(".cinematic-hero__copy", {
            yPercent: -11,
            autoAlpha: 0.45,
            ease: "none",
            scrollTrigger: {
              trigger: "#home",
              start: "top top",
              end: "bottom 18%",
              scrub: 0.2,
              invalidateOnRefresh: true,
            },
          });

          REVEAL_GROUPS.forEach(({ section, heading, content }) => {
            const sectionElement = document.querySelector(section);
            if (!sectionElement) return;

            const headingElement = sectionElement.querySelector(heading);
            const contentElements = sectionElement.querySelectorAll(content);

            if (headingElement) {
              gsap.from(
                headingElement,
                {
                  y: 32,
                  autoAlpha: 0,
                  duration: 0.72,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: sectionElement,
                    start: "top 82%",
                    once: true,
                    invalidateOnRefresh: true,
                  },
                },
              );
            }

            if (contentElements.length) {
              gsap.from(
                contentElements,
                {
                  y: 24,
                  autoAlpha: 0,
                  scale: 0.992,
                  duration: 0.76,
                  stagger: 0.08,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: sectionElement,
                    start: "top 72%",
                    once: true,
                    invalidateOnRefresh: true,
                  },
                },
              );
            }
          });

        });

        const snapToNearestSection = () => {
          if (isSnapping) return;

          const targetTop = getNearestSnapTop();
          if (targetTop === null) return;

          isSnapping = true;

          gsap.to(window, {
            scrollTo: {
              y: targetTop,
              autoKill: true,
            },
            duration: 0.42,
            ease: "power2.out",
            overwrite: true,
            onComplete: () => {
              isSnapping = false;
              ScrollTrigger.update();
            },
            onInterrupt: () => {
              isSnapping = false;
            },
          });
        };

        const scheduleSnap = () => {
          if (isSnapping) return;

          window.clearTimeout(snapTimer);
          snapTimer = window.setTimeout(snapToNearestSection, SNAP_DELAY);
        };

        window.addEventListener("scroll", scheduleSnap, { passive: true });

        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener("load", refresh, { once: true });
        requestAnimationFrame(refresh);

        return () => {
          window.clearTimeout(snapTimer);
          window.removeEventListener("scroll", scheduleSnap);
          window.removeEventListener("load", refresh);
          gsap.killTweensOf(window);
          gsapContext.revert();
        };
      },
    );

    return () => media.revert();
  }, []);

  return null;
}
