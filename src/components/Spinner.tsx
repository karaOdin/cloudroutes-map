
interface SpinnerProps {
  size?: "small" | "medium" | "large";
  color?: "white" | "primary" | "gray";
  className?: string;
}

export function Spinner({
  size = "medium",
  color = "white",
  className = "",
}: SpinnerProps) {
  const sizeClass =
    size === "small"
      ? "spinner-small"
      : size === "large"
        ? "spinner-large"
        : "spinner";
  const colorClass = color === "primary" ? "spinner-primary" : "";

  return <div className={`${sizeClass} ${colorClass} ${className}`} />;
}

interface LoadingProps {
  text?: string;
  size?: "small" | "medium" | "large";
}

export function Loading({
  text = "Loading...",
  size = "medium",
}: LoadingProps) {
  return (
    <div className="loading-container">
      <Spinner size={size} color="primary" />
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
}

interface InlineSpinnerProps {
  className?: string;
}

export function InlineSpinner({ className = "" }: InlineSpinnerProps) {
  return <span className={`inline-spinner ${className}`} />;
}
