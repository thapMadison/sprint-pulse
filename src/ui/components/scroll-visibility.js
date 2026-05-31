// Toggle a `.visible` class on a floating element based on scroll position,
// shared by the refresh and view-tabs FABs. The FAB appears once its in-flow
// counterpart (`anchorSelector`) has scrolled above the top edge of the
// viewport; if that anchor isn't mounted, it falls back to a fixed scroll
// threshold. Returns a cleanup function that removes the scroll listener.
export function attachScrollVisibility(fab, { anchorSelector, fallbackScrollY }) {
  let visible = false;
  function update() {
    const anchor = document.querySelector(anchorSelector);
    const shouldShow = anchor
      ? anchor.getBoundingClientRect().bottom <= 8
      : window.scrollY > fallbackScrollY;
    if (shouldShow !== visible) {
      visible = shouldShow;
      fab.classList.toggle('visible', visible);
    }
  }
  update();

  const onScroll = () => requestAnimationFrame(update);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}
