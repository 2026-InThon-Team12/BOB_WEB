// Progressive enhancement: keep all information readable without motion or JS.
const landing = document.querySelector('#landing');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (landing && 'IntersectionObserver' in window) {
  const reveals = landing.querySelectorAll('[data-reveal]');
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const element of reveals) revealObserver.observe(element);
  if (!reducedMotion.matches) landing.classList.add('motion-ready');
  reducedMotion.addEventListener('change', () => {
    landing.classList.toggle('motion-ready', !reducedMotion.matches);
  });
  landing.addEventListener('focusin', event => {
    if (event.target instanceof Element) {
      event.target.closest('[data-reveal]')?.classList.add('is-visible');
    }
  });
  const links = landing.querySelectorAll('.step-nav a');
  const stepObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        if (link.getAttribute('href') === `#${entry.target.id}`) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-20% 0px -45% 0px' });
  for (const step of landing.querySelectorAll('.story-step')) stepObserver.observe(step);
}
