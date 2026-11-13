// Small inline SVG icons. They inherit the text colour (stroke="currentColor")
// and are hidden from screen readers, because every icon sits next to a text label.

function Icon({ children, size = 18 }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (props) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeft = (props) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const Shuffle = (props) => (
  <Icon {...props}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </Icon>
);

export const Flip = (props) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
  </Icon>
);

export const Check = (props) => (
  <Icon {...props}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Icon>
);

export const Cross = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const Trash = (props) => (
  <Icon {...props}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const Alert = (props) => (
  <Icon {...props}>
    <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

/** The brand mark: two stacked cards. */
export function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="4" y="6" width="19" height="14" rx="3" className="logo__back" />
      <rect x="9" y="12" width="19" height="14" rx="3" className="logo__front" />
    </svg>
  );
}

/**
 * Header artwork: a fanned stack of flashcards with a score chip. It is drawn
 * with plain elements and CSS (no image file), and it is abstract on purpose:
 * bars stand in for text, so it stays crisp at any size.
 */
export function HeroDeck() {
  return (
    <div className="deck">
      <div className="deck__card deck__card--back" />
      <div className="deck__card deck__card--mid" />
      <div className="deck__card deck__card--front">
        <span className="deck__bar deck__bar--tag" />
        <span className="deck__bar" />
        <span className="deck__bar deck__bar--short" />
        <span className="deck__badge">
          <Flip />
        </span>
      </div>
      <div className="deck__chip">
        <span className="deck__chip-icon">
          <Check />
        </span>
        4 of 5 correct
      </div>
    </div>
  );
}
