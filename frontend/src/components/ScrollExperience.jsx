import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const REVEAL_GROUPS = [
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

export default function ScrollExperience({ scrollerRef }) {
  useLayoutEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return undefined;

    const media = gsap.matchMedia();

    media.add(
      {
        desktop: "(min-width: 769px)",
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { desktop, reduceMotion } = context.conditions;
        if (!desktop || reduceMotion) return undefined;

        const gsapContext = gsap.context(() => {
          gsap.to(".cinematic-hero__video", {
            yPercent: 9,
            scale: 1.075,
            ease: "none",
            scrollTrigger: {
              trigger: "#home",
              scroller,
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
              scroller,
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
              gsap.from(headingElement, {
                y: 32,
                autoAlpha: 0,
                duration: 0.72,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: sectionElement,
                  scroller,
                  start: "top 82%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });
            }

            if (contentElements.length) {
              gsap.from(contentElements, {
                y: 24,
                autoAlpha: 0,
                scale: 0.992,
                duration: 0.76,
                stagger: 0.08,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: sectionElement,
                  scroller,
                  start: "top 72%",
                  once: true,
                  invalidateOnRefresh: true,
                },
              });
            }
          });
        }, scroller);

        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener("load", refresh, { once: true });
        requestAnimationFrame(refresh);

        return () => {
          window.removeEventListener("load", refresh);
          gsapContext.revert();
        };
      },
    );

    return () => media.revert();
  }, [scrollerRef]);

  return null;
}
