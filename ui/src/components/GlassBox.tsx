type GlassBoxProps = React.PropsWithChildren &
  React.HtmlHTMLAttributes<HTMLDivElement>;

export default function GlassBox({ children, className }: GlassBoxProps) {
  const rounded = className?.includes("rounded") ? "" : "rounded-xl";
  return (
    <div
      className={`shadow-glass-box ${rounded} border border-white/30 bg-white/10 backdrop-blur-md ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
